/**
 * Wikidata leaders generator.
 *
 * Fetches current heads of state/government for all countries defined in
 * countries.mjs, generates plausible distractors, and writes a TypeScript
 * file with Question[] arrays per continent.
 *
 * Usage:
 *   node scripts/wikidata/generate-leaders.mjs
 *
 * Environment:
 *   FORCE_REFRESH=1  — bypass cache, force fresh Wikidata fetch
 *
 * Caching:
 *   Results are cached in .cache/wikidata-leaders.json with a 24h TTL.
 *   On cache hit (and not expired), the generator skips Wikidata entirely.
 *   On cache miss or FORCE_REFRESH=1, fetches fresh data and updates the cache.
 *
 * Fallback:
 *   If Wikidata is unreachable AND no cache exists, the generator exits with
 *   an error but does NOT overwrite the existing leaders-generated.ts file.
 *   This means the build can still proceed with the last-known-good data
 *   that was committed to the repo.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRIES, roleToTitle, roleToProperty } from "./countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CACHE_DIR = resolve(REPO_ROOT, ".cache");
const CACHE_FILE = resolve(CACHE_DIR, "wikidata-leaders.json");
const OUTPUT_FILE = resolve(
  REPO_ROOT,
  "artifacts/know-your-world/src/data/leaders-generated.ts",
);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "KnowYourWorld/1.0 (educational geography quiz; build-time data refresh)";

/**
 * Build a SPARQL query that fetches current leaders for all countries.
 * Uses VALUES to pass the list of QIDs, and FILTER NOT EXISTS to get only
 * statements without an end time (P582) — i.e., currently in office.
 *
 * @param {Array<{qid: string, role: string}>} entries
 * @returns {string}
 */
function buildSparqlQuery(entries) {
  // Deduplicate QIDs (some countries appear at multiple levels)
  const qids = [...new Set(entries.map((e) => `wd:${e.qid}`))].join(" ");

  // We query both P35 (head of state) and P6 (head of government) in a UNION,
  // then pick the right one per country in post-processing.
  return `
SELECT ?country ?countryLabel ?leader ?leaderLabel ?prop WHERE {
  VALUES ?country { ${qids} }
  {
    ?country p:P35 ?stmt.
    ?stmt ps:P35 ?leader.
    FILTER NOT EXISTS { ?stmt pq:P582 ?endTime. }
    BIND("P35" AS ?prop)
  } UNION {
    ?country p:P6 ?stmt.
    ?stmt ps:P6 ?leader.
    FILTER NOT EXISTS { ?stmt pq:P582 ?endTime. }
    BIND("P6" AS ?prop)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`.trim();
}

/**
 * Fetch current leaders from Wikidata Action API (wbgetentities).
 *
 * Two-pass approach:
 *   1. Batch-fetch all countries (up to 50 per request) to get their P6/P35 claims
 *   2. Batch-fetch all referenced leaders (up to 50 per request) to get their labels
 *
 * The action API is more tolerant of rate limits than the SPARQL endpoint
 * and supports batching up to 50 entities per request.
 *
 * @param {Record<string, Array<{qid: string, role: string}>>} continentEntries
 * @returns {Promise<Record<string, { leader: string, prop: string }>>}
 *   Map of QID -> { leader: "Name", prop: "P35" | "P6" }
 */
