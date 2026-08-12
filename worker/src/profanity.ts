/**
 * Profanity filter + name sanitizer — K12-appropriate.
 *
 * Strategy:
 *   1. Strip HTML-like content (XSS protection) — reject names containing
 *      <, >, &, javascript:, data:, or HTML entity encodings.
 *   2. Normalize the input: lowercase, strip diacritics, replace common
 *      leetspeak substitutions (@ -> a, $ -> s, 0 -> o, 1 -> i, etc.),
 *      collapse ALL repeated chars to a single char.
 *   3. Search for any blocklist word as a substring of the normalized form.
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
 * Patterns that indicate HTML/script injection attempts.
 * If any match, the name is rejected outright.
 */
const XSS_PATTERNS: readonly RegExp[] = [
  /</, // any < char (HTML tag start)
  />/, // any > char (HTML tag end)
  /&[#a-z0-9]/i, // HTML entity: &#60; &lt; &amp; etc.
  /javascript:/i, // javascript: URI
  /data:/i, // data: URI (can carry XSS payloads)
  /vbscript:/i, // vbscript: URI (IE)
  /on\w+\s*=/i, // inline event handlers: onclick=, onerror=, etc.
];

/**
 * Returns true if the input looks like an HTML/script injection attempt.
 */
function looksLikeXss(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Normalize a string for profanity checking.
 * Strips diacritics, lowercases, replaces leetspeak, collapses ALL repeated
 * chars to a single char (so "shiiit" -> "shit", not "shiit").
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
      // Collapse ALL repeated chars to single: "shiiit" -> "shit"
      .replace(/(.)\1+/g, "$1")
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
 *
 * Checks (in order):
 *   1. Non-empty after trim
 *   2. Max 20 characters
 *   3. No HTML/script injection patterns (XSS protection)
 *   4. No profanity (with leetspeak normalization)
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
  if (looksLikeXss(trimmed)) {
    return {
      ok: false,
      error: "That name isn't allowed. Try a different one!",
    };
  }
  if (containsProfanity(trimmed)) {
    return {
      ok: false,
      error: "That name isn't allowed. Try a different one!",
    };
  }
  return { ok: true, name: trimmed };
}
