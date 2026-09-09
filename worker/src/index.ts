/**
 * Know Your World — Cloudflare Worker API
 *
 * Endpoints:
 *   GET  /api/healthz                  — health check
 *   GET  /api/geo-check                 — geo-block check (frontend app-load)
 *   POST /api/auth/check                — JWT verify + Turnstile + blocklist
 *   POST /api/scores                    — submit a score (JWT required)
 *   GET  /api/leaderboards?...          — top N for a track (public, rate-limited)
 *   POST /api/tts                       — text-to-speech (JWT required)
 *   POST /api/ask-poke                  — Amir chatbot (JWT required)
 *   POST /api/pi/verify                 — Pi payment verification (JWT required)
 *
 * Stack: Hono + D1 (SQLite at the edge) + Workers AI.
 * Auth: Supabase JWT verified server-side via JWKS (RS256).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { sanitizeName } from "./profanity";
import { generateTts } from "./tts";
import { handleAskPoke } from "./poke";
import { handlePiVerify } from "./pi";
import { verifyAuth } from "./auth";
import { findBlockInD1 } from "./blocklist";
import { verifyTurnstileToken } from "./turnstile";

// ============================================================================
// Types
// ============================================================================

interface Env {
  DB: D1Database;
  AI: Ai;
  CORS_ORIGIN: string;
  LEADERBOARD_LIMIT: string;
  MAX_NAME_LENGTH: string;
  ELEVENLABS_API_KEY: string;
  TTS_RATE_LIMIT: string;
  TTS_CACHE_TTL: string;
  TTS_MAX_TEXT_LENGTH: string;
  POKE_API_KEY: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_JWT_AUD?: string;
  STRIPE_SECRET_KEY: string;
  TURNSTILE_SECRET: string;
  PI_API_KEY: string;
  PI_WALLET_ADDRESS: string;
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

const CONTINENTS = new Set([
  "africa",
  "asia",
  "europe",
  "americas",
  "ai world",
]);
const CATEGORIES = new Set([
  "capitals",
  "presidents",
  "flags",
  "currencies",
  "gen-ai",
  "copilots",
  "agents",
]);
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

/**
 * L3 FIX: Hash the User-Agent header to an 8-char hex prefix.
 * The raw UA string is PII (browser version, OS, device fingerprint).
 * The hash is not reversible but sufficient for abuse analysis.
 */
