// Claim validator — compares extracted claims against ground truth and returns verdicts
// Usage: node validate.mjs <path-to-report.md> <jurisdiction-ground-truth-name>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractClaims } from "./extract-claims.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERDICTS = {
  CORRECT: { score: 1.0, label: "CORRECT" },
  INCORRECT: { score: -1.0, label: "INCORRECT (fabrication or error)" },
  UNKNOWN: { score: 0.5, label: "UNKNOWN (not in ground truth — partial credit)" },
  FLAGGED: { score: null, label: "APPROPRIATELY FLAGGED (neutral)" },
  CALCULATION_VERIFIED: { score: 1.0, label: "CALCULATION VERIFIED" },
  CALCULATION_WRONG: { score: -1.0, label: "CALCULATION WRONG" },
};

function normalizeText(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s.$%≥/]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesFact(claim, fact) {
  // Check if the claim text contains any of the fact's keywords
  const claimNorm = normalizeText(claim.text + " " + (claim.context || ""));
  const keywordMatches = fact.keywords.filter((kw) => {
    const kwNorm = normalizeText(kw);
    return claimNorm.includes(kwNorm);
  });
  return keywordMatches.length > 0 ? keywordMatches : null;
}

function verifyCalculation(claimText) {
  // Re-run the math in a calculation claim
  const match = claimText.match(/([\d,]+(?:\.\d+)?)\s*[÷/]\s*([\d,]+(?:\.\d+)?)\s*=\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;

  const a = parseFloat(match[1].replace(/,/g, ""));
  const b = parseFloat(match[2].replace(/,/g, ""));
  const claimed = parseFloat(match[3].replace(/,/g, ""));
  const actual = a / b;

  // Allow 5% rounding tolerance
  const tolerance = Math.abs(actual * 0.05);
  const isCorrect = Math.abs(actual - claimed) <= tolerance;

  return {
    a,
    b,
    claimed,
    actual: Math.round(actual * 100) / 100,
    correct: isCorrect,
  };
}

export function validateReport(reportText, groundTruth, metadata = {}) {
  const extraction = extractClaims(reportText, metadata);
  const verdicts = [];

  for (const claim of extraction.claims) {
    // Flagged items are neutral
    if (claim.flagged) {
      verdicts.push({
        claim,
        verdict: "FLAGGED",
        score: null,
        note: "Appropriately flagged with ⚠ VERIFY WITH AHJ",
      });
      continue;
    }

    // Calculations get re-run
    if (claim.type === "calculation") {
      const calcResult = verifyCalculation(claim.text);
      if (calcResult) {
        verdicts.push({
          claim,
          verdict: calcResult.correct ? "CALCULATION_VERIFIED" : "CALCULATION_WRONG",
          score: calcResult.correct ? 1.0 : -1.0,
          note: `${calcResult.a} ÷ ${calcResult.b} = ${calcResult.actual} (claim: ${calcResult.claimed})`,
        });
        continue;
      }
    }

    // Match against ground truth
    let matchedFact = null;
    let matchedKeywords = null;
    for (const fact of groundTruth.facts) {
      const match = matchesFact(claim, fact);
      if (match) {
        matchedFact = fact;
        matchedKeywords = match;
        break;
      }
    }

    if (matchedFact) {
      verdicts.push({
        claim,
        verdict: matchedFact.verdict_if_matched,
        score: VERDICTS[matchedFact.verdict_if_matched]?.score ?? 0,
        note: matchedFact.verdict_if_matched === "INCORRECT"
          ? `FABRICATION DETECTED: ${matchedFact.note || matchedFact.claim}`
          : `Matched ground truth: ${matchedFact.subject}`,
        matchedKeywords,
        factId: matchedFact.id,
      });
    } else {
      verdicts.push({
        claim,
        verdict: "UNKNOWN",
        score: VERDICTS.UNKNOWN.score,
        note: "Not in ground truth — partial credit",
      });
    }
  }

  // Calculate aggregate score
  const scoredVerdicts = verdicts.filter((v) => v.score !== null);
  const maxPossibleScore = scoredVerdicts.length;
  const actualScore = scoredVerdicts.reduce((sum, v) => sum + Math.max(0, v.score), 0);
  const accuracyPercent = maxPossibleScore > 0
    ? Math.round((actualScore / maxPossibleScore) * 1000) / 10
    : 0;

  const correctCount = verdicts.filter((v) => v.verdict === "CORRECT" || v.verdict === "CALCULATION_VERIFIED").length;
  const incorrectCount = verdicts.filter((v) => v.verdict === "INCORRECT" || v.verdict === "CALCULATION_WRONG").length;
  const unknownCount = verdicts.filter((v) => v.verdict === "UNKNOWN").length;
  const flaggedCount = verdicts.filter((v) => v.verdict === "FLAGGED").length;

  return {
    metadata,
    summary: {
      totalClaims: extraction.totalClaims,
      scoredClaims: scoredVerdicts.length,
      correct: correctCount,
      incorrect: incorrectCount,
      unknown: unknownCount,
      flagged: flaggedCount,
      fabricationRate: extraction.unflaggedClaims > 0
        ? Math.round((incorrectCount / extraction.unflaggedClaims) * 1000) / 10
        : 0,
      accuracyPercent,
    },
    verdicts,
  };
}

// CLI usage — always run when invoked directly (works cross-platform)
const isMainModule = process.argv[1] && process.argv[1].endsWith("validate.mjs");
if (isMainModule) {
  const reportPath = process.argv[2];
  const jurisdiction = process.argv[3] || "denver";

  if (!reportPath) {
    console.error("Usage: node validate.mjs <path-to-report.md> [jurisdiction]");
    console.error("Example: node validate.mjs ../test-reports/energy-compliance.md denver");
    process.exit(1);
  }

  const reportText = fs.readFileSync(reportPath, "utf-8");
  const groundTruthPath = path.join(__dirname, "ground-truth", `${jurisdiction}.json`);

  if (!fs.existsSync(groundTruthPath)) {
    console.error(`Ground truth not found: ${groundTruthPath}`);
    process.exit(1);
  }

  const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf-8"));
  const result = validateReport(reportText, groundTruth, {
    report: path.basename(reportPath),
    jurisdiction: groundTruth.jurisdiction,
  });

  // Print results
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  VALIDATION REPORT — ${result.metadata.report}`);
  console.log(`  Jurisdiction: ${result.metadata.jurisdiction}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Total claims:       ${result.summary.totalClaims}`);
  console.log(`  Scored claims:      ${result.summary.scoredClaims}`);
  console.log(`  ✓ Correct:          ${result.summary.correct}`);
  console.log(`  ✗ Incorrect:        ${result.summary.incorrect}`);
  console.log(`  ? Unknown:          ${result.summary.unknown}`);
  console.log(`  ⚠ Flagged (AHJ):    ${result.summary.flagged}`);
  console.log(`  Fabrication rate:   ${result.summary.fabricationRate}%`);
  console.log(`\n  ACCURACY SCORE:     ${result.summary.accuracyPercent}%`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Show incorrect claims
  const incorrectClaims = result.verdicts.filter(
    (v) => v.verdict === "INCORRECT" || v.verdict === "CALCULATION_WRONG"
  );
  if (incorrectClaims.length > 0) {
    console.log(`INCORRECT CLAIMS (${incorrectClaims.length}):`);
    for (const v of incorrectClaims) {
      console.log(`  ✗ "${v.claim.text}"`);
      console.log(`    ${v.note}`);
      console.log(`    Context: ${v.claim.context}`);
      console.log("");
    }
  }

  // Show correct claims (first 5)
  const correctClaims = result.verdicts.filter(
    (v) => v.verdict === "CORRECT" || v.verdict === "CALCULATION_VERIFIED"
  );
  if (correctClaims.length > 0) {
    console.log(`\nCORRECT CLAIMS (showing first 5 of ${correctClaims.length}):`);
    for (const v of correctClaims.slice(0, 5)) {
      console.log(`  ✓ "${v.claim.text}"`);
      console.log(`    ${v.note}`);
      console.log("");
    }
  }
}
