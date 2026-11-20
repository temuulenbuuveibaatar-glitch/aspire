// Server-only Supabase clients. Never import this file from a client component.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/supabase/env";

/** Supabase client acting as the signed-in person (reads and refreshes the session cookie). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes
          // the session on every request, so nothing is lost.
        }
      },
    },
  });
}

/** Service-role client for trusted server work (bypasses RLS). Throws only when used without a key. */
export function supabaseAdmin(): SupabaseClient {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set: server features that write to Supabase are unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
