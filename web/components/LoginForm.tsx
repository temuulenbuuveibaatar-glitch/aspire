"use client";

import { SignIn } from "@clerk/nextjs";
import { Clock } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { isLang, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

// Aspire header, then Clerk's <SignIn> (Google, Apple or an email code; new people are signed up
// in the same flow). Hash routing keeps every step on /login?next=…, so `next` and the
// `expired` notice survive the email-code step and the return from Google/Apple.

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

export default function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const t = UI[useBrowserLang()];

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

      <div className="mt-6 flex w-full justify-center">
        <SignIn
          routing="hash"
          withSignUp
          forceRedirectUrl={next}
          fallbackRedirectUrl={next}
          signUpForceRedirectUrl={next}
          signUpFallbackRedirectUrl={next}
          appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-none" } }}
        />
      </div>

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
