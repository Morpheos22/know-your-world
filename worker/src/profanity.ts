/**
 * Profanity filter — K12-appropriate blocklist with leetspeak normalization.
 *
 * Strategy:
 *   1. Normalize the input: lowercase, strip diacritics, replace common
 *      leetspeak substitutions (@ -> a, $ -> s, 0 -> o, 1 -> i, etc.),
 *      collapse repeated chars.
 *   2. Search for any blocklist word as a substring of the normalized form.
 *
 * This is intentionally simple — false positives are acceptable, false
 * negatives are not. For a kids' game, we err on the side of rejection.
 */

// Curated K12 blocklist. Kept short on purpose — only words that would
// alarm a teacher or parent if displayed on a leaderboard.
// Each entry is matched as a substring after normalization.
const BLOCKLIST: readonly string[] = [
  // Slurs and strong profanity
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "dick",
  "pussy",
  "asshole",
  "cock",
  "dick",
  "prick",
  "wank",
  "slut",
  "whore",
  // Hate terms
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "retarded",
  "tranny",
  // Milder but still inappropriate for K12 leaderboards
  "damn",
  "crap",
  "piss",
  "hell",
  "arse",
  // Drugs / substances (for K12 sensitivity)
  "weed",
  "cocaine",
  "heroin",
  "meth",
  "crack",
  // Common substitutions that kids try
  "fuk",
  "shyt",
  "bich",
  "basturd",
  "dik",
  "pusy",
  "ashole",
];

/**
 * Normalize a string for profanity checking.
 * Strips diacritics, lowercases, replaces leetspeak, collapses repeats.
 */
function normalize(input: string): string {
  return (
    input
      .toLowerCase()
      // Strip diacritics: café -> cafe
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Leetspeak substitutions
      .replace(/@/g, "a")
      .replace(/\$/g, "s")
      .replace(/0/g, "o")
      .replace(/1/g, "i")
      .replace(/3/g, "e")
      .replace(/4/g, "a")
      .replace(/5/g, "s")
      .replace(/7/g, "t")
      .replace(/8/g, "b")
      .replace(/9/g, "g")
      // Strip non-alphanumeric (spaces, punctuation, symbols, emoji)
      .replace(/[^a-z]/g, "")
      // Collapse repeated chars: "shiiit" -> "shit"
      .replace(/(.)\1{2,}/g, "$1$1")
  );
}

/**
 * Returns true if the input contains any blocklisted word.
 * Also checks the raw input (some profanity uses Unicode tricks that
 * survive normalization).
 */
export function containsProfanity(input: string): boolean {
  if (!input) return false;
  const normalized = normalize(input);
  // Also check the raw lowercase form (without leetspeak substitution)
  // in case a real word got mangled by over-eager normalization.
  const rawLower = input.toLowerCase().replace(/[^a-z]/g, "");
  return BLOCKLIST.some(
    (word) => normalized.includes(word) || rawLower.includes(word),
  );
}

/**
 * Sanitize a player name for storage.
 * Returns { ok, name } on success, { ok: false, error } on rejection.
 */
export function sanitizeName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  // Trim and collapse internal whitespace
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    return { ok: false, error: "Please enter your name, explorer!" };
  }
  if (trimmed.length > 20) {
    return { ok: false, error: "Names must be 20 characters or less." };
  }
  if (containsProfanity(trimmed)) {
    return {
      ok: false,
      error: "That name isn't allowed. Try a different one!",
    };
  }
  return { ok: true, name: trimmed };
}
