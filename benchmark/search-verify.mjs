// Search-based claim verifier
// Uses Anthropic's web search tool with site-restricted queries to verify claims
// against authoritative jurisdiction sources — no hand-built ground truth required.
//
// Returns verdicts: VERIFIED / FABRICATION / UNVERIFIABLE
// Caches results to disk (7-day TTL + prompt version check) to eliminate repeat API costs.

import fs from "fs";
import path from "path";
import { getCached, setCached } from "./cache.mjs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // Haiku is cheap and capable enough for verification

// ═══════════════════════════════════════════════════════════
// JURISDICTION CONFIG — authoritative domains for site-restricted search
// ═══════════════════════════════════════════════════════════

const JURISDICTION_DOMAINS = {
  "denver": ["denvergov.org", "denvergov.org/files", "denverwater.org"],
  "austin": ["austintexas.gov", "austin-tx.elaws.us"],
  "miami": ["miamigov.com", "miamidade.gov", "municode.com"],
  "portland": ["portland.gov", "portlandmaps.com"],
  "chicago": ["chicago.gov", "chicityclerk.com", "amlegal.com"],
};

const GENERIC_CODE_DOMAINS = [
  "iccsafe.org",
  "codes.iccsafe.org",
  "ada.gov",
  "nfpa.org",
];

// ═══════════════════════════════════════════════════════════
// SEARCH QUERY BUILDING
// ═══════════════════════════════════════════════════════════

