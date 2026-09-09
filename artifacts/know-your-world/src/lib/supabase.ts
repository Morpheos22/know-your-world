/**
 * Supabase client — safe for frontend (uses publishable/anon key only).
 *
 * H1 FIX (C3): what changed and why
 * ─────────────────────────────────────────────────────────────────────────
 * The publishable (anon) key is BY DESIGN safe to expose to the client —
 * Supabase relies on Row-Level Security (RLS) policies to gate access, not
 * on the key being secret. So the key being in the bundle is not the bug.
 *
 * The real bug was the SILENT FALLBACK chain:
 *   import.meta.env.VITE_SUPABASE_URL ?? "https://cwwhyufeviblebpoigqn..."
 *   import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_U4qDN..."
 *   import.meta.env.VITE_TURNSTILE_SITEKEY ?? "0x4AAAAAAEtZ7S..."
 *
 * If a `.env` file was missing or misspelled in production, Vercel would
 * silently fall back to these dev values — the app would keep working
 * against the DEV Supabase project / DEV Turnstile sitekey, with no
 * error visible to the operator.
 *
 * Fix:
 *   - In development (import.meta.env.DEV), keep the dev fallbacks so
 *     `pnpm dev` works without a .env file.
 *   - In production, REQUIRE the env vars. If missing, throw at module
 *     load — the Vercel build will fail loudly so the operator knows.
 *
 * RLS requirement:
 *   Because the publishable key is in the bundle, EVERY Supabase table that
 *   the client can read or write MUST have RLS enabled. Verify in Supabase
 *   Dashboard → Authentication → Policies.
 */
import { createClient } from "@supabase/supabase-js";

const isProd = import.meta.env.PROD;

const DEV_SUPABASE_URL = "https://cwwhyufeviblebpoigqn.supabase.co";
const DEV_SUPABASE_ANON_KEY = "sb_publishable_U4qDNqyPg6hjAE9cia5pYA_BxZGTGyQ";
const DEV_TURNSTILE_SITEKEY = "0x4AAAAAAEtZ7SNEmXzjt4Mc";

function requireEnv(name: string, fallback: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (value) return value;
  if (isProd) {
    throw new Error(
      `[supabase] Missing required env var ${name} in production. ` +
        `Set it in Vercel → Project Settings → Environment Variables.`,
    );
  }
  if (import.meta.env.DEV) {
    console.warn(
      `[supabase] ${name} not set — using dev fallback. Do NOT ship to production.`,
    );
  }
  return fallback;
}

const SUPABASE_URL = requireEnv("VITE_SUPABASE_URL", DEV_SUPABASE_URL);
const SUPABASE_ANON_KEY = requireEnv(
  "VITE_SUPABASE_ANON_KEY",
  DEV_SUPABASE_ANON_KEY,
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // HARDENING: explicit storageKey so a future SDK upgrade can't
    // silently change it (which would log out all users).
    storageKey: "kyw-auth-token",
    // HARDENING: PKCE flow (more secure than implicit — auth code can't
    // be intercepted and replayed).
    flowType: "pkce",
  },
});

export const TURNSTILE_SITEKEY = requireEnv(
  "VITE_TURNSTILE_SITEKEY",
  DEV_TURNSTILE_SITEKEY,
);