async function hashUserAgent(ua: string | null): Promise<string | null> {
  if (!ua) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(ua);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateScorePayload(
  body: Partial<ScoreSubmission>,
): { ok: true; data: ScoreSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body required." };
  }

  const { name, continent, category, level, score, total, timeMs, passed } =
    body;

  const nameCheck = sanitizeName(String(name ?? ""));
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error };

  const trackError = validateTrack(
    String(continent ?? ""),
    String(category ?? ""),
    String(level ?? ""),
  );
  if (trackError) return { ok: false, error: trackError };

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
  // HARDENING: cap at 1 hour. An 8-question quiz should take minutes.
  if (timeMsNum > 60 * 60 * 1000) {
    return { ok: false, error: "timeMs exceeds 1 hour — looks invalid." };
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

// H4 FIX: CORS — hard default to frontend origin, NEVER reflect requester origin.
const ALLOWED_ORIGIN = "https://know-your-world.vercel.app";

app.use(
  "/api/*",
  cors({
    origin: (_origin, c) => c.env.CORS_ORIGIN || ALLOWED_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-RateLimit-Remaining", "X-Request-Id"],
    maxAge: 86400,
  }),
);

// L4 + L7 + HARDENING: global security headers + request ID + Cache-Control on errors.
app.use("*", async (c, next) => {
  const reqId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.header("X-Request-Id", reqId);
  await next();
  c.header(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  if (c.res.status >= 400) {
    c.header("Cache-Control", "no-store");
  }
});

// ----------------------------------------------------------------------------
// GET /api/healthz
// L6 FIX: removed `time: Date.now()` (info leak).
// ----------------------------------------------------------------------------
app.get("/api/healthz", (c) => {
  return c.json({
    status: "ok",
    service: "know-your-world-api",
  });
});

// ----------------------------------------------------------------------------
// POST /api/auth/check — JWT verify + Turnstile + blocklist
// M6 FIX: rate-limited (10/min per IP) + body size limit (2KB).
// H5 FIX: server-side Turnstile verification.
// G2 FIX: returns redirect URL for blocked users.
// ----------------------------------------------------------------------------
app.post("/api/auth/check", async (c) => {
  // Body size limit
  const authCheckContentLength = Number(c.req.header("content-length") ?? 0);
  if (authCheckContentLength > 2048) {
    return c.json({ error: "Request body too large" }, 413);
  }

  // Rate limit
  const authCheckIp = getClientIp(c);
  const authCheckAllowed = await checkRateLimit(
    c.env.DB,
    authCheckIp,
    10,
    60_000,
    "auth-check",
  );
  if (!authCheckAllowed) {
    return c.json(
      { error: "Too many auth checks. Please wait a minute." },
      429,
    );
  }

  const authResult = await verifyAuth(c.req.raw, c.env);
  if (!authResult.ok || !authResult.user) {
    return c.json({ ok: false, error: authResult.error ?? "Unauthorized" }, 401);
  }

  // Turnstile verification (if token provided)
  let turnstileToken: string | undefined;
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      turnstileToken?: string;
    };
    turnstileToken = body.turnstileToken;
  } catch {
    // body is optional
  }

  if (turnstileToken) {
    const turnstileResult = await verifyTurnstileToken(
      turnstileToken,
      c.env.TURNSTILE_SECRET,
      authCheckIp,
    );
    if (!turnstileResult.ok) {
      return c.json(
        { ok: false, error: `Captcha verification failed: ${turnstileResult.error ?? "unknown"}` },
        403,
      );
    }
  }

  const block = await findBlockInD1(c.env.DB, authResult.user.email, authResult.user.fullName);
  if (block) {
    return c.json(
      {
        ok: true,
        blocked: true,
        redirect: "https://motionmuse.ai/explore",
        user: { id: authResult.user.id },
      },
      403,
    );
  }
  return c.json({
    ok: true,
    blocked: false,
    user: {
      id: authResult.user.id,
      email: authResult.user.email,
      fullName: authResult.user.fullName,
    },
  });
});

