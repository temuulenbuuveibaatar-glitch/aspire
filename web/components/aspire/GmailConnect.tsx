"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { Check, LoaderCircle, Mail, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { LANGS, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

const LOADING: Record<Lang, string> = { mn: "Ачаалж байна", zh: "正在加载", en: "Loading", ru: "Загрузка", de: "Wird geladen" };
const langOf = (t: T): Lang => LANGS.find((l) => UI[l] === t) ?? "en";

// Same value as GMAIL_SCOPE in lib/google.ts (kept here so this client file doesn't import server code).
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const FULL_MAIL_SCOPE = "https://mail.google.com/";

/** Clerk's approvedScopes is a space-separated list. */
export function hasGmailScope(approvedScopes: string | undefined | null): boolean {
  const scopes = (approvedScopes ?? "").split(/\s+/);
  return scopes.includes(GMAIL_SCOPE) || scopes.includes(FULL_MAIL_SCOPE);
}

const primary =
  "press inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 text-body font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Settings, Connections: Gmail section. Sign-in asks Google only for basic scopes; Gmail read
 * access is requested here, incrementally, through Clerk. Google tokens stay with Clerk.
 */
export function GmailConnect({ t }: { t: T }) {
  const { isLoaded, user } = useUser();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Adding a new connected account can require a fresh sign-in check (Clerk shows its own modal).
  const createGoogle = useReverification((redirectUrl: string) =>
    user ? user.createExternalAccount({ strategy: "oauth_google", redirectUrl, additionalScopes: [GMAIL_SCOPE] }) : Promise.resolve(undefined),
  );

  const google = user?.externalAccounts.find((a) => a.provider === "google");
  const connected = Boolean(google && google.verification?.status === "verified" && hasGmailScope(google.approvedScopes));
  // Had Gmail before but the connection broke (expired/revoked): offer "Reconnect".
  const broken = Boolean(google && hasGmailScope(google.approvedScopes) && !connected);

  const connect = async () => {
    if (!user) return;
    setBusy(true);
    setFailed(false);
    try {
      const redirectUrl = window.location.href;
      const account = google
        ? await google.reauthorize({ additionalScopes: [GMAIL_SCOPE], redirectUrl })
        : await createGoogle(redirectUrl);
      const next = account?.verification?.externalVerificationRedirectURL;
      if (next) {
        window.location.assign(next.href); // Google's consent screen, then back here
        return;
      }
      await user.reload();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-label tracking-[0.08em] text-ink-muted uppercase">
        <Mail className="size-5 text-accent" aria-hidden /> Gmail
      </h3>
      <div className="panel rounded-lg p-5">
        {!isLoaded ? (
          <p className="flex min-h-12 items-center gap-2 text-ink-muted" role="status">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">{LOADING[langOf(t)]}</span>
          </p>
        ) : connected ? (
          <p className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-success" role="status">
            <Check className="size-6 shrink-0" aria-hidden /> {t.gmailConnected}
            {google?.emailAddress && (
              <span className="min-w-0 font-normal text-ink-muted [overflow-wrap:anywhere]">· {google.emailAddress}</span>
            )}
          </p>
        ) : (
          <button type="button" onClick={connect} disabled={busy || !user} className={primary}>
            {busy ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
            ) : broken ? (
              <RotateCw className="size-5" aria-hidden />
            ) : (
              <Mail className="size-5" aria-hidden />
            )}
            {broken ? t.reconnectGmail : t.connectGmail}
          </button>
        )}
        <p className="mt-3 text-small text-ink-muted">{t.gmailNote}</p>
        {failed && (
          <p className="mt-3 flex items-start gap-2 text-small text-danger" role="alert">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.error}
          </p>
        )}
      </div>
    </section>
  );
}
