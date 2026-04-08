// Claim extractor — parses a generated report and returns structured verifiable claims
// Usage: node extract-claims.mjs <path-to-report.md>

import fs from "fs";
import path from "path";

const CLAIM_PATTERNS = [
  // Section citations: "IBC 2021 §903.2.1.1", "IBC Section 1004.5", "DZC §13.1.5.3"
  {
    type: "section-citation",
    regex: /\b(IBC|IFC|IPC|IECC|ADA|NFPA|DZC|CBC|TAS|ASHRAE)\s+(?:\d{4}\s+)?(?:§|Section|Chapter|Article|Table)\s*[\d.\-]+[A-Z]?(?:\.[\d.]+)?/gi,
    weight: 1.0,
  },
  // Dollar figures: "$1,940", "$85,000", "$5,385"
  {
    type: "dollar-figure",
    regex: /\$[\d,]+(?:\.\d+)?(?:\s*(?:per|\/)\s*(?:unit|space|SF|sq ft|square foot|year|month|hour))?/gi,
    weight: 1.0,
  },
  // Code version mentions: "2021 IBC", "2022 Denver Energy Code", "IECC 2021"
  {
    type: "code-version",
    regex: /\b(?:20\d{2}\s+(?:IBC|IFC|IPC|IECC|ADA|NFPA|Denver Energy Code|DEC|CBC|FBC|Florida Building Code)|(?:IBC|IFC|IPC|IECC|ADA|NFPA|CBC|DEC)\s+20\d{2})\b/gi,
    weight: 1.0,
  },
  // Zoning districts: "C-MX-5", "R-2", "SF-3", "T-MU"
  // Excludes Roman numeral construction types (I-A, II-B, III-A, V-B) via post-match context check
  {
    type: "zoning-district",
    regex: /\b([A-Z]{1,3}-[A-Z]{1,3}(?:-\d+)?|[A-Z]{2,3}-\d+)\b/g,
    weight: 0.8,
    // Patterns to exclude — these look like zones but are actually something else
    excludePatterns: [
      /^(I|II|III|IV|V)-[AB]$/i, // IBC construction types: I-A, II-B, III-A, IV-A, V-B
      /^IV$/i, // Heavy timber Type IV
    ],
    // Context keywords that indicate this is NOT a zoning district
    excludeContextKeywords: [
      /\btype\s+[IV]+/i, // "Type I-A", "Type III-B" — construction type
      /\bconstruction\s+type\b/i,
      /\bfire-resistance/i,
      /\bheavy\s+timber\b/i,
    ],
    // Context keywords that CONFIRM this is a zoning district
    includeContextKeywords: [
      /\bzon(e|ing)\b/i,
      /\bdistrict\b/i,
      /\boverlay\b/i,
      /\bland\s+use\b/i,
    ],
  },
  // Calculations: "8,000 SF ÷ 30 = 267", "45,000 ÷ 12,000 = 3.75"
  {
    type: "calculation",
    regex: /([\d,]+(?:\.\d+)?)\s*(?:SF|sq ft)?\s*[÷/]\s*([\d,]+(?:\.\d+)?)\s*(?:SF|sq ft)?\s*=\s*([\d,]+(?:\.\d+)?)/gi,
    weight: 1.0,
  },
  // Specific numerical requirements: "25,000 SF", "180 days", "60 feet"
  {
    type: "numerical-requirement",
    regex: /\b[\d,]+\s*(?:SF|sq ft|square feet|days|weeks|months|feet|ft|stories|units|spaces|%|percent)\b/gi,
    weight: 0.6,
  },
  // Climate zones: "Zone 5B", "Climate Zone 4A"
  {
    type: "climate-zone",
    regex: /\b(?:Climate\s+)?Zone\s+\d[A-C]?\b/gi,
    weight: 1.0,
  },
  // R-values and U-factors: "R-20", "U-0.40"
  {
    type: "performance-value",
    regex: /\b[RU]-?\d+(?:\.\d+)?\b/gi,
    weight: 0.8,
  },
  // COP values: "COP ≥ 1.5"
  {
    type: "efficiency-value",
    regex: /COP\s*[≥>]?\s*\d+(?:\.\d+)?/gi,
    weight: 1.0,
  },
];

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");
}

function detectVerifyFlag(context) {
  // Check if the line/context contains a VERIFY WITH AHJ flag
  return /⚠|VERIFY|TBD|Unknown|verify with|verify|not determined/i.test(context);
}

function getLineContext(text, matchIndex) {
  // Get the line containing the match
  const start = text.lastIndexOf("\n", matchIndex) + 1;
  const end = text.indexOf("\n", matchIndex);
  return text.slice(start, end === -1 ? text.length : end);
}

export function extractClaims(reportText, reportMetadata = {}) {
  const claims = [];
  const cleaned = stripMarkdown(reportText);
  const seen = new Set();

  for (const pattern of CLAIM_PATTERNS) {
    // Reset regex state
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(cleaned)) !== null) {
      const claimText = match[0].trim();
      if (seen.has(`${pattern.type}:${claimText}`)) continue;

      const context = getLineContext(cleaned, match.index);

      // Context-aware filtering: check exclusion patterns first
      if (pattern.excludePatterns) {
        const excluded = pattern.excludePatterns.some((p) => p.test(claimText));
        if (excluded) continue;
      }

      // Context-aware filtering: check if surrounding context indicates this is NOT this claim type
      if (pattern.excludeContextKeywords) {
        const excludedByContext = pattern.excludeContextKeywords.some((kw) => kw.test(context));
        if (excludedByContext) continue;
      }

      // Optional: require inclusion context for ambiguous patterns (e.g., "R-2" must appear near "zoning")
      // Only applied for zoning-district to reduce false positives
      if (pattern.type === "zoning-district" && pattern.includeContextKeywords) {
        const contextMatches = pattern.includeContextKeywords.some((kw) => kw.test(context));
        if (!contextMatches) continue; // Require positive zoning context
      }

      seen.add(`${pattern.type}:${claimText}`);
      const flagged = detectVerifyFlag(context);

      claims.push({
        type: pattern.type,
        text: claimText,
        context: context.trim().slice(0, 200),
        weight: flagged ? 0 : pattern.weight,
        flagged,
      });
    }
  }

  return {
    reportMetadata,
    totalClaims: claims.length,
    unflaggedClaims: claims.filter((c) => !c.flagged).length,
    flaggedClaims: claims.filter((c) => c.flagged).length,
    claims,
  };
}

// CLI usage
const isMainModule = process.argv[1] && process.argv[1].endsWith("extract-claims.mjs");
if (isMainModule) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node extract-claims.mjs <path-to-report.md>");
    process.exit(1);
  }

  const text = fs.readFileSync(inputPath, "utf-8");
  const result = extractClaims(text, {
    source: path.basename(inputPath),
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`Report: ${path.basename(inputPath)}`);
  console.log(`Total claims extracted: ${result.totalClaims}`);
  console.log(`Unflagged (verifiable): ${result.unflaggedClaims}`);
  console.log(`Flagged with ⚠ VERIFY: ${result.flaggedClaims}`);
  console.log(`═══════════════════════════════════════════`);

  const byType = {};
  for (const c of result.claims) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }
  console.log(`\nClaims by type:`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
}
