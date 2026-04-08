// Run benchmark against all reports in a directory and produce a scorecard
// Usage: node run-all.mjs <directory-of-reports> <jurisdiction>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateReport } from "./validate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = process.argv[2] || "../../test-reports";
const jurisdiction = process.argv[3] || "denver";

const groundTruthPath = path.join(__dirname, "ground-truth", `${jurisdiction}.json`);
if (!fs.existsSync(groundTruthPath)) {
  console.error(`Ground truth not found: ${groundTruthPath}`);
  process.exit(1);
}
const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf-8"));

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

const results = [];

console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║          CODEBRIEF BENCHMARK RUN                                 ║`);
console.log(`║          Jurisdiction: ${groundTruth.jurisdiction.padEnd(42)}║`);
console.log(`║          Reports: ${files.length.toString().padEnd(47)}║`);
console.log(`║          Ground truth facts: ${groundTruth.facts.length.toString().padEnd(36)}║`);
console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

for (const file of files) {
  const reportPath = path.join(absDir, file);
  const reportText = fs.readFileSync(reportPath, "utf-8");
  const result = validateReport(reportText, groundTruth, {
    report: file,
    jurisdiction: groundTruth.jurisdiction,
  });
  results.push({ file, result });
}

// Sort by accuracy
results.sort((a, b) => b.result.summary.accuracyPercent - a.result.summary.accuracyPercent);

// Print scorecard
console.log(`┌──────────────────────────────┬────────┬──────┬──────┬──────┬──────┬──────────┐`);
console.log(`│ REPORT                       │ SCORE  │  ✓   │  ✗   │  ?   │  ⚠   │ FAB RATE │`);
console.log(`├──────────────────────────────┼────────┼──────┼──────┼──────┼──────┼──────────┤`);

for (const { file, result } of results) {
  const name = file.replace(".md", "").slice(0, 28).padEnd(28);
  const score = `${result.summary.accuracyPercent}%`.padStart(6);
  const correct = result.summary.correct.toString().padStart(4);
  const incorrect = result.summary.incorrect.toString().padStart(4);
  const unknown = result.summary.unknown.toString().padStart(4);
  const flagged = result.summary.flagged.toString().padStart(4);
  const fab = `${result.summary.fabricationRate}%`.padStart(8);
  console.log(`│ ${name} │ ${score} │ ${correct} │ ${incorrect} │ ${unknown} │ ${flagged} │ ${fab} │`);
}

console.log(`└──────────────────────────────┴────────┴──────┴──────┴──────┴──────┴──────────┘`);

// Overall stats
const totalClaims = results.reduce((s, r) => s + r.result.summary.totalClaims, 0);
const totalCorrect = results.reduce((s, r) => s + r.result.summary.correct, 0);
const totalIncorrect = results.reduce((s, r) => s + r.result.summary.incorrect, 0);
const totalUnknown = results.reduce((s, r) => s + r.result.summary.unknown, 0);
const totalFlagged = results.reduce((s, r) => s + r.result.summary.flagged, 0);
const totalScored = results.reduce((s, r) => s + r.result.summary.scoredClaims, 0);
const overallAccuracy = results.length > 0
  ? Math.round((results.reduce((s, r) => s + r.result.summary.accuracyPercent, 0) / results.length) * 10) / 10
  : 0;
const overallFabRate = totalClaims - totalFlagged > 0
  ? Math.round((totalIncorrect / (totalClaims - totalFlagged)) * 1000) / 10
  : 0;

console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`  OVERALL RESULTS`);
console.log(`═══════════════════════════════════════════════════════════════════`);
console.log(`  Total claims extracted:   ${totalClaims}`);
console.log(`  Correct:                  ${totalCorrect}`);
console.log(`  Incorrect (fabrications): ${totalIncorrect}`);
console.log(`  Unknown (not in GT):      ${totalUnknown}`);
console.log(`  Flagged (⚠ VERIFY):       ${totalFlagged}`);
console.log(``);
console.log(`  AVERAGE ACCURACY:         ${overallAccuracy}%`);
console.log(`  FABRICATION RATE:         ${overallFabRate}%`);
console.log(``);

// Pass/fail status
let status, statusNote;
if (overallAccuracy >= 90) { status = "EXCELLENT"; statusNote = "Production-ready, exceeds 90% target"; }
else if (overallAccuracy >= 85) { status = "GOOD"; statusNote = "Beta-ready, minor optimizations recommended"; }
else if (overallAccuracy >= 75) { status = "ACCEPTABLE"; statusNote = "Iterate prompts to reach 85%+ target"; }
else if (overallAccuracy >= 65) { status = "NEEDS WORK"; statusNote = "Significant prompt improvements needed"; }
else { status = "FAIL"; statusNote = "Major issues, do not deploy"; }

console.log(`  STATUS: ${status}`);
console.log(`  ${statusNote}`);
console.log(`═══════════════════════════════════════════════════════════════════\n`);

// Show all fabrications across the run
const allFabrications = [];
for (const { file, result } of results) {
  for (const v of result.verdicts) {
    if (v.verdict === "INCORRECT" || v.verdict === "CALCULATION_WRONG") {
      allFabrications.push({ file, verdict: v });
    }
  }
}

if (allFabrications.length > 0) {
  console.log(`FABRICATIONS DETECTED (${allFabrications.length}):`);
  for (const { file, verdict } of allFabrications) {
    console.log(`  [${file}] "${verdict.claim.text}"`);
    console.log(`    ${verdict.note}`);
  }
  console.log(``);
}

// Save results to file
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const resultFile = path.join(resultsDir, `benchmark-${timestamp}.json`);
fs.writeFileSync(resultFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  jurisdiction: groundTruth.jurisdiction,
  overall: {
    accuracy: overallAccuracy,
    fabricationRate: overallFabRate,
    totalClaims,
    status,
  },
  reports: results.map(({ file, result }) => ({
    file,
    accuracy: result.summary.accuracyPercent,
    summary: result.summary,
  })),
}, null, 2));

console.log(`Results saved to: ${resultFile}\n`);
