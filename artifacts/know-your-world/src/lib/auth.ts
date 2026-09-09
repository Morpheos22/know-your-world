/**
 * Auth token helpers — shared utilities for authenticated API calls.
 *
 * The Supabase session access_token is the JWT the Worker uses (via the
 * `verifyAuth` middleware in worker/src/auth.ts) to authenticate
 * /api/scores, /api/ask-poke, /api/pi/verify, /api/tts, /api/auth/check.
 */

import { supabase } from "../lib/supabase";

/** Returns the current Supabase session's access token, or null if no session. */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[auth] getSession error:", error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}

/** Build an Authorization header object, or {} if no session. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch wrapper that auto-injects the Authorization header.
 * G2 FIX: also checks every 403 response for a `redirect` field (added
 * by the Worker when the user is on the blocklist or geo-blocked). If
 * present, performs the redirect immediately.
 */
export async function authedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  for (const [k, v] of Object.entries(auth)) {
    headers.set(k, v);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(url, { ...init, headers });

  // G2 FIX: check for redirect field in blocked responses.
  if (resp.status === 403) {
    try {
      const data = (await resp.clone().json()) as { redirect?: string };
      if (typeof data.redirect === "string" && data.redirect.startsWith("https://")) {
        const { performRedirect } = await import("./redirect");
        performRedirect(data.redirect);
      }
    } catch {
      // Not JSON or no redirect field — let the caller handle the 403.
    }
  }
  return resp;
}

/** Standard error messages for 401/403. */
export function authErrorMessage(status: number): string | null {
  if (status === 401) {
    return "Please sign in to submit your score.";
  }
  if (status === 403) {
    return "Access denied.";
  }
  return null;
}
