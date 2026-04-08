// Full benchmark run using search-based verification
// Loops through all reports in a directory, verifies each claim via live search,
// produces a final scorecard with objective source-backed verdicts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateReportWithSearch } from "./validate-with-search.mjs";
import { printCacheStats, resetCacheStats, getCacheSize } from "./cache.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = process.argv[2] || "../../test-reports";
const jurisdiction = process.argv[3] || "denver";

const absDir = path.isAbsolute(reportsDir) ? reportsDir : path.resolve(__dirname, reportsDir);
if (!fs.existsSync(absDir)) {
  console.error(`Reports directory not found: ${absDir}`);
  process.exit(1);
}

const files = fs.readdirSync(absDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
if (files.length === 0) {
  console.error(`No .md files found in ${absDir}`);
  process.exit(1);
}

const existingCacheSize = getCacheSize();

console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║         CODEBRIEF BENCHMARK — SEARCH-BASED VERIFICATION          ║`);
console.log(`║         Jurisdiction: ${jurisdiction.padEnd(42)}║`);
console.log(`║         Reports: ${files.length.toString().padEnd(47)}║`);
console.log(`║         Method: Live authoritative source verification          ║`);
console.log(`║         Cache: ${(existingCacheSize + " entries pre-loaded").padEnd(48)}║`);
console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

resetCacheStats();
const runStart = Date.now();
const results = [];

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  console.log(`\n[${i + 1}/${files.length}] ${file}`);
  console.log(`─────────────────────────────────────────────`);

  const reportPath = path.join(absDir, file);
  const reportText = fs.readFileSync(reportPath, "utf-8");

  const startTime = Date.now();
  try {
    const result = await validateReportWithSearch(reportText, jurisdiction, {
      report: file,
      jurisdiction,
    });
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(
      `  Score: ${result.summary.accuracyPercent}%  |  ` +
      `✓${result.summary.verified}  ` +
      `✗${result.summary.fabricated}  ` +
      `?${result.summary.unverifiable}  ` +
      `⚠${result.summary.flagged}  ` +
      `skip${result.summary.skipped}  |  ` +
      `${duration}s`
    );

    results.push({ file, result, duration });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    results.push({ file, error: err.message });
  }
}

const totalDuration = Math.round((Date.now() - runStart) / 1000);

// Sort by accuracy
const successfulResults = results.filter((r) => !r.error);
successfulResults.sort((a, b) => b.result.summary.accuracyPercent - a.result.summary.accuracyPercent);

// Print scorecard with both integrity and accuracy scores
console.log(`\n\n╔══════════════════════════════════════════════════════════════════════════════════╗`);
console.log(`║                            FINAL SCORECARD                                      ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════════════════╝\n`);
console.log(`┌──────────────────────────────┬───────────┬──────────┬──────┬──────┬──────┬──────┐`);
console.log(`│ REPORT                       │ INTEGRITY │ ACCURACY │  ✓   │  ✗   │  ?   │  ⚠   │`);
console.log(`├──────────────────────────────┼───────────┼──────────┼──────┼──────┼──────┼──────┤`);

// Sort by integrity first, then accuracy
successfulResults.sort((a, b) => {
  if (b.result.summary.integrityPercent !== a.result.summary.integrityPercent) {
    return b.result.summary.integrityPercent - a.result.summary.integrityPercent;
  }
  return b.result.summary.accuracyPercent - a.result.summary.accuracyPercent;
});

for (const { file, result } of successfulResults) {
  const name = file.replace(".md", "").slice(0, 28).padEnd(28);
  const integrity = `${result.summary.integrityPercent}%`.padStart(9);
  const accuracy = `${result.summary.accuracyPercent}%`.padStart(8);
  const ver = result.summary.verified.toString().padStart(4);
  const fab = result.summary.fabricated.toString().padStart(4);
  const unv = result.summary.unverifiable.toString().padStart(4);
  const flg = result.summary.flagged.toString().padStart(4);
  console.log(`│ ${name} │ ${integrity} │ ${accuracy} │ ${ver} │ ${fab} │ ${unv} │ ${flg} │`);
}
console.log(`└──────────────────────────────┴───────────┴──────────┴──────┴──────┴──────┴──────┘`);
console.log(`  INTEGRITY = % of scored claims that are NOT fabricated (ship bar: 95%+)`);
console.log(`  ACCURACY  = weighted verification score including partial credit (target: 85%+)`);

// Overall stats
const totalVerified = successfulResults.reduce((s, r) => s + r.result.summary.verified, 0);
const totalFabricated = successfulResults.reduce((s, r) => s + r.result.summary.fabricated, 0);
const totalUnverifiable = successfulResults.reduce((s, r) => s + r.result.summary.unverifiable, 0);
const totalFlagged = successfulResults.reduce((s, r) => s + r.result.summary.flagged, 0);
const totalSkipped = successfulResults.reduce((s, r) => s + r.result.summary.skipped, 0);
const totalScored = successfulResults.reduce((s, r) => s + r.result.summary.scoredClaims, 0);

const overallAccuracy = successfulResults.length > 0
  ? Math.round((successfulResults.reduce((s, r) => s + r.result.summary.accuracyPercent, 0) / successfulResults.length) * 10) / 10
  : 0;

console.log(`\n═══════════════════════════════════════════════════════════════════════`);
console.log(`  OVERALL RESULTS`);
console.log(`═══════════════════════════════════════════════════════════════════════`);
console.log(`  Reports verified:         ${successfulResults.length}`);
console.log(`  Total scored claims:      ${totalScored}`);
console.log(`  ✓ Verified:               ${totalVerified}`);
console.log(`  ✗ Fabricated:             ${totalFabricated}`);
console.log(`  ? Unverifiable:           ${totalUnverifiable}`);
console.log(`  ⚠ Flagged (appropriate):  ${totalFlagged}`);
console.log(`  Skipped (unsupported):    ${totalSkipped}`);
console.log(``);
console.log(`  AVERAGE ACCURACY:         ${overallAccuracy}%`);
console.log(`  TOTAL RUN TIME:           ${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`);
console.log(``);

let status, statusNote;
if (overallAccuracy >= 90) { status = "EXCELLENT"; statusNote = "Production-ready, exceeds 90% target"; }
else if (overallAccuracy >= 85) { status = "GOOD"; statusNote = "Beta-ready, minor optimizations recommended"; }
else if (overallAccuracy >= 75) { status = "ACCEPTABLE"; statusNote = "Iterate prompts to reach 85%+ target"; }
else if (overallAccuracy >= 65) { status = "NEEDS WORK"; statusNote = "Significant prompt improvements needed"; }
else { status = "FAIL"; statusNote = "Major issues, do not deploy"; }

console.log(`  STATUS: ${status}`);
console.log(`  ${statusNote}`);
console.log(`═══════════════════════════════════════════════════════════════════════\n`);

// Cache performance stats
printCacheStats();

// Show all fabrications
const allFabrications = [];
for (const { file, result } of successfulResults) {
  for (const v of result.verdicts) {
    if (v.verdict === "FABRICATION" || v.verdict === "CALCULATION_WRONG") {
      allFabrications.push({ file, verdict: v });
    }
  }
}

if (allFabrications.length > 0) {
  console.log(`FABRICATIONS CAUGHT (${allFabrications.length}):`);
  for (const { file, verdict } of allFabrications) {
    console.log(`  [${file}] "${verdict.claim.text}"`);
    console.log(`    ${verdict.note.slice(0, 200)}`);
    if (verdict.source) console.log(`    Source: ${verdict.source}`);
    console.log("");
  }
}

// Save results
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const resultFile = path.join(resultsDir, `full-search-benchmark-${timestamp}.json`);
fs.writeFileSync(resultFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  jurisdiction,
  method: "search-based verification",
  overall: {
    accuracy: overallAccuracy,
    totalScored,
    verified: totalVerified,
    fabricated: totalFabricated,
    unverifiable: totalUnverifiable,
    flagged: totalFlagged,
    skipped: totalSkipped,
    status,
  },
  reports: successfulResults.map(({ file, result, duration }) => ({
    file,
    accuracy: result.summary.accuracyPercent,
    summary: result.summary,
    duration,
  })),
  fabrications: allFabrications.map(({ file, verdict }) => ({
    file,
    claim: verdict.claim.text,
    type: verdict.claim.type,
    reason: verdict.note,
    source: verdict.source,
  })),
}, null, 2));

console.log(`Full results saved to: ${resultFile}\n`);
