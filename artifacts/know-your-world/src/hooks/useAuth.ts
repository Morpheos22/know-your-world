/**
 * useAuth — Supabase auth hook + server-side blocklist check.
 *
 * C5 FIX: passes Turnstile captchaToken to supabase.auth.signUp() and
 * signInWithPassword(). AuthModal disables all buttons until
 * turnstileReady === true.
 *
 * C4 FIX: calls /api/auth/check on every session change. The Worker
 * verifies the JWT AND checks the D1-backed blocklist. If the server
 * says blocked, signs the user out + performs redirect to
 * motionmuse.ai/explore.
 *
 * G2 FIX: if the server check is unreachable but the local blocklist
 * matches, performs the redirect directly from the frontend.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { authedFetch } from "../lib/auth";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

// Global to store the Turnstile token (set by the Turnstile callback)
let turnstileToken: string | null = null;

export function setTurnstileToken(token: string | null) {
  turnstileToken = token;
}

export function getTurnstileToken(): string | null {
  return turnstileToken;
}

// Client-side blocklist (defense-in-depth UX fallback). Server-side
// blocklist in worker/src/blocklist.ts is the source of truth.
const BLOCKED_NAMES = ["faiza fadipe", "faiza", "fadipe"];
const BLOCKED_EMAILS = ["faizafadipe1@gmail.com"];

function isUserBlockedLocally(user: User | null): boolean {
  if (!user) return false;
  const email = (user.email ?? "").toLowerCase();
  const fullName = (user.user_metadata?.full_name ?? "").toLowerCase();

  if (BLOCKED_EMAILS.includes(email)) return true;
  if (BLOCKED_NAMES.some((name) => fullName.includes(name))) return true;
  return false;
}

/**
 * Calls POST /api/auth/check on the Worker. The Worker verifies the JWT
 * AND checks the server-side blocklist. Returns { blocked, reachable }.
 */
async function checkServerSideBlock(
  session: Session | null,
): Promise<{ blocked: boolean; reachable: boolean }> {
  if (!session) return { blocked: false, reachable: true };
  try {
    const turnstileToken = getTurnstileToken();
    const resp = await authedFetch(`${API_BASE}/api/auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken }),
    });
    if (resp.status === 403) {
      // authedFetch already fired performRedirect if `redirect` was in body.
      // If we get here, redirect was throttled — fall back to local check.
      const data = await resp.json().catch(() => ({}));
      if (data?.ok === false && typeof data.error === "string" && data.error.toLowerCase().includes("captcha")) {
        return { blocked: false, reachable: false };
      }
      return { blocked: true, reachable: true };
    }
    if (resp.status === 401) {
      return { blocked: false, reachable: false };
    }
    if (!resp.ok) {
      return { blocked: false, reachable: false };
    }
    const data = (await resp.json()) as { blocked?: boolean };
    return { blocked: Boolean(data.blocked), reachable: true };
  } catch {
    return { blocked: false, reachable: false };
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const currentUser = data.session?.user ?? null;
      setSession(data.session);
      setUser(currentUser);
      const serverCheck = await checkServerSideBlock(data.session);
      if (cancelled) return;
      const blockedNow =
        serverCheck.blocked ||
        (!serverCheck.reachable && isUserBlockedLocally(currentUser));
      setBlocked(blockedNow);
      if (serverCheck.blocked) {
        await supabase.auth.signOut();
      } else if (!serverCheck.reachable && isUserBlockedLocally(currentUser)) {
        const { performRedirect } = await import("../lib/redirect");
        performRedirect("https://motionmuse.ai/explore");
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const currentUser = newSession?.user ?? null;
      setSession(newSession);
      setUser(currentUser);
      const serverCheck = await checkServerSideBlock(newSession);
      if (cancelled) return;
      const blockedNow =
        serverCheck.blocked ||
        (!serverCheck.reachable && isUserBlockedLocally(currentUser));
      setBlocked(blockedNow);
      if (serverCheck.blocked) {
        await supabase.auth.signOut();
      } else if (!serverCheck.reachable && isUserBlockedLocally(currentUser)) {
        const { performRedirect } = await import("../lib/redirect");
        performRedirect("https://motionmuse.ai/explore");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    // Note: signInWithOAuth doesn't accept captchaToken — OAuth providers
    // handle their own anti-bot. Worker /api/auth/check verifies Turnstile
    // server-side as defense-in-depth.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (err) setError(err.message);
  }, []);

  const signInWithGitHub = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (err) setError(err.message);
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      // C5 FIX: pass Turnstile token to Supabase.
      const captchaToken = getTurnstileToken();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          captchaToken: captchaToken ?? undefined,
        },
      });
      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      if (data.user && !data.session) {
        return {
          ok: true as const,
          needsVerification: true,
          message: "Check your email for a verification link!",
        };
      }
      return { ok: true as const, needsVerification: false };
    },
    [],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      // C5 FIX: pass Turnstile token to Supabase.
      const captchaToken = getTurnstileToken();
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          captchaToken: captchaToken ?? undefined,
        },
      });
      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      return { ok: true as const };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  return {
    session,
    user,
    loading,
    error,
    signInWithGoogle,
    signInWithGitHub,
    signUpWithEmail,
    signInWithEmail,
    signOut,
    isSignedIn: !!session && !blocked,
    blocked,
    displayName: user?.user_metadata?.full_name ?? user?.email ?? null,
  };
}
