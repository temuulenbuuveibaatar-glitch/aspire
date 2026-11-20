// Server-only Supabase access. Supabase is the database only (sign-in is Clerk); browsers never
// talk to it, so there is no anon client. Never import this file from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Service-role client for trusted server work (bypasses RLS). Throws only when used without config. */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
