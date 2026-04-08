// LLM-based claim extractor
// Uses Haiku to read a report and extract ALL verifiable claims, including narrative ones
// that the regex extractor misses.
//
// This catches claims the regex can't:
// - "Denver requires a traffic impact study for projects over 100 units"
// - "A structural engineer is required for this building type"
// - "Permitting takes approximately 6 months in Denver"
// - "The project must comply with Denver Green Building Ordinance"

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

// ═══════════════════════════════════════════════════════════
// LLM EXTRACTION CACHE
// Same TTL/versioning approach as verification cache
// ═══════════════════════════════════════════════════════════

const EXTRACTION_CACHE_FILE = path.join(__dirname, "cache-data", "extraction-cache.json");
const EXTRACTION_PROMPT_VERSION = "v1-2026-04-05";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadExtractionCache() {
  if (!fs.existsSync(EXTRACTION_CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(EXTRACTION_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveExtractionCache(cache) {
  const dir = path.dirname(EXTRACTION_CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXTRACTION_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function reportHash(reportText) {
  return crypto.createHash("sha256").update(reportText).digest("hex").slice(0, 32);
}

// ═══════════════════════════════════════════════════════════
// EXTRACTION PROMPT
// ═══════════════════════════════════════════════════════════

const EXTRACTION_PROMPT = `You are extracting verifiable claims from an architectural code analysis report.

Your job: find every specific factual claim in the report that could be verified against authoritative sources. Return them as a JSON array.

CLAIMS TO EXTRACT (include these):
1. Code citations — any reference to IBC, IFC, IPC, IECC, ADA, NFPA, DZC, CBC, TAS, ASHRAE sections, tables, chapters, articles
2. Dollar figures — specific fee amounts, cost estimates, impact fees
3. Code versions — "2021 IBC", "2022 Denver Energy Code"
4. Zone district designations — "C-MX-5", "U-MX-3", "R-2"
5. Calculations — "8,000 SF ÷ 30 = 267 occupants"
6. Numerical requirements — "minimum 2 exits", "25,000 SF threshold", "180-day target"
7. Climate zones — "Zone 5B"
8. Performance values — "R-20 insulation", "U-0.40", "COP ≥ 1.5"
9. Narrative requirements — "Denver requires X for projects over Y"
10. Agency names — "Denver Permitting Office", "Colorado Department of Public Health"
11. Specific timelines — "6-8 weeks for review"
12. Building system requirements — "automatic sprinkler required"
13. Consultant discipline requirements — "structural engineer required"
14. Specific jurisdiction ordinances by name — "Denver Green Building Ordinance"

CLAIMS TO SKIP:
- Generic advice or recommendations
- Disclaimers
- Project data restated from input (building type, size, stories, location)
- Headers, table column labels, formatting
- Sources section URLs (those are references, not claims)

FOR EACH CLAIM, determine:
- type: one of [section-citation, dollar-figure, code-version, zoning-district, calculation, numerical-requirement, climate-zone, performance-value, efficiency-value, narrative-claim, agency-name, timeline, system-requirement, consultant-requirement, ordinance-name]
- text: the exact phrase from the report (keep it short — 1-15 words)
- context: the surrounding sentence or table row (for verification later)
- flagged: true if the claim appears with ⚠, "VERIFY", "TBD", "Unknown", or "verify with" nearby (indicates honest uncertainty, counts as neutral)

OUTPUT FORMAT:
Return ONLY a valid JSON array, nothing else. No markdown code blocks, no explanation. Just the array starting with [ and ending with ].

Example:
[
  {
    "type": "section-citation",
    "text": "IBC 2021 §903.2.1.1",
    "context": "Sprinklers required per IBC 2021 §903.2.1.1 for Group A occupancies",
    "flagged": false
  },
  {
    "type": "narrative-claim",
    "text": "Denver Green Building Ordinance applies to buildings over 25,000 SF",
    "context": "The Denver Green Building Ordinance applies to buildings over 25,000 SF and requires additional sustainability measures.",
    "flagged": false
  }
]

REPORT TO EXTRACT FROM:
───────────────────────
{{REPORT}}
───────────────────────

Return the JSON array now. Start with [ and include every verifiable claim.`;

// ═══════════════════════════════════════════════════════════
// EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════

async function callExtractionAPI(reportText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = EXTRACTION_PROMPT.replace("{{REPORT}}", reportText);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0, // Deterministic for reproducible benchmarks
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Extraction API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text in extraction response");

  // Parse the JSON array from the response
  const text = textBlock.text.trim();

  // Handle possible markdown code fences
  const jsonText = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    const claims = JSON.parse(jsonText);
    if (!Array.isArray(claims)) throw new Error("Expected array");
    return claims;
  } catch (err) {
    console.error("Failed to parse extraction response:", err.message);
    console.error("Raw response:", text.slice(0, 500));
    return [];
  }
}

export async function extractClaimsLLM(reportText, metadata = {}) {
  const hash = reportHash(reportText);
  const cache = loadExtractionCache();
  const cacheKey = `${EXTRACTION_PROMPT_VERSION}::${hash}`;

  // Check cache
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < TTL_MS) {
    return {
      claims: cached.claims,
      cached: true,
      metadata,
    };
  }

  // Call API
  const claims = await callExtractionAPI(reportText);

  // Ensure each claim has required fields
  const normalized = claims.map((c) => ({
    type: c.type || "narrative-claim",
    text: (c.text || "").trim(),
    context: (c.context || "").trim().slice(0, 300),
    weight: c.flagged ? 0 : 1.0,
    flagged: !!c.flagged,
  }));

  // Save to cache
  cache[cacheKey] = {
    timestamp: Date.now(),
    promptVersion: EXTRACTION_PROMPT_VERSION,
    claims: normalized,
  };
  saveExtractionCache(cache);

  return {
    claims: normalized,
    cached: false,
    metadata,
  };
}

// Returns a format compatible with the existing extractClaims() from extract-claims.mjs
export async function extractClaimsCompat(reportText, metadata = {}) {
  const result = await extractClaimsLLM(reportText, metadata);
  return {
    reportMetadata: metadata,
    totalClaims: result.claims.length,
    unflaggedClaims: result.claims.filter((c) => !c.flagged).length,
    flaggedClaims: result.claims.filter((c) => c.flagged).length,
    claims: result.claims,
    _cached: result.cached,
  };
}

// CLI
const isMainModule = process.argv[1] && process.argv[1].endsWith("extract-claims-llm.mjs");
if (isMainModule) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node extract-claims-llm.mjs <path-to-report.md>");
    process.exit(1);
  }

  const text = fs.readFileSync(inputPath, "utf-8");

  console.log(`\nExtracting claims from ${path.basename(inputPath)}...`);
  const startTime = Date.now();
  const result = await extractClaimsCompat(text, {
    source: path.basename(inputPath),
  });
  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  Report: ${path.basename(inputPath)}`);
  console.log(`  Duration: ${duration}s ${result._cached ? "(cached)" : "(new extraction)"}`);
  console.log(`  Total claims: ${result.totalClaims}`);
  console.log(`  Unflagged (verifiable): ${result.unflaggedClaims}`);
  console.log(`  Flagged with ⚠ VERIFY: ${result.flaggedClaims}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // Group by type
  const byType = {};
  for (const c of result.claims) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }
  console.log(`Claims by type:`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Show first 10 claims
  console.log(`\nFirst 10 claims:`);
  for (const c of result.claims.slice(0, 10)) {
    console.log(`  [${c.type}${c.flagged ? " ⚠" : ""}] "${c.text}"`);
  }
  console.log("");
}
