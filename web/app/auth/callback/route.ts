import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const EMAIL_TYPES: readonly string[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];
const isEmailType = (v: string | null): v is EmailOtpType => v !== null && EMAIL_TYPES.includes(v);

// GET /auth/callback?code=…&next=…              Google OAuth / PKCE email link
// GET /auth/callback?token_hash=…&type=…&next=…  email link carrying a token hash
// Creates the session cookie, then goes to `next` (same-origin relative paths only).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next"));
  const failed = () => NextResponse.redirect(new URL("/login?error=1", url.origin));

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed();
  } else if (tokenHash && isEmailType(type)) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return failed();
  } else {
    return failed();
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
