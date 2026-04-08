// Regenerate a specific report via the production API and save it
// Usage: node regenerate-report.mjs <report-type> <output-name>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = "https://codecompliance-delta.vercel.app/api/generate";
const ORIGIN = "https://codecompliance-delta.vercel.app";

// The standard Denver Mixed-Use test scenario (matches our benchmark reports)
const DENVER_MIXED_USE = {
  buildingType: "Mixed-Use (Residential/Commercial)",
  location: "Denver, Colorado",
  squareFootage: "45000",
  stories: "5",
  buildingHeight: "60",
  constructionType: "Type III-A",
  occupancyType: "R-2 Residential (apartment, dormitory)",
  occupantLoad: "",
  lotSize: "12000",
  additionalNotes: "Ground floor 8000 SF retail, 37000 SF residential above (40 units)",
};

async function regenerate(reportType, outputName) {
  console.log(`\nRegenerating ${reportType}...`);
  console.log(`API: ${API_URL}`);

  const payload = { ...DENVER_MIXED_USE, reportType };

  const startTime = Date.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`API error: ${response.status}`);
    const text = await response.text();
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  // Read the streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  // Strip metadata header (first line with delimiter)
  const DELIMITER = "\n<!--CODEBRIEF_METADATA_END-->\n";
  let reportContent = accumulated;
  if (accumulated.includes(DELIMITER)) {
    const parts = accumulated.split(DELIMITER);
    reportContent = parts[1] || accumulated;
  }

  // Save to test-reports directory with v2 suffix
  // Use absolute Windows path
  const outDir = "C:\\Users\\Profile3\\Desktop\\Code Compliance Brief\\test-reports";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, outputName);

  fs.writeFileSync(outPath, reportContent);

  console.log(`✓ Saved: ${outPath}`);
  console.log(`  Duration: ${duration}s`);
  console.log(`  Length: ${reportContent.length} bytes`);

  return outPath;
}

// CLI
const reportType = process.argv[2];
const outputName = process.argv[3];

if (!reportType || !outputName) {
  console.error("Usage: node regenerate-report.mjs <report-type> <output-filename>");
  console.error("Example: node regenerate-report.mjs cost-context cost-context-v2.md");
  process.exit(1);
}

await regenerate(reportType, outputName);