function buildSearchQuery(claim, jurisdictionKey) {
  const domains = JURISDICTION_DOMAINS[jurisdictionKey] || [];
  const siteRestriction = domains.length > 0
    ? `(${domains.map((d) => `site:${d}`).join(" OR ")})`
    : "";

  // For section citations, search for the exact citation
  if (claim.type === "section-citation") {
    return `${siteRestriction} "${claim.text}"`.trim();
  }

  // For code versions, search for the exact version string
  if (claim.type === "code-version") {
    return `${siteRestriction} "${claim.text}"`.trim();
  }

  // For dollar figures and numerical requirements, search in context
  if (claim.type === "dollar-figure" || claim.type === "numerical-requirement") {
    const contextWords = (claim.context || "")
      .replace(/[^a-zA-Z0-9\s$.,%]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
      .join(" ");
    return `${siteRestriction} ${claim.text} ${contextWords}`.trim();
  }

  // For zoning districts, search for the exact designation
  if (claim.type === "zoning-district") {
    return `${siteRestriction} "${claim.text}" zoning`.trim();
  }

  // Generic fallback
  return `${siteRestriction} ${claim.text}`.trim();
}

// ═══════════════════════════════════════════════════════════
// ANTHROPIC API CALL WITH WEB SEARCH
// ═══════════════════════════════════════════════════════════

async function searchAndVerify(claim, jurisdictionKey) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const query = buildSearchQuery(claim, jurisdictionKey);

  const verificationPrompt = `You are verifying a specific claim from a building code analysis report. Use the web_search tool to check it against authoritative sources.

CLAIM TO VERIFY: "${claim.text}"
CLAIM TYPE: ${claim.type}
CONTEXT FROM REPORT: "${claim.context || "(no context)"}"
JURISDICTION: ${jurisdictionKey}

SEARCH QUERY TO USE: ${query}

After searching, you MUST end your response with a verdict line in this EXACT format:

VERDICT: VERIFIED
or
VERDICT: FABRICATION_SEVERE
or
VERDICT: FABRICATION_MINOR
or
VERDICT: UNVERIFIABLE

Definitions:

- VERIFIED — The search results explicitly confirm the claim on authoritative sources (the section exists, the code version matches, the designation is real and currently used or historically used)

- FABRICATION_SEVERE — The cited section, zone code, or specific figure does NOT EXIST AT ALL on authoritative sources. The claim was invented from nothing. Examples: citing a section number that has no matches anywhere, inventing a zone designation that no jurisdiction uses, citing a fee amount with no basis in any published schedule.

- FABRICATION_MINOR — The section or requirement EXISTS but is misattributed, misapplied, or describes the wrong content. Examples: citing §R404.5 for EV charging when §R404.5 actually covers additional electric infrastructure (the section is real, but its content is different from what the report claims); citing a rule as applying universally when it only applies to specific occupancy types; citing the right main section but wrong subsection number. Also use this for reasonable approximations that are technically imprecise but not dangerous (like estimating building footprint by dividing total area by stories).

- UNVERIFIABLE — Only when you genuinely cannot tell because the claim is too vague to search, the authoritative source is not on the web, or search results are ambiguous.

After the VERDICT line, add a REASON line with one sentence explaining, and a SOURCE line with the most relevant URL.

Format:
VERDICT: [verdict]
REASON: [one sentence]
SOURCE: [url or "none"]

Be strict but fair. Distinguish between dangerous fabrications (section doesn't exist at all) and minor misattributions (section exists but covers different content). Both are problems, but they have very different real-world impact.`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      temperature: 0, // Deterministic for reproducible benchmarks
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
          content: verificationPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return {
      verdict: "UNVERIFIABLE",
      reason: `API error: ${response.status}`,
      source: null,
      rawResponse: errText,
      error: true,
    };
  }

  const data = await response.json();
  const textBlocks = data.content?.filter((b) => b.type === "text") || [];
  const responseText = textBlocks.map((b) => b.text).join("\n").trim();

  // Parse the verdict from the structured response
  let verdict = "UNVERIFIABLE";
  let reason = "";
  let parsedSource = null;

  const verdictMatch = responseText.match(/VERDICT:\s*(VERIFIED|FABRICATION_SEVERE|FABRICATION_MINOR|FABRICATION|UNVERIFIABLE)/i);
  if (verdictMatch) {
    verdict = verdictMatch[1].toUpperCase();
    // Normalize plain "FABRICATION" to FABRICATION_SEVERE (backwards compat)
    if (verdict === "FABRICATION") verdict = "FABRICATION_SEVERE";
  } else {
    // Fallback: take the strongest signal from the text
    const upperText = responseText.toUpperCase();
    if (/\bFABRICATION_SEVERE\b/.test(upperText)) verdict = "FABRICATION_SEVERE";
    else if (/\bFABRICATION_MINOR\b/.test(upperText)) verdict = "FABRICATION_MINOR";
    else if (/\bFABRICATION\b/.test(upperText)) verdict = "FABRICATION_SEVERE";
    else if (/\bVERIFIED\b/.test(upperText) && !/NOT VERIFIED|UNVERIFIED/i.test(responseText)) verdict = "VERIFIED";
  }

  const reasonMatch = responseText.match(/REASON:\s*(.+?)(?:\n|SOURCE:|$)/is);
  if (reasonMatch) reason = reasonMatch[1].trim().slice(0, 300);

  const sourceMatch = responseText.match(/SOURCE:\s*(https?:\/\/[^\s\n]+)/i);
  if (sourceMatch) parsedSource = sourceMatch[1];

  // Fall back to finding any URL in the text if SOURCE line missing
  if (!parsedSource) {
    const urlMatch = responseText.match(/https?:\/\/[^\s)\]]+/);
    if (urlMatch) parsedSource = urlMatch[0];
  }

  // Fall back to first non-verdict text as reason
  if (!reason) {
    reason = responseText
      .replace(/VERDICT:\s*(VERIFIED|FABRICATION|UNVERIFIABLE)/gi, "")
      .replace(/SOURCE:\s*https?:\/\/[^\s\n]+/gi, "")
      .trim()
      .slice(0, 300);
  }

  return {
    verdict,
    reason,
    source: parsedSource,
    rawResponse: responseText,
    query,
  };
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export async function verifyClaim(claim, jurisdictionKey = "denver") {
  // Check cache first — free if we've seen this exact claim+jurisdiction before
  const cached = getCached(claim, jurisdictionKey);
  if (cached) {
    return cached;
  }

  try {
    const result = await searchAndVerify(claim, jurisdictionKey);
    // Only cache meaningful results (skip errors)
    if (!result.error) {
      setCached(claim, jurisdictionKey, result);
    }
    return result;
  } catch (err) {
    return {
      verdict: "UNVERIFIABLE",
      reason: `Verification error: ${err.message}`,
      source: null,
      error: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// CLI — test single claim
// ═══════════════════════════════════════════════════════════

const isMainModule = process.argv[1] && process.argv[1].endsWith("search-verify.mjs");
if (isMainModule) {
  const claimText = process.argv[2];
  const claimType = process.argv[3] || "section-citation";
  const jurisdiction = process.argv[4] || "denver";

  if (!claimText) {
    console.error("Usage: node search-verify.mjs <claim-text> [type] [jurisdiction]");
    console.error("Example: node search-verify.mjs 'C-MU' zoning-district denver");
    process.exit(1);
  }

  const claim = {
    text: claimText,
    type: claimType,
    context: process.argv[5] || "",
  };

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`Verifying claim: "${claim.text}"`);
  console.log(`Type: ${claim.type}`);
  console.log(`Jurisdiction: ${jurisdiction}`);
  console.log(`═══════════════════════════════════════════\n`);

  const result = await verifyClaim(claim, jurisdiction);

  console.log(`Query used: ${result.query}`);
  console.log(`\nVERDICT: ${result.verdict}`);
  console.log(`Reason: ${result.reason}`);
  if (result.source) console.log(`Source: ${result.source}`);
  console.log("");
}