async function fetchLeadersFromWikidata(continentEntries) {
  /** @type {Record<string, { leader: string, prop: string }>} */
  const result = {};

  // Collect all unique country QIDs
  const countryQids = new Set();
  for (const entries of Object.values(continentEntries)) {
    for (const e of entries) countryQids.add(e.qid);
  }

  console.log(
    `  Fetching ${countryQids.size} countries from Wikidata Action API...`,
  );

  // ---- Pass 1: fetch all countries to get their leader claims ----
  /** @type {Record<string, { leaderQid: string, prop: string }>} */
  const countryToLeader = {};
  const countryQidArr = [...countryQids];
  const BATCH = 3; // very small batches to avoid 403s from this IP

  for (let i = 0; i < countryQidArr.length; i += BATCH) {
    const batch = countryQidArr.slice(i, i + BATCH);
    const entities = await wbGetEntities(batch, ["claims"]);
    for (const qid of batch) {
      const entity = entities[qid];
      if (!entity?.claims) continue;

      // Try P6 (head of government) first, then P35 (head of state)
      for (const prop of ["P6", "P35"]) {
        const claims = entity.claims[prop];
        if (!claims || claims.length === 0) continue;

        // Find claims with no end time (P582) — presumably currently in office.
        // Some Wikidata claims are stale (missing end time when they should have one),
        // so among the "no end time" claims we prefer the one with the most recent
        // start time (P580). This filters out ousted leaders whose Wikidata entries
        // were never updated with an end date.
        const candidates = claims.filter((c) => !c.qualifiers?.P582);
        if (candidates.length === 0) continue;

        // Sort by start time (P580) descending — most recent first
        candidates.sort((a, b) => {
          const aStart = extractTimeValue(a.qualifiers?.P580);
          const bStart = extractTimeValue(b.qualifiers?.P580);
          // If both have start times, prefer the later one
          if (aStart && bStart) return bStart - aStart;
          // If only one has a start time, prefer it
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;
          return 0;
        });

        const current = candidates[0];
        const leaderQid = current.mainsnak?.datavalue?.value?.id;
        if (leaderQid) {
          countryToLeader[qid] = { leaderQid, prop };
          break; // take the first matching property
        }
      }
    }
    process.stdout.write(
      `    Pass 1: ${Math.min(i + BATCH, countryQidArr.length)}/${countryQidArr.length}\r`,
    );
    if (i + BATCH < countryQidArr.length) await sleep(800);
  }
  console.log("");

  // ---- Pass 2: fetch all leader labels ----
  const leaderQids = new Set();
  for (const { leaderQid } of Object.values(countryToLeader)) {
    leaderQids.add(leaderQid);
  }

  console.log(`  Fetching ${leaderQids.size} leader labels...`);
  /** @type {Record<string, string>} */
  const leaderLabels = {};
  const leaderQidArr = [...leaderQids];

  for (let i = 0; i < leaderQidArr.length; i += BATCH) {
    const batch = leaderQidArr.slice(i, i + BATCH);
    const entities = await wbGetEntities(batch, ["labels"]);
    for (const qid of batch) {
      const label = entities[qid]?.labels?.en?.value;
      if (label) leaderLabels[qid] = label;
    }
    process.stdout.write(
      `    Pass 2: ${Math.min(i + BATCH, leaderQidArr.length)}/${leaderQidArr.length}\r`,
    );
    if (i + BATCH < leaderQidArr.length) await sleep(800);
  }
  console.log("");

  // ---- Merge ----
  let found = 0;
  let missing = 0;
  for (const [countryQid, { leaderQid, prop }] of Object.entries(
    countryToLeader,
  )) {
    const label = leaderLabels[leaderQid];
    if (label) {
      result[countryQid] = { leader: label, prop };
      found++;
    } else {
      console.warn(
        `  WARN: No label for leader ${leaderQid} of country ${countryQid}`,
      );
      missing++;
    }
  }

  console.log(
    `  Resolved: ${found} found, ${missing} missing (of ${countryQids.size} countries)`,
  );
  return result;
}

/**
 * Extract a comparable timestamp from a Wikidata time-valued qualifier.
 * Wikidata stores times as strings like "+2019-04-01T00:00:00Z".
 * Returns milliseconds since epoch, or null if not parseable.
 *
 * @param {Array<{datavalue?: {value?: {time?: string}}}> | undefined} qualifier
 * @returns {number | null}
 */
