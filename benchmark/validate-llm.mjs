// Full validator using LLM-based claim extraction + search-based verification
// This is the production benchmark: thorough extraction, objective verification

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractClaimsCompat } from "./extract-claims-llm.mjs";
import { verifyClaim } from "./search-verify.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verdict scoring with severity levels
// FABRICATION_SEVERE = section doesn't exist, fee is completely invented (-1.0)
// FABRICATION_MINOR = section exists but misattributed, overgeneralized (-0.3)
const VERDICT_SCORES = {
  VERIFIED: 1.0,
  FABRICATION_SEVERE: -1.0,
  FABRICATION_MINOR: -0.3,
  FABRICATION: -1.0, // backwards compat — treat as severe
  UNVERIFIABLE: 0.5,
  FLAGGED: null,
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
  return { a, b, claimed, actual: Math.round(actual * 100) / 100, correct: Math.abs(actual - claimed) <= tolerance };
}

export async function validateReportLLM(reportText, jurisdictionKey, metadata = {}) {
  // Phase 1: LLM extraction (cached by report hash)
  console.log("  Extracting claims via LLM...");
  const extraction = await extractClaimsCompat(reportText, metadata);

  const toVerify = extraction.claims.filter((c) => !c.flagged);
  console.log(`  Extracted: ${extraction.totalClaims} total (${toVerify.length} to verify, ${extraction.flaggedClaims} flagged)`);

  // Phase 2: Verify each non-flagged claim
  const verdicts = [];
  let verifiedCount = 0;

  for (const claim of extraction.claims) {
    if (claim.flagged) {
      verdicts.push({
        claim,
        verdict: "FLAGGED",
        score: null,
        note: "Appropriately flagged with ⚠ VERIFY",
      });
      continue;
    }

    // Calculations get re-run deterministically
    if (claim.type === "calculation") {
      const calcResult = verifyCalculation(claim.text);
      if (calcResult) {
        verifiedCount++;
        process.stdout.write(`  [${verifiedCount}/${toVerify.length}] calc: ${claim.text.slice(0, 50)}                \r`);
        verdicts.push({
          claim,
          verdict: calcResult.correct ? "CALCULATION_VERIFIED" : "CALCULATION_WRONG",
          score: calcResult.correct ? 1.0 : -1.0,
          note: `${calcResult.a} ÷ ${calcResult.b} = ${calcResult.actual} (claim: ${calcResult.claimed})`,
        });
        continue;
      }
    }

    // Everything else gets search-verified
    verifiedCount++;
    process.stdout.write(`  [${verifiedCount}/${toVerify.length}] ${claim.type}: ${claim.text.slice(0, 50)}                    \r`);

    const result = await verifyClaim(claim, jurisdictionKey);
    verdicts.push({
      claim,
      verdict: result.verdict,
      score: VERDICT_SCORES[result.verdict] ?? 0,
      note: result.reason,
      source: result.source,
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
  const fabricatedSevere = verdicts.filter((v) => v.verdict === "FABRICATION_SEVERE" || v.verdict === "FABRICATION" || v.verdict === "CALCULATION_WRONG").length;
  const fabricatedMinor = verdicts.filter((v) => v.verdict === "FABRICATION_MINOR").length;
  const fabricatedTotal = fabricatedSevere + fabricatedMinor;
  const unverifiable = verdicts.filter((v) => v.verdict === "UNVERIFIABLE").length;
  const flagged = verdicts.filter((v) => v.verdict === "FLAGGED").length;

  // Integrity score: severe fabrications count fully, minor fabrications count partially
  const integrityPercent = scoredVerdicts.length > 0
    ? Math.round(((scoredVerdicts.length - fabricatedSevere - (fabricatedMinor * 0.3)) / scoredVerdicts.length) * 1000) / 10
    : 100;

  return {
    metadata,
    summary: {
      totalClaims: extraction.totalClaims,
      scoredClaims: scoredVerdicts.length,
      verified,
      fabricatedSevere,
      fabricatedMinor,
      fabricatedTotal,
      unverifiable,
      flagged,
      skipped: 0,
      fabricationRate: scoredVerdicts.length > 0
        ? Math.round((fabricatedTotal / scoredVerdicts.length) * 1000) / 10
        : 0,
      accuracyPercent,
      integrityPercent,
    },
    verdicts,
  };
}

// CLI
const isMainModule = process.argv[1] && process.argv[1].endsWith("validate-llm.mjs");
if (isMainModule) {
  const reportPath = process.argv[2];
  const jurisdiction = process.argv[3] || "denver";

  if (!reportPath) {
    console.error("Usage: node validate-llm.mjs <path-to-report.md> [jurisdiction]");
    process.exit(1);
  }

  const reportText = fs.readFileSync(reportPath, "utf-8");

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  LLM-BASED VALIDATION — ${path.basename(reportPath)}`);
  console.log(`  Jurisdiction: ${jurisdiction}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const startTime = Date.now();
  const result = await validateReportLLM(reportText, jurisdiction, {
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
  console.log(`  ✓ Verified:               ${result.summary.verified}`);
  console.log(`  ✗ Fabricated (severe):    ${result.summary.fabricatedSevere}  (invented from nothing)`);
  console.log(`  ~ Fabricated (minor):     ${result.summary.fabricatedMinor}  (misattributed/imprecise)`);
  console.log(`  ? Unverifiable:           ${result.summary.unverifiable}`);
  console.log(`  ⚠ Flagged (appropriate):  ${result.summary.flagged}`);
  console.log(``);
  console.log(`  INTEGRITY SCORE:          ${result.summary.integrityPercent}%  (severe=-100%, minor=-30%)`);
  console.log(`  ACCURACY SCORE:           ${result.summary.accuracyPercent}%  (weighted verification)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Save results
  const resultsDir = path.join(__dirname, "results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const outFile = path.join(resultsDir, `${path.basename(reportPath, ".md")}-llm-validated.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Saved to: ${outFile}\n`);
}
