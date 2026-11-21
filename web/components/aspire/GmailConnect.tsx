"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { CalendarDays, Check, LoaderCircle, Mail, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { LANGS, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

const LOADING: Record<Lang, string> = { mn: "Ачаалж байна", zh: "正在加载", en: "Loading", ru: "Загрузка", de: "Wird geladen" };
const langOf = (t: T): Lang => LANGS.find((l) => UI[l] === t) ?? "en";

// Same values as GMAIL_SCOPE in lib/google.ts and CALENDAR_SCOPE in lib/google-calendar.ts (kept
// here so this client file doesn't import server code). The second of each pair is the broader scope.
const GMAIL = ["https://www.googleapis.com/auth/gmail.readonly", "https://mail.google.com/"];
export const CALENDAR = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar"];

/** Clerk's approvedScopes is a space-separated list; true when any of `scopes` is in it. */
export function hasScope(approvedScopes: string | undefined | null, scopes: string[]): boolean {
  const approved = (approvedScopes ?? "").split(/\s+/);
  return scopes.some((s) => approved.includes(s));
}

type Labels = { connect: string; connected: string; reconnect: string; note: string };
const CAL_TEXT: Record<Lang, Labels> = {
  mn: {
    connect: "Календарь холбох",
    connected: "Google Календарь холбогдсон",
    reconnect: "Календарь дахин холбох",
    note: "Аспайр таны өдрийн үйл явдлыг уншиж, таны зөвшөөрсөн үйл явдлыг нэмнэ. Юу ч хадгалахгүй.",
  },
  zh: {
    connect: "连接日历",
    connected: "Google 日历已连接",
    reconnect: "重新连接日历",
    note: "Aspire 会读取您当天的日程，并在您确认后添加活动。不保存任何内容。",
  },
  en: {
    connect: "Connect Calendar",
    connected: "Google Calendar connected",
    reconnect: "Reconnect Calendar",
    note: "Aspire reads your day and adds the events you confirm. Nothing is stored.",
  },
  ru: {
    connect: "Подключить Календарь",
    connected: "Google Календарь подключён",
    reconnect: "Переподключить Календарь",
    note: "Аспайр читает ваши события на день и добавляет те, что вы подтвердили. Ничего не хранится.",
  },
  de: {
    connect: "Kalender verbinden",
    connected: "Google Kalender verbunden",
    reconnect: "Kalender neu verbinden",
    note: "Aspire liest Ihre Termine und trägt die Termine ein, die Sie bestätigen. Nichts wird gespeichert.",
  },
};

const primary =
  "press inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 text-body font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Settings, Connections: Gmail and Google Calendar. Sign-in asks Google only for basic scopes;
 * each service's access is requested here, incrementally, through Clerk. Tokens stay with Clerk.
 */
export function GmailConnect({ t }: { t: T }) {
  const gmail = { connect: t.connectGmail, connected: t.gmailConnected, reconnect: t.reconnectGmail, note: t.gmailNote };
  return (
    <>
      <GoogleScope t={t} scopes={GMAIL} icon={Mail} name="Gmail" text={gmail} />
      <GoogleScope t={t} scopes={CALENDAR} icon={CalendarDays} name="Google Calendar" text={CAL_TEXT[langOf(t)]} />
    </>
  );
}

function GoogleScope({ t, scopes, icon: Icon, name, text }: { t: T; scopes: string[]; icon: typeof Mail; name: string; text: Labels }) {
  const { isLoaded, user } = useUser();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const google = user?.externalAccounts.find((a) => a.provider === "google");
  // Ask again for the other service's scope the person already gave, so connecting one never drops the other.
  const kept = [...GMAIL, ...CALENDAR].filter((s) => !scopes.includes(s) && hasScope(google?.approvedScopes, [s]));
  const additionalScopes = [scopes[0], ...kept];

  // Adding a new connected account can require a fresh sign-in check (Clerk shows its own modal).
  const createGoogle = useReverification((redirectUrl: string) =>
    user ? user.createExternalAccount({ strategy: "oauth_google", redirectUrl, additionalScopes }) : Promise.resolve(undefined),
  );

  const connected = Boolean(google && google.verification?.status === "verified" && hasScope(google.approvedScopes, scopes));
  // Had access before but the connection broke (expired/revoked): offer "Reconnect".
  const broken = Boolean(google && hasScope(google.approvedScopes, scopes) && !connected);

  const connect = async () => {
    if (!user) return;
    setBusy(true);
    setFailed(false);
    try {
      const redirectUrl = window.location.href;
      const account = google ? await google.reauthorize({ additionalScopes, redirectUrl }) : await createGoogle(redirectUrl);
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
        <Icon className="size-5 text-accent" aria-hidden /> {name}
      </h3>
      <div className="panel rounded-lg p-5">
        {!isLoaded ? (
          <p className="flex min-h-12 items-center gap-2 text-ink-muted" role="status">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">{LOADING[langOf(t)]}</span>
          </p>
        ) : connected ? (
          <p className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-success" role="status">
            <Check className="size-6 shrink-0" aria-hidden /> {text.connected}
            {google?.emailAddress && <span className="min-w-0 font-normal text-ink-muted [overflow-wrap:anywhere]">· {google.emailAddress}</span>}
          </p>
        ) : (
          <button type="button" onClick={connect} disabled={busy || !user} className={primary}>
            {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : broken ? <RotateCw className="size-5" aria-hidden /> : <Icon className="size-5" aria-hidden />}
            {broken ? text.reconnect : text.connect}
          </button>
        )}
        <p className="mt-3 text-small text-ink-muted">{text.note}</p>
        {failed && (
          <p className="mt-3 flex items-start gap-2 text-small text-danger" role="alert">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.error}
          </p>
        )}
      </div>
    </section>
  );
}
