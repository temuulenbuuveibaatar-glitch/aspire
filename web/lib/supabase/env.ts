// Public Supabase settings. Referenced as literal `process.env.NEXT_PUBLIC_*` so Next inlines
// them into the browser bundle. The anon key may be a new-style `sb_publishable_...` key.
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anonKey };
}
