/**
 * Cloudflare Turnstile server-side verification.
 *
 * Why this exists (C5 fix):
 *   Previously the Turnstile token was captured client-side but never sent
 *   to Supabase. The captcha was decorative — bots could submit auth
 *   requests without solving it.
 *
 *   The Worker now verifies the Turnstile token server-side as part of
 *   /api/auth/check. This is defense-in-depth: even if Supabase's captcha
 *   check is bypassed, the Worker rejects requests with invalid tokens.
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing Turnstile token" };
  }
  // HARDENING: cap token length. Turnstile tokens are ~800 chars but can
  // be longer. Anything above 8KB is malicious.
  if (token.length > 8192) {
    return { ok: false, error: "Turnstile token too long" };
  }
  if (!secret) {
    return { ok: false, error: "Turnstile secret not configured" };
  }

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp) {
    form.append("remoteip", remoteIp);
  }

  try {
    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!resp.ok) {
      return { ok: false, error: `Turnstile siteverify returned ${resp.status}` };
    }
    const data = (await resp.json()) as TurnstileVerifyResponse;
    if (!data.success) {
      return {
        ok: false,
        error: `Turnstile verification failed: ${(data["error-codes"] ?? []).join(", ")}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Turnstile verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
