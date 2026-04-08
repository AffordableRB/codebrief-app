// Verification result cache
// Saves API call results to disk so repeat verifications are free
// Handles TTL (7 day freshness) and prompt versioning for invalidation

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const CACHE_DIR = path.join(__dirname, "cache-data");
const CACHE_FILE = path.join(CACHE_DIR, "verification-cache.json");

// TTL — how long cache entries stay valid (7 days)
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Prompt version — bump this number when the verification prompt changes
// to automatically invalidate old cached results
export const CURRENT_PROMPT_VERSION = "v1-2026-04-05";

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

let cacheData = null;
let cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  expired: 0,
  versionInvalidated: 0,
};

function loadCache() {
  if (cacheData !== null) return cacheData;

  ensureCacheDir();

  if (!fs.existsSync(CACHE_FILE)) {
    cacheData = {};
    return cacheData;
  }

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    cacheData = JSON.parse(raw);
  } catch (err) {
    console.warn(`[cache] Failed to load cache file, starting fresh: ${err.message}`);
    cacheData = {};
  }

  return cacheData;
}

function saveCache() {
  if (cacheData === null) return;
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
}

// ═══════════════════════════════════════════════════════════
// KEY GENERATION
// ═══════════════════════════════════════════════════════════

function makeKey(claim, jurisdiction) {
  // Hash-based key to handle special characters safely
  const raw = `${jurisdiction}::${claim.type}::${claim.text}::${(claim.context || "").slice(0, 100)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export function getCached(claim, jurisdiction) {
  const cache = loadCache();
  const key = makeKey(claim, jurisdiction);
  const entry = cache[key];

  if (!entry) {
    cacheStats.misses++;
    return null;
  }

  // Check prompt version
  if (entry.promptVersion !== CURRENT_PROMPT_VERSION) {
    cacheStats.versionInvalidated++;
    cacheStats.misses++;
    return null;
  }

  // Check TTL
  const age = Date.now() - entry.timestamp;
  if (age > TTL_MS) {
    cacheStats.expired++;
    cacheStats.misses++;
    return null;
  }

  cacheStats.hits++;
  return {
    ...entry.value,
    _cacheHit: true,
    _cacheAge: Math.round(age / 1000 / 60 / 60), // hours
  };
}

export function setCached(claim, jurisdiction, result) {
  const cache = loadCache();
  const key = makeKey(claim, jurisdiction);

  cache[key] = {
    timestamp: Date.now(),
    promptVersion: CURRENT_PROMPT_VERSION,
    claim: {
      text: claim.text,
      type: claim.type,
    },
    jurisdiction,
    value: {
      verdict: result.verdict,
      reason: result.reason,
      source: result.source,
      query: result.query,
      rawResponse: result.rawResponse,
    },
  };

  cacheStats.writes++;
  saveCache();
}

export function getCacheStats() {
  return { ...cacheStats };
}

export function resetCacheStats() {
  cacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    expired: 0,
    versionInvalidated: 0,
  };
}

export function printCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? Math.round((cacheStats.hits / total) * 1000) / 10 : 0;
  const costSaved = cacheStats.hits * 0.025; // ~$0.025 per verification call saved

  console.log(`\n┌─────────────────────────────────────────┐`);
  console.log(`│  CACHE STATISTICS                       │`);
  console.log(`├─────────────────────────────────────────┤`);
  console.log(`│  Cache hits:      ${cacheStats.hits.toString().padStart(4)} (${hitRate}%)        │`);
  console.log(`│  Cache misses:    ${cacheStats.misses.toString().padStart(4)}               │`);
  console.log(`│  New entries:     ${cacheStats.writes.toString().padStart(4)}               │`);
  console.log(`│  TTL expired:     ${cacheStats.expired.toString().padStart(4)}               │`);
  console.log(`│  Version bumped:  ${cacheStats.versionInvalidated.toString().padStart(4)}               │`);
  console.log(`│                                         │`);
  console.log(`│  Estimated cost saved: $${costSaved.toFixed(2).padStart(5)}           │`);
  console.log(`└─────────────────────────────────────────┘\n`);
}

// ═══════════════════════════════════════════════════════════
// CACHE MAINTENANCE
// ═══════════════════════════════════════════════════════════

export function clearExpired() {
  const cache = loadCache();
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of Object.entries(cache)) {
    if (
      now - entry.timestamp > TTL_MS ||
      entry.promptVersion !== CURRENT_PROMPT_VERSION
    ) {
      delete cache[key];
      removed++;
    }
  }

  if (removed > 0) saveCache();
  return removed;
}

export function clearAll() {
  cacheData = {};
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
}

export function getCacheSize() {
  const cache = loadCache();
  return Object.keys(cache).length;
}

// CLI — inspect or manage the cache
const isMainModule = process.argv[1] && process.argv[1].endsWith("cache.mjs");
if (isMainModule) {
  const cmd = process.argv[2];

  if (cmd === "stats") {
    const cache = loadCache();
    const entries = Object.values(cache);
    console.log(`\nCache size: ${entries.length} entries`);
    console.log(`Cache file: ${CACHE_FILE}`);

    if (entries.length > 0) {
      const now = Date.now();
      const ages = entries.map((e) => now - e.timestamp);
      const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
      const oldest = Math.max(...ages);
      const newest = Math.min(...ages);
      console.log(`Average age: ${Math.round(avgAge / 1000 / 60 / 60)} hours`);
      console.log(`Newest: ${Math.round(newest / 1000 / 60)} minutes`);
      console.log(`Oldest: ${Math.round(oldest / 1000 / 60 / 60)} hours`);

      // Count by jurisdiction
      const byJurisdiction = {};
      for (const e of entries) {
        byJurisdiction[e.jurisdiction] = (byJurisdiction[e.jurisdiction] || 0) + 1;
      }
      console.log(`\nEntries by jurisdiction:`);
      for (const [j, n] of Object.entries(byJurisdiction)) {
        console.log(`  ${j}: ${n}`);
      }

      // Count by verdict
      const byVerdict = {};
      for (const e of entries) {
        byVerdict[e.value.verdict] = (byVerdict[e.value.verdict] || 0) + 1;
      }
      console.log(`\nEntries by verdict:`);
      for (const [v, n] of Object.entries(byVerdict)) {
        console.log(`  ${v}: ${n}`);
      }
    }
    console.log("");
  } else if (cmd === "clear") {
    clearAll();
    console.log("Cache cleared");
  } else if (cmd === "clean") {
    const removed = clearExpired();
    console.log(`Removed ${removed} expired/invalidated entries`);
  } else {
    console.log("Usage: node cache.mjs <stats|clear|clean>");
  }
}
