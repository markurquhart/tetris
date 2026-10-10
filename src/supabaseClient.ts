import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * `.env.example` ships placeholders and the README tells you to copy it, so a
 * half-finished .env is the normal first-run state. Treat those values as "not
 * configured" rather than firing doomed requests at a host that cannot resolve
 * — otherwise every read fails with an opaque "TypeError: Failed to fetch".
 */
const PLACEHOLDER = /YOUR_PROJECT|YOUR_ANON_KEY|^\s*$/i;

function looksConfigured(u: string | undefined, k: string | undefined): boolean {
  if (!u || !k) return false;
  if (PLACEHOLDER.test(u) || PLACEHOLDER.test(k)) return false;
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = looksConfigured(url, key);

/** Host shown in error messages so a bad URL is obvious at a glance. */
export const supabaseHost: string | null = (() => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
})();

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
