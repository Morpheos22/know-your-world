/**
 * Supabase client — safe for frontend (uses publishable/anon key).
 * The secret key is stored as a Worker secret and never touches the client.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://cwwhyufeviblebpoigqn.supabase.co";

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_U4qDNqyPg6hjAE9cia5pYA_BxZGTGyQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const TURNSTILE_SITEKEY =
  (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined) ??
  "0x4AAAAAAEtZ7SNEmXzjt4Mc";