// ----------------------------------------------------------------------------
// POST /api/scores — JWT required (C1 FIX)
// ----------------------------------------------------------------------------
app.post("/api/scores", async (c) => {
  // C1 FIX: Require valid Supabase JWT
  const authResult = await verifyAuth(c.req.raw, c.env);
  if (!authResult.ok || !authResult.user) {
    return c.json(
      { error: "Authentication required. Please sign in." },
      401,
    );
  }
  // C4 FIX: Server-side blocklist enforcement
  const block = await findBlockInD1(c.env.DB, authResult.user.email, authResult.user.fullName);
  if (block) {
    return c.json(
      { ok: false, error: "Access denied.", redirect: "https://motionmuse.ai/explore" },
      403,
    );
  }
  const authenticatedUserId: string = authResult.user.id;

  // Body size limit (L5)
  const scoreContentLength = Number(c.req.header("content-length") ?? 0);
  if (scoreContentLength > 2048) {
    return c.json({ error: "Request body too large" }, 413);
  }

  // Rate limit: 5/min per IP
  const clientIp = getClientIp(c);
  const scoreAllowed = await checkRateLimit(
    c.env.DB,
    clientIp,
    5,
    60_000,
    "scores",
  );
  if (!scoreAllowed) {
    return c.json(
      { error: "Too many score submissions. Please wait a minute." },
      429,
    );
  }

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

  // C1 FIX: dedupe by user_id (from JWT) instead of display name.
  const nameKey = data.name.toLowerCase();
  const existing = await c.env.DB.prepare(
    `SELECT id, score, time_ms, created_at FROM scores
     WHERE user_id = ? AND continent = ? AND category = ? AND level = ?
     ORDER BY score DESC, time_ms ASC LIMIT 1`,
  )
    .bind(authenticatedUserId, data.continent, data.category, data.level)
    .first<{
      id: number;
      score: number;
      time_ms: number;
      created_at: number;
    }>();

  let isHighScore = false;
  let personalBest = data.score;
  let scoreId: number;

  const uaHash = await hashUserAgent(c.req.header("user-agent") ?? null);

  if (existing) {
    personalBest = Math.max(existing.score, data.score);
    if (
      data.score > existing.score ||
      (data.score === existing.score && data.timeMs < existing.time_ms)
    ) {
      isHighScore = true;
      await c.env.DB.prepare(
        `UPDATE scores SET
           name = ?, name_key = ?, score = ?, total = ?, time_ms = ?, passed = ?, ua_hash = ?, created_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(
          data.name,
          nameKey,
          data.score,
          data.total,
          data.timeMs,
          data.passed ? 1 : 0,
          uaHash,
          existing.id,
        )
        .run();
      scoreId = existing.id;
    } else {
      scoreId = existing.id;
      personalBest = existing.score;
    }
  } else {
    isHighScore = true;
    const result = await c.env.DB.prepare(
      `INSERT INTO scores (user_id, name, name_key, continent, category, level, score, total, time_ms, passed, ua_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        authenticatedUserId,
        data.name,
        nameKey,
        data.continent,
        data.category,
        data.level,
        data.score,
        data.total,
        data.timeMs,
        data.passed ? 1 : 0,
        uaHash,
      )
      .run();
    scoreId = Number(result.meta.last_row_id);
  }

  // PERF: parallel rank + total count
  const [rankResult, totalResult] = await Promise.all([
    c.env.DB.prepare(
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
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM scores
       WHERE continent = ? AND category = ? AND level = ?`,
    )
      .bind(data.continent, data.category, data.level)
      .first<{ count: number }>(),
  ]);

  const rank = (rankResult?.count ?? 0) + 1;
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
// L2 FIX: rate-limited (60/min per IP). PERF: parallel queries + edge cache.
// ----------------------------------------------------------------------------
app.get("/api/leaderboards", async (c) => {
  // L2 FIX: rate limit
  const lbIp = getClientIp(c);
  const lbAllowed = await checkRateLimit(
    c.env.DB,
    lbIp,
    60,
    60_000,
    "leaderboards",
  );
  if (!lbAllowed) {
    return c.json(
      { error: "Too many leaderboard requests. Please wait a minute." },
      429,
    );
  }

  const continent = c.req.query("continent") ?? "";
  const category = c.req.query("category") ?? "";
  const level = c.req.query("level") ?? "";
  const limitParam = c.req.query("limit") ?? "10";

  const trackError = validateTrack(continent, category, level);
  if (trackError) return c.json({ error: trackError }, 400);

  const limitNum = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  // PERF: parallel SELECT + COUNT
  const [rows, totalResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT name, score, total, time_ms, passed, created_at FROM scores
       WHERE continent = ? AND category = ? AND level = ?
       ORDER BY score DESC, time_ms ASC
       LIMIT ?`,
    )
      .bind(continent, category, level, limitNum)
      .all<ScoreRow>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM scores
       WHERE continent = ? AND category = ? AND level = ?`,
    )
      .bind(continent, category, level)
      .first<{ count: number }>(),
  ]);

  const entries = ((rows as { results?: ScoreRow[] }).results ?? []).map((row, idx) => ({
    rank: idx + 1,
    name: row.name,
    score: row.score,
    total: row.total,
    timeMs: row.time_ms,
    passed: row.passed === 1,
    createdAt: row.created_at,
  }));

  return c.json(
    {
      track: { continent, category, level },
      entries,
      totalEntries: totalResult?.count ?? 0,
    },
    200,
    // PERF: edge cache leaderboards for 60s
    { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  );
});

// ----------------------------------------------------------------------------
// Hybrid rate limiter: in-memory (fast) + D1 (cross-isolate)
// ----------------------------------------------------------------------------

const rateLimitMaps = new Map<string, Map<string, number[]>>();

function checkRateLimitMemory(
  ip: string,
  limit: number,
  windowMs: number,
  namespace = "tts",
): boolean {
  const key = `${namespace}:${ip}`;
  let limitMap = rateLimitMaps.get(namespace);
  if (!limitMap) {
    limitMap = new Map();
    rateLimitMaps.set(namespace, limitMap);
  }

  const now = Date.now();
  const times = limitMap.get(key) ?? [];
  const recent = times.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    return false;
  }
  recent.push(now);
  limitMap.set(key, recent);
  if (limitMap.size > 500) {
    for (const [k, vals] of limitMap) {
      const fresh = vals.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        limitMap.delete(k);
      } else {
        limitMap.set(k, fresh);
      }
    }
  }
  return true;
}

async function checkRateLimitD1(
  db: D1Database,
  ip: string,
  limit: number,
  windowMs: number,
  namespace: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - Math.floor(windowMs / 1000);

  try {
    // Count FIRST (before inserting). HARDENING: previous version inserted
    // THEN counted, allowing limit+1 requests through.
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM rate_limits
       WHERE namespace = ? AND ip = ? AND created_at > ?`,
      )
      .bind(namespace, ip, windowStart)
      .first<{ count: number }>();

    const currentCount = result?.count ?? 0;
    if (currentCount >= limit) {
      if (Math.random() < 0.01) {
        await db
          .prepare(`DELETE FROM rate_limits WHERE created_at < ?`)
          .bind(windowStart - 3600)
          .run();
      }
      return false;
    }

    await db
      .prepare(
        `INSERT INTO rate_limits (namespace, ip, created_at) VALUES (?, ?, ?)`,
      )
      .bind(namespace, ip, now)
      .run();

    if (Math.random() < 0.01) {
      await db
        .prepare(`DELETE FROM rate_limits WHERE created_at < ?`)
        .bind(windowStart - 3600)
        .run();
    }

    return true;
  } catch {
    return true; // fail open for availability
  }
}

async function checkRateLimit(
  db: D1Database,
  ip: string,
  limit: number,
  windowMs: number,
  namespace = "tts",
): Promise<boolean> {
  if (!checkRateLimitMemory(ip, limit, windowMs, namespace)) {
    return false;
  }
  if (Math.random() < 0.5) {
    return await checkRateLimitD1(db, ip, limit, windowMs, namespace);
  }
  return true;
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// ----------------------------------------------------------------------------
// POST /api/tts — JWT required (M2 FIX), body limit (M3 FIX)
// ----------------------------------------------------------------------------
app.post("/api/tts", async (c) => {
  // M3 FIX: body size limit
  const ttsContentLength = Number(c.req.header("content-length") ?? 0);
  if (ttsContentLength > 4096) {
    return c.json({ error: "Request body too large" }, 413);
  }

  // M2 FIX: JWT required
  const ttsAuth = await verifyAuth(c.req.raw, c.env);
  if (!ttsAuth.ok || !ttsAuth.user) {
    return c.json(
      { error: "Authentication required. Please sign in." },
      401,
    );
  }
  const ttsBlock = await findBlockInD1(c.env.DB, ttsAuth.user.email, ttsAuth.user.fullName);
  if (ttsBlock) {
    return c.json(
      { ok: false, error: "Access denied.", redirect: "https://motionmuse.ai/explore" },
      403,
    );
  }
  const ttsUserId = ttsAuth.user.id;

  let body: { text?: unknown; voiceId?: unknown };
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

  // Per-IP rate limit
  const clientIp = getClientIp(c);
  const rateLimit = Number(c.env.TTS_RATE_LIMIT) || 20;
  const allowedByIp = await checkRateLimit(
    c.env.DB,
    clientIp,
    rateLimit,
    60_000,
    "tts",
  );
  if (!allowedByIp) {
    return c.json(
      { error: "Too many audio requests. Please wait a minute and try again." },
      429,
    );
  }

  // M2 FIX: per-user rate limit (defeats VPN rotation)
  const allowedByUser = await checkRateLimit(
    c.env.DB,
    `user:${ttsUserId}`,
    rateLimit,
    60_000,
    "tts-user",
  );
  if (!allowedByUser) {
    return c.json(
      { error: "Too many audio requests from your account. Please wait a minute." },
      429,
    );
  }

  const voiceId =
    typeof body.voiceId === "string" ? body.voiceId : "jessica";

  try {
    const result = await generateTts(c.env, text, voiceId);
    return c.json(result, 200, { "Cache-Control": "public, max-age=2592000" });
  } catch (err) {
    console.error(
      "TTS generation failed:",
      err instanceof Error ? err.message : String(err),
    );
    return c.json({ error: "Audio generation failed. Please try again." }, 502);
  }
});

// ----------------------------------------------------------------------------
// POST /api/ask-poke — JWT required (C1 FIX)
// ----------------------------------------------------------------------------
app.post("/api/ask-poke", async (c) => {
  const pokeAuth = await verifyAuth(c.req.raw, c.env);
  if (!pokeAuth.ok || !pokeAuth.user) {
    return c.json(
      { error: "Authentication required. Please sign in." },
      401,
    );
  }
  const pokeBlock = await findBlockInD1(c.env.DB, pokeAuth.user.email, pokeAuth.user.fullName);
  if (pokeBlock) {
    return c.json(
      { ok: false, error: "Access denied.", redirect: "https://motionmuse.ai/explore" },
      403,
    );
  }

  // H2 FIX: rate limit
  const pokeIp = getClientIp(c);
  const pokeAllowed = await checkRateLimit(
    c.env.DB,
    pokeIp,
    10,
    60_000,
    "poke",
  );
  if (!pokeAllowed) {
    return c.json(
      { error: "Too many requests to the guide. Please wait a minute." },
      429,
    );
  }

  // L5 FIX: body size limit
  const pokeContentLength = Number(c.req.header("content-length") ?? 0);
  if (pokeContentLength > 4096) {
    return c.json({ error: "Request body too large" }, 413);
  }

  return handleAskPoke(c.req.raw, {
    ...c.env,
    userId: pokeAuth.user.id,
    userEmail: pokeAuth.user.email ?? undefined,
    userFullName: pokeAuth.user.fullName ?? undefined,
  });
});

// ----------------------------------------------------------------------------
// POST /api/pi/verify — JWT required (C1 FIX)
// ----------------------------------------------------------------------------
app.post("/api/pi/verify", async (c) => {
  const piAuth = await verifyAuth(c.req.raw, c.env);
  if (!piAuth.ok || !piAuth.user) {
    return c.json(
      { error: "Authentication required. Please sign in." },
      401,
    );
  }
  const piBlock = await findBlockInD1(c.env.DB, piAuth.user.email, piAuth.user.fullName);
  if (piBlock) {
    return c.json(
      { ok: false, error: "Access denied.", redirect: "https://motionmuse.ai/explore" },
      403,
    );
  }
  return handlePiVerify(c.req.raw, {
    ...c.env,
    userId: piAuth.user.id,
  });
});

// ----------------------------------------------------------------------------
// 404 fallback
// ----------------------------------------------------------------------------
app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