function extractTimeValue(qualifier) {
  if (!qualifier || !Array.isArray(qualifier) || qualifier.length === 0)
    return null;
  const timeStr = qualifier[0]?.datavalue?.value?.time;
  if (!timeStr || typeof timeStr !== "string") return null;
  // Wikidata format: "+2019-04-01T00:00:00Z" — strip the leading + and parse
  const cleaned = timeStr.replace(/^\+/, "");
  const ts = Date.parse(cleaned);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Call the Wikidata Action API wbgetentities.
 * @param {string[]} ids  Up to 50 entity IDs
 * @param {string[]} props  e.g., ["claims", "labels"]
 * @returns {Promise<Record<string, any>>}  Map of QID -> entity
 */
async function wbGetEntities(ids, props) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    format: "json",
    props: props.join("|"),
    languages: "en",
  });
  const url = `https://www.wikidata.org/w/api.php?${params}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      // 429 = explicit rate limit, 403 = often rate limit from cloud IPs
      if (resp.status === 429 || resp.status === 403) {
        if (attempt < 2) {
          const retryAfter = Number(resp.headers.get("retry-after") || 3);
          console.log(
            `    Rate limited (HTTP ${resp.status}), waiting ${retryAfter}s (attempt 1/2)...`,
          );
          await sleep(retryAfter * 1000);
          continue;
        }
        // On second failure, give up — don't slow down the build further
        return {};
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      return data.entities || {};
    } catch (err) {
      if (attempt === 2) {
        console.warn(
          `    wbgetentities failed for ${ids.length} ids: ${err.message}`,
        );
        return {};
      }
      await sleep(2000);
    }
  }
  return {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read cached data if it exists and is fresh.
 * @returns {Record<string, { leader: string, prop: string } | null> | null}
 */
function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const raw = readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const age = Date.now() - parsed.fetchedAt;
    if (age > CACHE_TTL_MS) {
      console.log(`  Cache expired (age: ${Math.round(age / 1000 / 60)} min)`);
      return null;
    }
    console.log(`  Cache hit (age: ${Math.round(age / 1000 / 60)} min)`);
    return parsed.leaders;
  } catch {
    return null;
  }
}

/**
 * Write cache data.
 * @param {Record<string, { leader: string, prop: string } | null>} leaders
 */
function writeCache(leaders) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    CACHE_FILE,
    JSON.stringify({ fetchedAt: Date.now(), leaders }, null, 2),
  );
  console.log(`  Cache written to ${CACHE_FILE}`);
}

/**
 * Pick 3 plausible distractors from the pool of all leaders (excluding the correct answer).
 * Distractors are from the same continent to keep them plausible.
 *
 * @param {string} correctAnswer
 * @param {string[]} pool  All leader names on this continent
 * @returns {string[]}  3 distractors
 */
function pickDistractors(correctAnswer, pool) {
  const candidates = pool.filter((name) => name !== correctAnswer);
  // Shuffle and take 3
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

/**
 * Build the question text for a country.
 * @param {string} countryName
 * @param {string} role
 * @param {string} dateString  e.g., "2026-08"
 * @returns {string}
 */
function buildQuestionText(countryName, role, dateString) {
  if (role === "monarch") {
    // We don't know the gender from the role alone; the fetched leader name
    // usually includes "King" or "Queen" so we just use "Monarch of"
    return `Monarch of ${countryName} (as of ${dateString})?`;
  }
  const title = roleToTitle(role);
  return `${title} of ${countryName} (as of ${dateString})?`;
}

/**
 * Generate the TypeScript output file.
 *
 * @param {Record<string, Array<{ name: string, qid: string, role: string, level: number, leader: string | null }>>} continentData
 * @param {string} dateString
 */
function generateTypeScript(continentData, dateString) {
  const lines = [
    "/**",
    " * AUTO-GENERATED by scripts/wikidata/generate-leaders.mjs",
    " *",
    ` * Last refreshed: ${dateString}`,
    " * Source: Wikidata SPARQL (https://query.wikidata.org/)",
    " *",
    " * DO NOT EDIT MANUALLY. To refresh, run: pnpm run generate:leaders",
    " *",
    " * This file is committed to the repo as a fallback in case Wikidata",
    " * is unreachable during a build. The build pipeline refreshes it",
    " * automatically before each Vite build.",
    " */",
    "",
    'import type { Question } from "./types";',
    "",
  ];

  for (const [continent, entries] of Object.entries(continentData)) {
    const varName = `${continent.toLowerCase()}Presidents`;
    lines.push(`export const ${varName}: Question[] = [`);

    // Build the pool of all leaders on this continent for distractor generation
    const pool = entries
      .map((e) => e.leader)
      .filter((l) => l !== null && l !== undefined);

    for (const entry of entries) {
      if (!entry.leader) {
        // Skip countries where we couldn't fetch a leader — better to have
        // fewer questions than broken ones
        continue;
      }
      const q = buildQuestionText(entry.name, entry.role, dateString);
      const distractors = pickDistractors(entry.leader, pool);
      const opts = [entry.leader, ...distractors];
      // Shuffle options
      opts.sort(() => Math.random() - 0.5);

      lines.push("  {");
      lines.push(`    q: ${JSON.stringify(q)},`);
      lines.push(`    a: ${JSON.stringify(entry.leader)},`);
      lines.push(`    opts: ${JSON.stringify(opts)},`);
      lines.push(`    lvl: ${entry.level},`);
      lines.push("  },");
    }

    lines.push("];");
    lines.push("");
  }

  writeFileSync(OUTPUT_FILE, lines.join("\n"));
  console.log(`  Written: ${OUTPUT_FILE}`);
}

async function main() {
  console.log("=== Wikidata Leaders Generator ===");

  const forceRefresh = process.env.FORCE_REFRESH === "1";
  const now = new Date();
  const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Flatten all entries for stats
  const allEntries = Object.values(COUNTRIES).flat();
  console.log(`  Total countries: ${allEntries.length}`);

  // Check cache first
  let leaders = null;
  if (!forceRefresh) {
    leaders = readCache();
  } else {
    console.log("  FORCE_REFRESH=1, bypassing cache");
  }

  // Fetch from Wikidata if needed
  if (!leaders) {
    try {
      leaders = await fetchLeadersFromWikidata(COUNTRIES);
      // If we got zero leaders, treat as failure (Wikidata unreachable / rate-limited)
      if (Object.keys(leaders).length === 0) {
        throw new Error(
          "Wikidata returned 0 leaders (rate-limited or unreachable)",
        );
      }
      writeCache(leaders);
    } catch (err) {
      console.error(`  Wikidata fetch failed: ${err.message}`);
      if (existsSync(CACHE_FILE)) {
        console.error("  Falling back to stale cache");
        const raw = readFileSync(CACHE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        leaders = parsed.leaders;
      } else if (existsSync(OUTPUT_FILE)) {
        console.error(
          "  No cache. Keeping existing leaders-generated.ts unchanged.",
        );
        console.error("  Build will proceed with last-known-good data.");
        process.exit(0); // success — build continues with existing file
      } else {
        console.error(
          "  No cache and no existing generated file. Cannot proceed.",
        );
        process.exit(1);
      }
    }
  }

  // Build continent data with resolved leaders
  /** @type {Record<string, Array<{ name: string, qid: string, role: string, level: number, leader: string | null }>>} */
  const continentData = {};
  let missingCount = 0;
  let foundCount = 0;

  for (const [continent, entries] of Object.entries(COUNTRIES)) {
    continentData[continent] = entries.map((entry) => {
      const cached = leaders[entry.qid];
      const wantedProp = roleToProperty(entry.role);

      // If the country has the property we want, use it
      if (cached && cached.prop === wantedProp && cached.leader) {
        foundCount++;
        return { ...entry, leader: cached.leader };
      }

      // If the country has a different property (e.g., we wanted P35 but only
      // P6 exists, or vice versa), use what we have rather than nothing
      if (cached && cached.leader) {
        foundCount++;
        return { ...entry, leader: cached.leader };
      }

      // No data for this country
      missingCount++;
      console.warn(`  WARN: No leader found for ${entry.name} (${entry.qid})`);
      return { ...entry, leader: null };
    });
  }

  console.log(`  Resolved: ${foundCount} found, ${missingCount} missing`);

  if (missingCount > 0) {
    console.warn(
      `  ${missingCount} countries have no leader data — they will be skipped in the output.`,
    );
  }

  generateTypeScript(continentData, dateString);
  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
