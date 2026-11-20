"use client";

import { ArrowLeft, Clock, KeyRound, LogIn, Mail } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { isLang, type Lang } from "@/lib/lang";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { UI } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

// Sign in with Google, or with an email code (the email also carries a link that works on its own).

const noSubscribe = () => () => {};
function useBrowserLang(): Lang {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const tag = (navigator.language || "").slice(0, 2).toLowerCase();
      return isLang(tag) ? tag : "mn";
    },
    () => "mn",
  );
}

type Step = "start" | "code";

export default function LoginForm({ next, expired, failed }: { next: string; expired: boolean; failed: boolean }) {
  const t = UI[useBrowserLang()];
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"" | "error" | "wrongCode">(failed ? "error" : "");
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  const google = async () => {
    setBusy(true);
    setError("");
    const { error: e } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is already leaving for Google.
    if (e) {
      setError("error");
      setBusy(false);
    }
  };

  const sendCode = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError("");
    const { error: e } = await supabaseBrowser().auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (e) return setError("error");
    setCode("");
    setStep("code");
  };

  const verify = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (code.length < 6) return;
    setBusy(true);
    setError("");
    const { error: e } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (e) {
      setBusy(false);
      setError("wrongCode");
      return;
    }
    router.replace(next);
  };

  const enter = reduced ? { opacity: 0 } : { opacity: 0, y: 8 };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <VoiceOrb size={160} state="idle" className="text-cyan" label="Aspire" />
      <h1 className="mt-4 font-display text-2xl font-bold tracking-[0.28em]">ASPIRE</h1>
      <h2 className="mt-1 text-lg text-ink-soft">{t.signInTitle}</h2>

      {expired && (
        <p role="status" className="glass mt-6 flex w-full items-start gap-3 rounded-2xl px-4 py-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-cyan" aria-hidden />
          <span>{t.signedOutNotice}</span>
        </p>
      )}

      <motion.div
        key={step}
        initial={enter}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="glass mt-6 w-full rounded-3xl p-5"
      >
        {step === "start" ? (
          <>
            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-white/10 px-5 font-medium hover:bg-white/15 disabled:opacity-50"
            >
              <LogIn className="size-5" aria-hidden />
              {t.continueGoogle}
            </button>

            <div className="my-5 h-px bg-line" role="presentation" />

            <form onSubmit={sendCode}>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium">
                {t.emailLabel}
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-line bg-black/20 px-3 text-[16px] outline-none focus:border-cyan"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-cyan px-5 font-semibold text-[#03202a] disabled:bg-white/10 disabled:text-ink-faint"
              >
                <Mail className="size-5" aria-hidden />
                {t.emailMeCode}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={verify}>
            <p role="status" className="text-ink">
              {t.codeSent}
            </p>
            <p className="mt-1 text-sm text-ink-soft">{t.orTapLink}</p>
            <label htmlFor="login-code" className="mt-4 mb-1 block text-sm font-medium">
              {t.codeLabel}
            </label>
            <input
              ref={codeInput}
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              aria-invalid={Boolean(error)}
              className={cn(
                "min-h-12 w-full rounded-xl border bg-black/20 px-3 text-center font-mono text-[22px] tracking-[0.4em] outline-none focus:border-cyan",
                error ? "border-bad" : "border-line",
              )}
            />
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-cyan px-5 font-semibold text-[#03202a] disabled:bg-white/10 disabled:text-ink-faint"
            >
              <KeyRound className="size-5" aria-hidden />
              {t.verify}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("start");
                setError("");
              }}
              className="press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-ink-soft hover:bg-white/10 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t.retry}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {t[error]}
          </p>
        )}
      </motion.div>

      <p className="mt-6 text-sm text-ink-faint">
        <Link href="/privacy" className="underline">
          {t.privacy}
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline">
          {t.terms}
        </Link>
      </p>
    </main>
  );
}
