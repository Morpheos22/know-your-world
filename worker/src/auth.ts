/**
 * Supabase JWT verification — server-side auth for the KYW Worker.
 *
 * Why this exists (C1 fix):
 *   /api/scores, /api/ask-poke, /api/pi/verify, /api/tts, /api/auth/check
 *   used to accept any anonymous POST. Now the Worker requires a valid
 *   Supabase access token (the same one the frontend gets after sign-in)
 *   and verifies it by fetching Supabase's JWKS and checking the JWT
 *   signature with WebCrypto (RS256).
 *
 * Flow:
 *   1. Read Authorization: Bearer <jwt> header.
 *   2. Decode header to find `kid`.
 *   3. Fetch Supabase's JWKS (cached 1h per isolate). If `kid` is missing
 *      from the cache, force a refresh and retry once (handles key rotation).
 *   4. Verify the signature using WebCrypto (RS256).
 *   5. Validate standard claims: exp, iat, nbf (with 30s clock skew),
 *      iss, aud.
 *   6. Return { ok, user } where user = { id, email, fullName }.
 *
 * The Worker never sees the Supabase SECRET key. It only uses the JWT's
 * public key (JWKS) to verify — this is the correct pattern.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_JWT_AUD?: string;
}

export interface VerifiedUser {
  id: string;
  email: string | null;
  fullName: string | null;
}

export interface VerifyResult {
  ok: boolean;
  user?: VerifiedUser;
  error?: string;
}

// ----------------------------------------------------------------------------
// JWKS cache (per-isolate)
// ----------------------------------------------------------------------------

interface JwkKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string; // RSA modulus (base64url)
  e?: string; // RSA exponent (base64url)
}

interface JwksCache {
  keys: JwkKey[];
  fetchedAt: number; // ms epoch
}

let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJwks(supabaseUrl: string, forceRefresh = false): Promise<JwkKey[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    throw new Error(`JWKS fetch failed: ${resp.status}`);
  }
  // HARDENING: cap the response size. A legitimate Supabase JWKS is < 2KB.
  // Anything above 64KB is either a misconfigured Supabase project or a
  // MITM attempting to OOM the Worker.
  const text = await resp.text();
  if (text.length > 65536) {
    throw new Error(`JWKS response too large: ${text.length} bytes`);
  }
  let data: { keys?: JwkKey[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JWKS response is not valid JSON");
  }
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error("JWKS response missing keys array");
  }
  // HARDENING: cap the number of keys. Supabase typically has 1-3 keys.
  if (data.keys.length > 50) {
    throw new Error(`JWKS has too many keys: ${data.keys.length}`);
  }
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

/**
 * Find a JWK by `kid`. If the kid is not in the cached JWKS, force a
 * refresh and try once more. This handles Supabase key rotation.
 */
async function findSigningKey(supabaseUrl: string, kid?: string): Promise<JwkKey | null> {
  const keys = await fetchJwks(supabaseUrl);
  if (kid) {
    const direct = keys.find((k) => k.kid === kid);
    if (direct) return direct;
    // H6: kid not in cached JWKS — refresh and retry once.
    const refreshed = await fetchJwks(supabaseUrl, true);
    const afterRefresh = refreshed.find((k) => k.kid === kid);
    if (afterRefresh) return afterRefresh;
    return null;
  }
  return keys[0] ?? null;
}

// ----------------------------------------------------------------------------
// JWT decoding helpers
// ----------------------------------------------------------------------------

function base64UrlDecode(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) {
    s += "=";
  }
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeStr(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

interface SupabaseJwtPayload {
  iss: string;
  sub: string; // user id
  aud: string | string[];
  exp: number;
  iat?: number;
  nbf?: number; // not-before
  email?: string;
  role?: string;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { full_name?: string; name?: string };
}

// ----------------------------------------------------------------------------
// Signature verification using WebCrypto
// ----------------------------------------------------------------------------

async function importRsaPublicKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "RSA",
      n: jwk.n,
      e: jwk.e,
      alg: "RS256",
      ext: true,
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

// ----------------------------------------------------------------------------
// Main entrypoint — verify an Authorization header
// ----------------------------------------------------------------------------

export async function verifyAuth(
  request: Request,
  env: Env,
): Promise<VerifyResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, error: "Missing Authorization header" };
  }
  const token = match[1].trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Malformed JWT (expected 3 parts)" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: JwtHeader;
  let payload: SupabaseJwtPayload;
  try {
    header = JSON.parse(base64UrlDecodeStr(headerB64)) as JwtHeader;
    payload = JSON.parse(base64UrlDecodeStr(payloadB64)) as SupabaseJwtPayload;
  } catch {
    return { ok: false, error: "Malformed JWT (header/payload decode failed)" };
  }

  if (header.alg !== "RS256") {
    return { ok: false, error: `Unsupported alg: ${header.alg}` };
  }

  // Validate claims with 30s clock skew tolerance
  const nowSec = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW = 30;
  if (typeof payload.exp !== "number" || payload.exp < nowSec - CLOCK_SKEW) {
    return { ok: false, error: "JWT expired" };
  }
  if (typeof payload.iat === "number" && payload.iat > nowSec + CLOCK_SKEW) {
    return { ok: false, error: "JWT issued in the future (clock skew?)" };
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + CLOCK_SKEW) {
    return { ok: false, error: "JWT not yet valid" };
  }
  const expectedIssuer = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  if (payload.iss !== expectedIssuer) {
    return { ok: false, error: `Invalid issuer: ${payload.iss}` };
  }
  const expectedAud = env.SUPABASE_ANON_JWT_AUD ?? "authenticated";
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedAud)
    : payload.aud === expectedAud;
  if (!audOk) {
    return { ok: false, error: `Invalid audience: ${payload.aud}` };
  }

  // Verify signature
  let signingKey: JwkKey | null;
  try {
    signingKey = await findSigningKey(env.SUPABASE_URL, header.kid);
  } catch (err) {
    return {
      ok: false,
      error: `JWKS fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!signingKey || !signingKey.n || !signingKey.e) {
    return { ok: false, error: "No matching JWKS key found" };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importRsaPublicKey(signingKey);
  } catch (err) {
    return {
      ok: false,
      error: `Key import failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const signedInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    "RS256",
    cryptoKey,
    signature,
    signedInput,
  );
  if (!valid) {
    return { ok: false, error: "Invalid JWT signature" };
  }

  return {
    ok: true,
    user: {
      id: payload.sub,
      email: payload.email ?? null,
      fullName: payload.user_metadata?.full_name ?? null,
    },
  };
}
