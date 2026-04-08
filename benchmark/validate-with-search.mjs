// Validator that uses search-based verification instead of keyword-matched ground truth
// This is the Day 2 integration — combines extract-claims + search-verify into one pipeline

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractClaims } from "./extract-claims.mjs";
import { verifyClaim } from "./search-verify.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Claim types we'll verify via search. Other types are skipped or handled differently.
const SEARCHABLE_TYPES = new Set([
  "section-citation",
  "code-version",
  "zoning-district",
  "dollar-figure",
  "climate-zone",
]);

// Verdict scoring — revised rubric (April 2026)
// UNVERIFIABLE increased from 0.3 to 0.5: honest uncertainty deserves fair credit.
// The old 0.3 penalized the model for being honest when it couldn't confirm a claim,
// which incentivized confident fabrication. 0.5 is neutral — "we tried, couldn't confirm".
const VERDICT_SCORES = {
  VERIFIED: 1.0,
  FABRICATION: -1.0,
  UNVERIFIABLE: 0.5,
  FLAGGED: null, // Neutral — excluded from scoring
  CALCULATION_VERIFIED: 1.0,
  CALCULATION_WRONG: -1.0,
};

function verifyCalculation(claimText) {
  const match = claimText.match(/([\d,]+(?:\.\d+)?)\s*[÷/]\s*([\d,]+(?:\.\d+)?)\s*=\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;

  const a = parseFloat(match[1].replace(/,/g, ""));
  const b = parseFloat(match[2].replace(/,/g, ""));
  const claimed = parseFloat(match[3].replace(/,/g, ""));
  const actual = a / b;
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

export async function validateReportWithSearch(reportText, jurisdictionKey, metadata = {}) {
  const extraction = extractClaims(reportText, metadata);
  const verdicts = [];

  // Progress reporting
  const totalToVerify = extraction.claims.filter(
    (c) => !c.flagged && (SEARCHABLE_TYPES.has(c.type) || c.type === "calculation")
  ).length;
  let verifiedCount = 0;

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

    // Calculations get re-run deterministically
    if (claim.type === "calculation") {
      const calcResult = verifyCalculation(claim.text);
      if (calcResult) {
        verifiedCount++;
        process.stdout.write(`  [${verifiedCount}/${totalToVerify}] calc: ${claim.text}\r`);
        verdicts.push({
          claim,
          verdict: calcResult.correct ? "CALCULATION_VERIFIED" : "CALCULATION_WRONG",
          score: calcResult.correct ? 1.0 : -1.0,
          note: `${calcResult.a} ÷ ${calcResult.b} = ${calcResult.actual} (claim: ${calcResult.claimed})`,
        });
        continue;
      }
    }

    // Searchable claim types get verified via live search
    if (SEARCHABLE_TYPES.has(claim.type)) {
      verifiedCount++;
      process.stdout.write(`  [${verifiedCount}/${totalToVerify}] ${claim.type}: ${claim.text}                    \r`);

      const searchResult = await verifyClaim(claim, jurisdictionKey);
      verdicts.push({
        claim,
        verdict: searchResult.verdict,
        score: VERDICT_SCORES[searchResult.verdict] ?? 0,
        note: searchResult.reason,
        source: searchResult.source,
      });
      continue;
    }

    // Other claim types (numerical-requirement, performance-value, efficiency-value) — skip for now
    // These are harder to verify via search and add noise
    verdicts.push({
      claim,
      verdict: "SKIPPED",
      score: null,
      note: `Claim type '${claim.type}' not verified (reserved for future)`,
    });
  }

  process.stdout.write("\n");

  // Aggregate
  const scoredVerdicts = verdicts.filter((v) => v.score !== null);
  const maxPossibleScore = scoredVerdicts.length;
  const actualScore = scoredVerdicts.reduce((sum, v) => sum + Math.max(0, v.score), 0);
  const accuracyPercent = maxPossibleScore > 0
    ? Math.round((actualScore / maxPossibleScore) * 1000) / 10
    : 0;

  const verified = verdicts.filter((v) => v.verdict === "VERIFIED" || v.verdict === "CALCULATION_VERIFIED").length;
  const fabricated = verdicts.filter((v) => v.verdict === "FABRICATION" || v.verdict === "CALCULATION_WRONG").length;
  const unverifiable = verdicts.filter((v) => v.verdict === "UNVERIFIABLE").length;
  const flagged = verdicts.filter((v) => v.verdict === "FLAGGED").length;
  const skipped = verdicts.filter((v) => v.verdict === "SKIPPED").length;

  // INTEGRITY SCORE: percentage of scored claims that are NOT fabricated.
  // This is the clearest single metric of trustworthiness.
  // 100% integrity = zero fabrications regardless of verification rate.
  // A report can have low accuracy (lots of unverifiable) but high integrity (nothing false).
  const integrityPercent = scoredVerdicts.length > 0
    ? Math.round(((scoredVerdicts.length - fabricated) / scoredVerdicts.length) * 1000) / 10
    : 100;

  return {
    metadata,
    summary: {
      totalClaims: extraction.totalClaims,
      scoredClaims: scoredVerdicts.length,
      verified,
      fabricated,
      unverifiable,
      flagged,
      skipped,
      fabricationRate: (extraction.unflaggedClaims - skipped) > 0
        ? Math.round((fabricated / (extraction.unflaggedClaims - skipped)) * 1000) / 10
        : 0,
      accuracyPercent,
      integrityPercent, // NEW: % of claims that are NOT fabricated
    },
    verdicts,
  };
}

// CLI usage
const isMainModule = process.argv[1] && process.argv[1].endsWith("validate-with-search.mjs");
if (isMainModule) {
  const reportPath = process.argv[2];
  const jurisdiction = process.argv[3] || "denver";

  if (!reportPath) {
    console.error("Usage: node validate-with-search.mjs <path-to-report.md> [jurisdiction]");
    process.exit(1);
  }

  const reportText = fs.readFileSync(reportPath, "utf-8");

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SEARCH-BASED VALIDATION — ${path.basename(reportPath)}`);
  console.log(`  Jurisdiction: ${jurisdiction}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const startTime = Date.now();
  const result = await validateReportWithSearch(reportText, jurisdiction, {
    report: path.basename(reportPath),
    jurisdiction,
  });
  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Duration:                 ${duration}s`);
  console.log(`  Total claims extracted:   ${result.summary.totalClaims}`);
  console.log(`  Scored claims:            ${result.summary.scoredClaims}`);
  console.log(`  Skipped (unsupported):    ${result.summary.skipped}`);
  console.log(`  ✓ Verified:               ${result.summary.verified}`);
  console.log(`  ✗ Fabricated:             ${result.summary.fabricated}`);
  console.log(`  ? Unverifiable:           ${result.summary.unverifiable}`);
  console.log(`  ⚠ Flagged (appropriate):  ${result.summary.flagged}`);
  console.log(`  Fabrication rate:         ${result.summary.fabricationRate}%`);
  console.log(``);
  console.log(`  INTEGRITY SCORE:          ${result.summary.integrityPercent}%  (% not fabricated)`);
  console.log(`  ACCURACY SCORE:           ${result.summary.accuracyPercent}%  (weighted verification)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Show all fabrications
  const fabrications = result.verdicts.filter((v) => v.verdict === "FABRICATION" || v.verdict === "CALCULATION_WRONG");
  if (fabrications.length > 0) {
    console.log(`FABRICATIONS DETECTED (${fabrications.length}):`);
    for (const v of fabrications) {
      console.log(`  ✗ "${v.claim.text}"`);
      console.log(`    Reason: ${v.note}`);
      if (v.source) console.log(`    Source checked: ${v.source}`);
      console.log("");
    }
  }

  // Save detailed results
  const resultsDir = path.join(__dirname, "results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const outFile = path.join(resultsDir, `${path.basename(reportPath, ".md")}-searchverified.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Detailed results saved to: ${outFile}\n`);
}
