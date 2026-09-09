/**
 * Text-to-Speech generation — ElevenLabs primary, Workers AI fallback, D1 cache.
 *
 * Flow:
 *   1. Hash the input text + voice ID (SHA-256) — cache key includes voice
 *   2. Check D1 cache (tts_cache table) — return cached audio if hit and fresh
 *   3. Cache miss → call ElevenLabs with the specified voice
 *   4. If ElevenLabs fails → fall back to Cloudflare Workers AI (@cf/myshell-ai/mptts)
 *   5. Store result in D1 cache with provider tag
 *   6. Return { audio, contentType, provider, cached }
 *
 * Voice selection: the caller passes a voiceId (e.g., "jessica", "charlie").
 * The worker maps it to an ElevenLabs voice ID via the VOICE_MAP below.
 * If voiceId is not recognized, defaults to Jessica (freemium default).
 */

interface Env {
  DB: D1Database;
  AI: Ai;
  ELEVENLABS_API_KEY: string;
  TTS_CACHE_TTL: string;
}

export interface TtsResult {
  /** Base64-encoded audio data */
  audio: string;
  /** MIME type, always 'audio/mpeg' */
  contentType: string;
  /** Which provider generated this audio */
  provider: "elevenlabs" | "workers-ai";
  /** Whether this was served from cache */
  cached: boolean;
}

/**
 * Voice ID → ElevenLabs voice ID mapping.
 * Must match the frontend voices.ts catalog.
 */
const VOICE_MAP: Record<string, string> = {
  // Freemium
  jessica: "cgSgspJ2msm6clMCkdW9",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  charlie: "IKne3meq5aSn9XLyUdCD",
  // Premium
  jazzy: "lBIlRrTlN5ZTPkQzWrCc",
  beth: "utezIGbCLSGO3Z7oKJwL",
  sally: "6Sau1r3osO0DDuk8TAi3",
  alisha: "x60qi81yLOkhyoqo0iH2",
  natasha: "FBS8ofW8J5OOpakRj2cI",
  aleja: "gvu7T7CL0qv3iEbOiaTF",
  jeremy: "FH7lRgC0mVybq7Y40tMa",
  zain: "kTmRervbB02qoZhoY4dF",
  rupert: "cROcuppTjlT7WHGPhWiH",
  david: "J6fZJ9oZVkfNAzrfGJiQ",
  // Legacy
  morpheos: "FneGH0QzKZCLmpj2XRD9",
};

/** Default voice if none specified or unrecognized */
const DEFAULT_ELEVENLABS_VOICE = "cgSgspJ2msm6clMCkdW9"; // Jessica

/**
 * Compute SHA-256 hash of text, return hex string.
 * Uses Web Crypto API (available in Workers runtime).
 */
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Main TTS function — handles caching, ElevenLabs, and Workers AI fallback.
 * @param env Worker environment
 * @param text Text to synthesize
 * @param voiceId Voice ID (e.g., "jessica", "charlie", "morpheos")
 */
