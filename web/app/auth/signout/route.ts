import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// POST /auth/signout (a plain form post from Settings) -> clears the session, then /login.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut().catch(() => null);
  // 303 so the browser follows with GET, not another POST.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
