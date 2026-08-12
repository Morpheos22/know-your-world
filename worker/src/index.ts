/**
 * Know Your World — Cloudflare Worker API
 *
 * Endpoints:
 *   GET  /api/healthz                  — health check
 *   POST /api/scores                   — submit a score
 *   GET  /api/leaderboards?...         — top N for a track
 *   POST /api/tts                      — text-to-speech (ElevenLabs + Workers AI fallback)
 *
 * Stack: Hono + D1 (SQLite at the edge) + Workers AI. No auth — name-keyed.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { sanitizeName } from "./profanity";
import { generateTts } from "./tts";

// ============================================================================
// Types
// ============================================================================

interface Env {
  DB: D1Database;
  AI: Ai;
  CORS_ORIGIN: string;
  LEADERBOARD_LIMIT: string;
  MAX_NAME_LENGTH: string;
  ELEVENLABS_VOICE_ID: string;
  ELEVENLABS_API_KEY: string;
  TTS_RATE_LIMIT: string;
  TTS_CACHE_TTL: string;
  TTS_MAX_TEXT_LENGTH: string;
}

interface ScoreSubmission {
  name: string;
  continent: string;
  category: string;
  level: string;
  score: number;
  total: number;
  timeMs: number;
  passed: boolean;
}

interface ScoreRow {
  id: number;
  name: string;
  name_key: string;
  continent: string;
  category: string;
  level: string;
  score: number;
  total: number;
  time_ms: number;
  passed: number;
  created_at: number;
}

// ============================================================================
// Validation
// ============================================================================

const CONTINENTS = new Set(["africa", "asia", "europe", "americas"]);
const CATEGORIES = new Set(["capitals", "presidents", "flags", "currencies"]);
const LEVELS = new Set(["easy", "medium", "hard"]);

function validateTrack(
  continent: string,
  category: string,
  level: string,
): string | null {
  if (!CONTINENTS.has(continent)) return `Invalid continent: ${continent}`;
  if (!CATEGORIES.has(category)) return `Invalid category: ${category}`;
  if (!LEVELS.has(level)) return `Invalid level: ${level}`;
  return null;
}

function validateScorePayload(
  body: Partial<ScoreSubmission>,
): { ok: true; data: ScoreSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body required." };
  }

  const { name, continent, category, level, score, total, timeMs, passed } =
    body;

  // Name
  const nameCheck = sanitizeName(String(name ?? ""));
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error };

  // Track
  const trackError = validateTrack(
    String(continent ?? ""),
    String(category ?? ""),
    String(level ?? ""),
  );
  if (trackError) return { ok: false, error: trackError };

  // Numeric fields
  const scoreNum = Number(score);
  const totalNum = Number(total);
  const timeMsNum = Number(timeMs);

  if (!Number.isFinite(scoreNum) || scoreNum < 0) {
    return { ok: false, error: "score must be a non-negative number." };
  }
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    return { ok: false, error: "total must be a positive number." };
  }
  if (scoreNum > totalNum) {
    return { ok: false, error: "score cannot exceed total." };
  }
  if (!Number.isFinite(timeMsNum) || timeMsNum < 0) {
    return { ok: false, error: "timeMs must be a non-negative number." };
  }
  if (timeMsNum > 24 * 60 * 60 * 1000) {
    return { ok: false, error: "timeMs exceeds 24 hours — looks invalid." };
  }

  return {
    ok: true,
    data: {
      name: nameCheck.name,
      continent: String(continent),
      category: String(category),
      level: String(level),
      score: scoreNum,
      total: totalNum,
      timeMs: timeMsNum,
      passed: Boolean(passed),
    },
  };
}

// ============================================================================
// App
// ============================================================================

const app = new Hono<{ Bindings: Env }>();

// CORS — locked to the frontend origin set in wrangler.toml
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => c.env.CORS_ORIGIN || origin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

// ----------------------------------------------------------------------------
// GET /api/healthz
// ----------------------------------------------------------------------------
app.get("/api/healthz", (c) => {
  return c.json({
    status: "ok",
    service: "know-your-world-api",
    time: Date.now(),
  });
});

// ----------------------------------------------------------------------------
// POST /api/scores
// Body: ScoreSubmission
// Returns: { id, rank, totalEntries, isHighScore, personalBest }
// ----------------------------------------------------------------------------
app.post("/api/scores", async (c) => {
  let body: Partial<ScoreSubmission>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const validation = validateScorePayload(body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }
  const data = validation.data;

  // Check for existing best score for this name on this track.
  // Same display name (case-insensitive) on the same track = same row, deduped
  // by highest score. If the new score is higher, update; otherwise reject
  // silently (return the existing best so the frontend can show "personal best").
  const nameKey = data.name.toLowerCase();
  const existing = await c.env.DB.prepare(
    `SELECT id, score, time_ms, created_at FROM scores
     WHERE name_key = ? AND continent = ? AND category = ? AND level = ?
     ORDER BY score DESC, time_ms ASC LIMIT 1`,
  )
    .bind(nameKey, data.continent, data.category, data.level)
    .first<{
      id: number;
      score: number;
      time_ms: number;
      created_at: number;
    }>();

  let isHighScore = false;
  let personalBest = data.score;
  let scoreId: number;

  if (existing) {
    // Already have an entry. Update only if the new score is strictly higher,
    // OR equal but faster.
    personalBest = Math.max(existing.score, data.score);
    if (
      data.score > existing.score ||
      (data.score === existing.score && data.timeMs < existing.time_ms)
    ) {
      isHighScore = true;
      await c.env.DB.prepare(
        `UPDATE scores SET
           name = ?, score = ?, total = ?, time_ms = ?, passed = ?, user_agent = ?, created_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(
          data.name,
          data.score,
          data.total,
          data.timeMs,
          data.passed ? 1 : 0,
          c.req.header("user-agent") ?? null,
          existing.id,
        )
        .run();
      scoreId = existing.id;
    } else {
      // New score isn't better — keep the existing row, return its values.
      scoreId = existing.id;
      personalBest = existing.score;
    }
  } else {
    // First entry for this name on this track — insert.
    isHighScore = true;
    const result = await c.env.DB.prepare(
      `INSERT INTO scores (name, name_key, continent, category, level, score, total, time_ms, passed, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        data.name,
        nameKey,
        data.continent,
        data.category,
        data.level,
        data.score,
        data.total,
        data.timeMs,
        data.passed ? 1 : 0,
        c.req.header("user-agent") ?? null,
      )
      .run();
    scoreId = Number(result.meta.last_row_id);
  }

  // Compute rank: how many scores are strictly better on this track?
  // Tiebreak: faster time beats slower time at the same score.
  const rankResult = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM scores
     WHERE continent = ? AND category = ? AND level = ?
       AND (score > ? OR (score = ? AND time_ms < ?))`,
  )
    .bind(
      data.continent,
      data.category,
      data.level,
      data.score,
      data.score,
      data.timeMs,
    )
    .first<{ count: number }>();

  const rank = (rankResult?.count ?? 0) + 1;

  // Total entries on this track
  const totalResult = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM scores
     WHERE continent = ? AND category = ? AND level = ?`,
  )
    .bind(data.continent, data.category, data.level)
    .first<{ count: number }>();

  const totalEntries = totalResult?.count ?? 0;
  const percentile =
    totalEntries > 0 ? Math.round((1 - (rank - 1) / totalEntries) * 100) : 100;

  return c.json({
    id: scoreId,
    rank,
    totalEntries,
    percentile,
    isHighScore,
    personalBest,
  });
});

// ----------------------------------------------------------------------------
// GET /api/leaderboards?continent=&category=&level=&limit=
// Returns: { entries: [{ rank, name, score, total, timeMs, createdAt }], totalEntries }
// ----------------------------------------------------------------------------
app.get("/api/leaderboards", async (c) => {
  const continent = c.req.query("continent") ?? "";
  const category = c.req.query("category") ?? "";
  const level = c.req.query("level") ?? "";
  const limitParam = c.req.query("limit") ?? "10";

  const trackError = validateTrack(continent, category, level);
  if (trackError) return c.json({ error: trackError }, 400);

  const limitNum = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  const rows = await c.env.DB.prepare(
    `SELECT name, score, total, time_ms, passed, created_at FROM scores
     WHERE continent = ? AND category = ? AND level = ?
     ORDER BY score DESC, time_ms ASC
     LIMIT ?`,
  )
    .bind(continent, category, level, limitNum)
    .all<ScoreRow>();

  const entries = (rows.results ?? []).map((row, idx) => ({
    rank: idx + 1,
    name: row.name,
    score: row.score,
    total: row.total,
    timeMs: row.time_ms,
    passed: row.passed === 1,
    createdAt: row.created_at,
  }));

  const totalResult = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM scores
     WHERE continent = ? AND category = ? AND level = ?`,
  )
    .bind(continent, category, level)
    .first<{ count: number }>();

  return c.json({
    track: { continent, category, level },
    entries,
    totalEntries: totalResult?.count ?? 0,
  });
});

// ----------------------------------------------------------------------------
// POST /api/tts
// Body: { text: string }
// Returns: audio/mpeg (binary) on success, JSON error on failure
//
// Flow:
//   1. Validate input (max 500 chars, non-empty, sanitize)
//   2. Check D1 cache (tts_cache table) — if hit and not expired, return cached audio
//   3. Cache miss → call ElevenLabs with Morpheos voice
//   4. If ElevenLabs fails → fall back to Cloudflare Workers AI TTS
//   5. Store result in D1 cache (30-day TTL)
//   6. Return audio as base64 JSON (frontend decodes and plays)
//
// Rate limiting: per-IP, configurable via TTS_RATE_LIMIT env var (default 20/min)
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// In-memory rate limiter for TTS — per-IP, sliding 60-second window.
// Workers isolates persist across requests, so this works for rate limiting
// within a single isolate. For multi-isolate precision we'd need D1 or KV,
// but for a kids' game this is sufficient and far cheaper than D1 queries.
// ----------------------------------------------------------------------------
const ttsRequestTimes = new Map<string, number[]>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const times = ttsRequestTimes.get(ip) ?? [];
  // Filter to only timestamps within the window
  const recent = times.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    return false; // rate limited
  }
  recent.push(now);
  ttsRequestTimes.set(ip, recent);
  // Periodic cleanup: if the map is getting large, prune old entries
  if (ttsRequestTimes.size > 1000) {
    for (const [key, vals] of ttsRequestTimes) {
      const fresh = vals.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        ttsRequestTimes.delete(key);
      } else {
        ttsRequestTimes.set(key, fresh);
      }
    }
  }
  return true;
}

// ----------------------------------------------------------------------------
// POST /api/tts
// Body: { text: string }
// Returns: { audio, contentType, provider, cached } on success
//
// Flow:
//   1. Validate input (max 500 chars, non-empty)
//   2. Rate limit check (per-IP, in-memory, configurable)
//   3. Call generateTts() which checks D1 cache, then ElevenLabs, then Workers AI
//
// Security:
//   - D1 parameterized queries prevent SQL injection
//   - Text is not interpreted as HTML by the frontend (React escapes by default)
//   - Audio is returned as base64 JSON, not executed
// ----------------------------------------------------------------------------
app.post("/api/tts", async (c) => {
  let body: { text?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const rawText = typeof body.text === "string" ? body.text : "";
  const maxLen = Number(c.env.TTS_MAX_TEXT_LENGTH) || 500;
  const text = rawText.trim();

  if (text.length === 0) {
    return c.json({ error: "Text is required." }, 400);
  }
  if (text.length > maxLen) {
    return c.json({ error: `Text must be ${maxLen} characters or less.` }, 400);
  }

  // Rate limiting: per-IP, in-memory sliding window
  const clientIp =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const rateLimit = Number(c.env.TTS_RATE_LIMIT) || 20;
  const allowed = checkRateLimit(clientIp, rateLimit, 60_000);
  if (!allowed) {
    return c.json(
      { error: "Too many audio requests. Please wait a minute and try again." },
      429,
    );
  }

  try {
    const result = await generateTts(c.env, text);
    return c.json(result, 200, { "Cache-Control": "public, max-age=2592000" });
  } catch (err) {
    console.error("TTS generation failed:", err);
    return c.json({ error: "Audio generation failed. Please try again." }, 502);
  }
});

// ----------------------------------------------------------------------------
// 404 fallback
// ----------------------------------------------------------------------------
app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
