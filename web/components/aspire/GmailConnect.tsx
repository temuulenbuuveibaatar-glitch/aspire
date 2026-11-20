"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { Check, LoaderCircle, Mail, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

// Same value as GMAIL_SCOPE in lib/google.ts (kept here so this client file doesn't import server code).
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const FULL_MAIL_SCOPE = "https://mail.google.com/";

/** Clerk's approvedScopes is a space-separated list. */
export function hasGmailScope(approvedScopes: string | undefined | null): boolean {
  const scopes = (approvedScopes ?? "").split(/\s+/);
  return scopes.includes(GMAIL_SCOPE) || scopes.includes(FULL_MAIL_SCOPE);
}

const primary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan px-5 font-semibold text-[#03202a] hover:bg-[#62e4ff] disabled:opacity-50";

/**
 * Settings → Connections: Gmail section. Sign-in asks Google only for basic scopes; Gmail read
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
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide text-cyan uppercase">
        <Mail className="size-4" aria-hidden /> Gmail
      </h3>
      <div className="glass rounded-2xl p-4">
        {!isLoaded ? (
          <LoaderCircle className="size-5 animate-spin text-ink-soft" aria-label="…" />
        ) : connected ? (
          <p className="flex min-h-12 items-center gap-2 font-semibold text-ok" role="status">
            <Check className="size-5" aria-hidden /> {t.gmailConnected}
            {google?.emailAddress && <span className="truncate font-normal text-ink-soft">· {google.emailAddress}</span>}
          </p>
        ) : (
          <button onClick={connect} disabled={busy || !user} className={primary}>
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
        <p className="mt-3 text-sm leading-6 text-ink-soft">{t.gmailNote}</p>
        {failed && (
          <p className="mt-2 flex items-center gap-2 text-sm text-bad" role="alert">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> {t.error}
          </p>
        )}
      </div>
    </section>
  );
}