export async function generateTts(
  env: Env,
  text: string,
  voiceId: string = "jessica",
): Promise<TtsResult> {
  // Resolve the ElevenLabs voice ID from our voice ID
  const elevenLabsVoiceId = VOICE_MAP[voiceId] ?? DEFAULT_ELEVENLABS_VOICE;

  // Cache key includes voice ID so different voices are cached separately
  const cacheKey = `${voiceId}:${text}`;
  const textHash = await hashText(cacheKey);
  const cacheTtl = Number(env.TTS_CACHE_TTL) || 2592000; // 30 days
  const now = Math.floor(Date.now() / 1000);
  const cacheCutoff = now - cacheTtl;

  // ---- 1. Check D1 cache ----
  const cached = await env.DB.prepare(
    `SELECT audio_b64, provider, content_type, created_at FROM tts_cache
     WHERE text_hash = ? AND created_at > ?`,
  )
    .bind(textHash, cacheCutoff)
    .first<{
      audio_b64: string;
      provider: string;
      content_type: string;
      created_at: number;
    }>();

  if (cached) {
    return {
      audio: cached.audio_b64,
      contentType: cached.content_type,
      provider: cached.provider as "elevenlabs" | "workers-ai",
      cached: true,
    };
  }

  // ---- 2. Try ElevenLabs ----
  let audioBuffer: ArrayBuffer | null = null;
  let provider: "elevenlabs" | "workers-ai" = "elevenlabs";

  if (env.ELEVENLABS_API_KEY && elevenLabsVoiceId) {
    try {
      audioBuffer = await callElevenLabs(
        env.ELEVENLABS_API_KEY,
        elevenLabsVoiceId,
        text,
      );
    } catch (err) {
      console.warn(
        `ElevenLabs TTS failed, falling back to Workers AI: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- 3. Fallback to Workers AI ----
  if (!audioBuffer) {
    try {
      audioBuffer = await callWorkersAi(env.AI, text);
      provider = "workers-ai";
    } catch (err) {
      throw new Error(
        `Both ElevenLabs and Workers AI failed. Last error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- 4. Convert to base64 ----
  const audioBase64 = bufferToBase64(audioBuffer);

  // ---- 5. Store in D1 cache ----
  // Use INSERT OR REPLACE to handle the case where the text_hash exists but
  // was expired (we want to overwrite with fresh audio)
  // Store the cacheKey (voiceId:text) in the text column for debugging
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO tts_cache (text_hash, text, audio_b64, provider, content_type, created_at)
       VALUES (?, ?, ?, ?, 'audio/mpeg', ?)`,
    )
      .bind(textHash, cacheKey.slice(0, 500), audioBase64, provider, now)
      .run();
  } catch (err) {
    // Cache write failure is non-fatal — we still return the audio
    console.warn(
      `TTS cache write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    audio: audioBase64,
    contentType: "audio/mpeg",
    provider,
    cached: false,
  };
}

/**
 * Call ElevenLabs TTS API.
 * Returns ArrayBuffer of MP3 audio.
 */
async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<ArrayBuffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5", // fastest model, lowest latency
      voice_settings: {
        // Lower stability (0.35) allows emotional variation — the voice
        // sounds happy, animated, and engaged rather than monotone.
        // Kids respond to warmth and energy in a voice.
        stability: 0.35,
        // Moderate similarity_boost (0.75) keeps the Morpheos voice
        // recognizable while allowing enough flexibility for expressive,
        // whimsical delivery. Too high locks the voice into one pattern.
        similarity_boost: 0.75,
        // High style (0.5) = expressive, theatrical, whimsical.
        // This makes the voice sound joyful and fun — kids want to engage
        // with a voice that sounds like it's enjoying the game too.
        // It adds natural inflection and playfulness to the delivery.
        style: 0.5,
        // use_speaker_boost=true enhances voice clarity and addresses
        // the plosive inflection issue on words starting with "b" (and
        // other plosives). Speaker boost emphasizes the voice's natural
        // characteristics, smoothing out sharp consonant emphasis and
        // making the delivery more consistent across all phonemes.
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.arrayBuffer();
}

/**
 * Call Cloudflare Workers AI TTS as fallback.
 * Uses @cf/myshell-ai/mptts model.
 * Returns ArrayBuffer of MP3 audio.
 */
async function callWorkersAi(ai: Ai, text: string): Promise<ArrayBuffer> {
  // Workers AI TTS expects a prompt and returns audio
  const response = (await ai.run("@cf/myshell-ai/mptts", {
    prompt: text,
  })) as { audio?: string } | ReadableStream | ArrayBuffer;

  // Workers AI returns the audio in different formats depending on version
  // Handle both base64 string and binary ArrayBuffer
  if (response instanceof ArrayBuffer) {
    return response;
  }

  if (response instanceof ReadableStream) {
    return new Response(response).arrayBuffer();
  }

  // Some versions return { audio: "base64..." }
  if (
    response &&
    typeof response === "object" &&
    "audio" in response &&
    response.audio
  ) {
    // Decode base64 to ArrayBuffer
    const binary = atob(response.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  throw new Error("Workers AI returned unexpected response format");
}
