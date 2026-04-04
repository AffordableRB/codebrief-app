import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeInput, validateInput } from "@/lib/sanitize";
import { getReportType, DEFAULT_REPORT_TYPE } from "@/lib/report-types";

const anthropic = new Anthropic();

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  "https://codebrief-app.vercel.app",
  "https://codecompliance-delta.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
].filter(Boolean);

interface ProjectInput {
  buildingType: string;
  location: string;
  squareFootage: string;
  stories: string;
  buildingHeight: string;
  constructionType: string;
  occupancyType: string;
  occupantLoad: string;
  lotSize: string;
  additionalNotes: string;
}

function buildUserPrompt(
  input: ProjectInput,
  searchResults: string,
  suffix: string
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const parts = [
    `TODAY'S DATE: ${today}`,
    ``,
    `PROJECT DETAILS:`,
    `- Building Type: ${input.buildingType}`,
    `- Location: ${input.location}`,
    `- Total Square Footage: ${input.squareFootage}`,
    `- Number of Stories: ${input.stories}`,
  ];
  if (input.buildingHeight) parts.push(`- Building Height: ${input.buildingHeight}`);
  if (input.constructionType) parts.push(`- Construction Type: ${input.constructionType}`);
  if (input.occupancyType) parts.push(`- Occupancy Type: ${input.occupancyType}`);
  if (input.occupantLoad) parts.push(`- Estimated Occupant Load: ${input.occupantLoad}`);
  if (input.lotSize) parts.push(`- Lot Size: ${input.lotSize}`);
  if (input.additionalNotes) parts.push(`- Additional Notes: ${input.additionalNotes}`);

  parts.push("");
  parts.push("WEB SEARCH RESULTS (use these to identify jurisdiction-specific requirements):");
  parts.push(searchResults);
  parts.push("");
  parts.push(suffix);
  return parts.join("\n");
}

export async function POST(req: Request) {
  try {
    // CORS check
    const origin = req.headers.get("origin") || "";
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limiting by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { allowed, remaining } = rateLimit(ip);
    if (!allowed) {
      return Response.json(
        { error: "Rate limit exceeded. Please wait a minute before generating another brief." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // Sanitize and validate input
    const rawInput = await req.json();
    const reportTypeId = rawInput.reportType || DEFAULT_REPORT_TYPE;
    const reportType = getReportType(reportTypeId);
    if (!reportType) {
      return Response.json({ error: "Invalid report type" }, { status: 400 });
    }

    const sanitized = sanitizeInput(rawInput);
    const validationError = validateInput(sanitized);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    const input: ProjectInput = {
      buildingType: sanitized.buildingType,
      location: sanitized.location,
      squareFootage: sanitized.squareFootage,
      stories: sanitized.stories,
      buildingHeight: sanitized.buildingHeight || "",
      constructionType: sanitized.constructionType || "",
      occupancyType: sanitized.occupancyType,
      occupantLoad: sanitized.occupantLoad,
      lotSize: sanitized.lotSize,
      additionalNotes: sanitized.additionalNotes,
    };

    // Phase 1: Web search — use report-type-specific queries
    const queries = reportType.searchQueries({
      location: input.location,
      buildingType: input.buildingType,
      occupancyType: input.occupancyType,
    });
    const { searchResults, searchLog } = await performSearches(queries);

    // Phase 2: LLM synthesis — use report-type-specific prompt
    const userPrompt = buildUserPrompt(input, searchResults, reportType.userPromptSuffix);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: reportType.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const encoder = new TextEncoder();
    // Send metadata header as first chunk, separated by a delimiter
    const DELIMITER = "\n<!--CODEBRIEF_METADATA_END-->\n";
    const metadata = JSON.stringify({
      searchQueries: queries,
      searchLog,
      reportType: reportTypeId,
      reportName: reportType.name,
      generatedAt: new Date().toISOString(),
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send metadata block first
          controller.enqueue(encoder.encode(metadata + DELIMITER));

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-RateLimit-Remaining": String(remaining),
        ...(origin && ALLOWED_ORIGINS.includes(origin)
          ? { "Access-Control-Allow-Origin": origin }
          : {}),
      },
    });
  } catch (err) {
    console.error("Generate brief error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

interface SearchLogEntry {
  query: string;
  status: "success" | "failed";
  summary: string;
}

async function performSearches(queries: string[]): Promise<{ searchResults: string; searchLog: SearchLogEntry[] }> {
  const results: string[] = [];
  const searchLog: SearchLogEntry[] = [];

  for (const query of queries) {
    try {
      const result = await webSearch(query);
      const summary = result
        ? result.slice(0, 200).replace(/\n/g, " ").trim() + (result.length > 200 ? "..." : "")
        : "No results found.";
      results.push(`\n--- Search: "${query}" ---\n${result || "No results found."}`);
      searchLog.push({ query, status: result ? "success" : "failed", summary });
    } catch {
      results.push(`\n--- Search: "${query}" ---\nNo results found.`);
      searchLog.push({ query, status: "failed", summary: "Search failed" });
    }
  }

  return { searchResults: results.join("\n"), searchLog };
}

async function webSearch(query: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Search for: ${query}\n\nReturn the most relevant factual information you find about building codes, zoning requirements, and regulations. Focus on specific code requirements, ordinance numbers, and regulatory details. Be concise but include specific numbers, section references, and requirements.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Web search API error for "${query}":`, errText);
    return "";
  }

  const data = await response.json();

  const textBlocks = data.content?.filter(
    (block: { type: string }) => block.type === "text"
  );
  return (
    textBlocks
      ?.map((block: { text: string }) => block.text)
      .join("\n") || ""
  );
}
