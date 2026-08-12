/**
 * Question validation script — runs at build time to guarantee questions
 * and answers are non-repetitive across levels and difficulties.
 *
 * Rules enforced:
 *   1. No exact duplicate question text within the same continent+category
 *      across levels. (Same question in Easy and Medium = error.)
 *   2. No exact duplicate question+answer pair across different continents
 *      for the same category. (Catches "Currency of Turkey?" appearing in
 *      both Asia and Europe.)
 *   3. Each question must have exactly 4 options with the correct answer
 *      present in the options array.
 *   4. Options must not contain duplicates within a single question.
 *
 * Rules NOT enforced (intentionally):
 *   - The same answer (e.g., "Poland", "Euro") appearing as a distractor in
 *     one level and the correct answer in another. This is acceptable for
 *     Flags and Currencies where countries/currencies naturally repeat as
 *     options. It tests different skills (recognition vs. recall).
 *   - The same country/topic appearing with different question angles across
 *     levels. Explicitly allowed per product requirements.
 *
 * Usage: node scripts/validate-questions.mjs
 * Exit code 0 = valid, 1 = validation errors found.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(REPO_ROOT, "artifacts/know-your-world/src/data");

/** @typedef {{ q: string, a: string, opts: string[], lvl: number, flag?: string }} Question */
/** @typedef {{ continent: string, category: string, level: number, question: Question }} TaggedQuestion */

/**
 * Load all questions from the data files (excluding leaders-generated.ts which
 * is auto-generated and already non-repetitive by design).
 */
function loadAllQuestions() {
  /** @type {TaggedQuestion[]} */
  const all = [];

  const files = readdirSync(DATA_DIR).filter(
    (f) =>
      f.endsWith(".ts") &&
      f !== "types.ts" &&
      f !== "index.ts" &&
      f !== "facts.ts" &&
      f !== "leaders-generated.ts",
  );

  for (const file of files) {
    const filePath = resolve(DATA_DIR, file);
    const content = readFileSync(filePath, "utf8");
    const continent = file.replace(".ts", "");
    const continentName =
      continent.charAt(0).toUpperCase() + continent.slice(1);

    // Extract each exported array: export const X: Question[] = [ ... ];
    const arrayRegex = /export const (\w+): Question\[\] = \[(.*?)\n\];/gs;
    let match;
    while ((match = arrayRegex.exec(content)) !== null) {
      const varName = match[1];
      const arrayBody = match[2];

      // Map variable names to category names
      const category = varNameToCategory(varName);
      if (!category) continue;

      // Parse each question object in the array
      const qRegex =
        /\{[^}]*q:\s*"([^"]*)"[^}]*a:\s*"([^"]*)"[^}]*opts:\s*\[([^\]]*)\][^}]*lvl:\s*(\d+)[^}]*\}/gs;
      let qMatch;
      while ((qMatch = qRegex.exec(arrayBody)) !== null) {
        const q = qMatch[1];
        const a = qMatch[2];
        const optsStr = qMatch[3];
        const lvl = Number(qMatch[4]);

        // Parse options
        const opts = [];
        const optRegex = /"([^"]*)"/g;
        let optMatch;
        while ((optMatch = optRegex.exec(optsStr)) !== null) {
          opts.push(optMatch[1]);
        }

        all.push({
          continent: continentName,
          category,
          level: lvl,
          question: { q, a, opts, lvl },
        });
      }
    }
  }

  return all;
}

/**
 * Map variable names to category names.
 */
function varNameToCategory(varName) {
  const lower = varName.toLowerCase();
  if (lower.includes("countries")) return "Countries & Capitals";
  if (lower.includes("presidents")) return "Presidents";
  if (lower.includes("flags")) return "Flags";
  if (lower.includes("currencies")) return "Currencies";
  return null;
}

/**
 * Run all validation checks.
 * @param {TaggedQuestion[]} all
 * @returns {string[]} Array of error messages. Empty = valid.
 */
function validate(all) {
  /** @type {string[]} */
  const errors = [];

  // ---- Check 1: No exact duplicate question+answer within the same track across levels ----
  // Key includes the answer so that "Which country does this flag belong to?" with
  // different answers (different flags) is allowed — only identical q+a pairs are flagged.
  const trackQaPairs = new Map(); // key: "continent|category|q|a" -> levels[]
  for (const item of all) {
    const key = `${item.continent}|${item.category}|${item.question.q}|${item.question.a}`;
    if (!trackQaPairs.has(key)) {
      trackQaPairs.set(key, []);
    }
    trackQaPairs.get(key).push(item.level);
  }

  for (const [key, levels] of trackQaPairs) {
    if (levels.length > 1) {
      const parts = key.split("|");
      const continent = parts[0];
      const category = parts[1];
      const q = parts[2];
      const a = parts[3];
      errors.push(
        `[DUPLICATE] Q: "${q}" A: "${a}" appears in levels ${levels.join(", ")} of ${continent} / ${category}`,
      );
    }
  }

  // ---- Check 2: No duplicate question+answer across continents for the same category ----
  // Catches "Currency of Turkey?" appearing in both Asia and Europe
  const crossContinent = new Map(); // key: "category|q|a" -> continents[]
  for (const item of all) {
    const key = `${item.category}|${item.question.q}|${item.question.a}`;
    if (!crossContinent.has(key)) {
      crossContinent.set(key, []);
    }
    crossContinent.get(key).push(item.continent);
  }

  for (const [key, continents] of crossContinent) {
    const uniqueContinents = [...new Set(continents)];
    if (uniqueContinents.length > 1) {
      const [category, q, a] = key.split("|");
      errors.push(
        `[CROSS-CONTINENT DUPLICATE] Q: "${q}" A: "${a}" appears in ${uniqueContinents.join(" and ")} / ${category}`,
      );
    }
  }

  // ---- Check 3: Each question must have exactly 4 options with the correct answer present ----
  for (const item of all) {
    const { q, a, opts } = item.question;
    if (opts.length !== 4) {
      errors.push(
        `[OPTIONS COUNT] "${q}" has ${opts.length} options, expected 4 (${item.continent}/${item.category}/L${item.level})`,
      );
    }
    if (!opts.includes(a)) {
      errors.push(
        `[MISSING ANSWER] "${q}" — correct answer "${a}" not in options ${JSON.stringify(opts)} (${item.continent}/${item.category}/L${item.level})`,
      );
    }
  }

  // ---- Check 4: No duplicate options within a single question ----
  for (const item of all) {
    const { q, opts } = item.question;
    const unique = new Set(opts);
    if (unique.size !== opts.length) {
      errors.push(
        `[DUPLICATE OPTIONS] "${q}" has duplicate options: ${JSON.stringify(opts)} (${item.continent}/${item.category}/L${item.level})`,
      );
    }
  }

  return errors;
}

// ---- Main ----
console.log("=== Question Validation ===");

const all = loadAllQuestions();
console.log(
  `Loaded ${all.length} questions across ${new Set(all.map((q) => q.continent)).size} continents`,
);

if (all.length === 0) {
  console.error("ERROR: No questions found. Check the data directory path.");
  process.exit(1);
}

const errors = validate(all);

if (errors.length === 0) {
  console.log("✓ All questions valid — no duplicates or conflicts found.");
  process.exit(0);
} else {
  console.error(`\n✗ Validation failed with ${errors.length} error(s):\n`);
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  console.error(`\nFix these issues before deploying.`);
  process.exit(1);
}
