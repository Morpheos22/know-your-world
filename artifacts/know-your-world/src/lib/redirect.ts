/**
 * Blocklist redirect handler.
 *
 * The operator has requested that users on the blocklist be redirected
 * to https://motionmuse.ai/explore (instead of showing an Access Denied
 * screen).
 *
 * - performRedirect: window.location.replace + 1h throttle to prevent loops
 * - checkGeoOnLoad: called on app startup, fetches /api/auth/check via the
 *   Worker (which checks the D1-backed blocklist server-side)
 */

const REDIRECT_STORAGE_KEY = "kyw_redirected_at";
const REDIRECT_URL = "https://motionmuse.ai/explore";

export function performRedirect(url: string): void {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(REDIRECT_STORAGE_KEY) ?? 0);
    if (now - last < 60 * 60 * 1000) {
      console.warn("[redirect] skipping redirect (throttled)", url);
      return;
    }
    localStorage.setItem(REDIRECT_STORAGE_KEY, String(now));
  } catch {
    // localStorage may be unavailable — proceed anyway
  }
  window.location.replace(url);
}

/**
 * App-load check: fetch /api/auth/check (the Worker verifies the JWT and
 * checks the D1 blocklist). If the response says blocked, redirect.
 *
 * Fire-and-forget — caller should NOT await. If the Worker is unreachable,
 * the next authenticated API call will surface the block via authedFetch.
 */
export async function checkBlocklistOnLoad(): Promise<void> {
  const API_BASE =
    (import.meta.env.VITE_API_BASE as string | undefined) ??
    "https://know-your-world-api.morphylee22.workers.dev";
  try {
    const { authedFetch } = await import("./auth");
    const resp = await authedFetch(`${API_BASE}/api/auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (resp.status === 403) {
      // Worker says blocked (or captcha failed — but on initial load with
      // no Turnstile token, it's the block path). authedFetch already
      // fired performRedirect if `redirect` was in the body.
      // As a fallback (if redirect was throttled), don't throw — just
      // let the user see the Access Denied screen via useAuth's local check.
      return;
    }
  } catch {
    // Network error — fall back to local check in useAuth.
  }
}
