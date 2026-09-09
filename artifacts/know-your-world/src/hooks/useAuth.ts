/**
 * useAuth — Supabase auth hook.
 *
 * Supports:
 *   - Google OAuth
 *   - GitHub OAuth
 *   - Email/password signup + signin
 *   - Email verification
 *
 * Session persists in localStorage via Supabase SDK.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
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
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      if (data.user && !data.session) {
        // Email verification required
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
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
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
    isSignedIn: !!session,
    displayName: user?.user_metadata?.full_name ?? user?.email ?? null,
  };
}
