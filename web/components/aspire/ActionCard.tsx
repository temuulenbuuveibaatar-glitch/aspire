"use client";

import {
  ArrowUpRight,
  Bike,
  Bus,
  CalendarPlus,
  Car,
  Check,
  ChevronRight,
  ExternalLink,
  Footprints,
  Hash,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareText,
  MessagesSquare,
  Navigation,
  Phone,
  RotateCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CALENDAR, hasScope } from "@/components/aspire/GmailConnect";
import { useStillMotion } from "@/components/aspire/Sheet";
import { isImperial, useDisplayPrefs } from "@/lib/display-prefs";
import { HTML_LANG, LANGS, type Lang } from "@/lib/lang";
import { gmailComposeUrl, isGoogleMapsUrl, mailtoUrl, smsUrl, telegramShareUrl, telUrl } from "@/lib/links";
import type { Channel, ClientAction } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { isAllowedWebhook } from "@/lib/webhooks";
import { temp } from "@/lib/utils";

type T = (typeof UI)["en"];
type Card = Extract<ClientAction, { type: "message" | "call" | "calendar" | "map" | "weather" }>;

const CHANNEL: Record<Channel, { icon: typeof Send; name: string }> = {
  telegram: { icon: Send, name: "Telegram" },
  discord: { icon: MessagesSquare, name: "Discord" },
  slack: { icon: Hash, name: "Slack" },
  sms: { icon: MessageSquareText, name: "SMS" },
  email: { icon: Mail, name: "Email" },
};

// Map card words (the shared UI text has only "Open in Google Maps").
const MAP_TEXT: Record<
  Lang,
  { directions: string; place: string; from: string; here: string; transit: string; walking: string; driving: string; cycling: string; newTab: string }
> = {
  mn: {
    directions: "Чиглэл",
    place: "Газар",
    from: "Хаанаас",
    here: "Таны байршил",
    transit: "Нийтийн тээвэр",
    walking: "Явганаар",
    driving: "Машинаар",
    cycling: "Дугуйгаар",
    newTab: "шинэ цонхонд нээгдэнэ",
  },
  zh: {
    directions: "路线",
    place: "地点",
    from: "出发地",
    here: "您的位置",
    transit: "公共交通",
    walking: "步行",
    driving: "驾车",
    cycling: "骑行",
    newTab: "在新标签页中打开",
  },
  en: {
    directions: "Directions",
    place: "Place",
    from: "From",
    here: "Your location",
    transit: "Transit",
    walking: "Walking",
    driving: "Driving",
    cycling: "Cycling",
    newTab: "opens in a new tab",
  },
  ru: {
    directions: "Маршрут",
    place: "Место",
    from: "Откуда",
    here: "Ваше местоположение",
    transit: "Общественный транспорт",
    walking: "Пешком",
    driving: "На машине",
    cycling: "На велосипеде",
    newTab: "откроется в новой вкладке",
  },
  de: {
    directions: "Route",
    place: "Ort",
    from: "Start",
    here: "Ihr Standort",
    transit: "Öffentliche Verkehrsmittel",
    walking: "Zu Fuß",
    driving: "Mit dem Auto",
    cycling: "Mit dem Rad",
    newTab: "öffnet in neuem Tab",
  },
};

// "Email" is a common noun, so it is localized; SMS, Telegram, Discord and Slack are names.
const EMAIL_NAME: Record<Lang, string> = { mn: "Имэйл", zh: "电子邮件", en: "Email", ru: "Эл. почта", de: "E-Mail" };

/** Cards get `t` = UI[lang]; find the lang back from it (English if it is a copy). */
const langOf = (t: T): Lang => LANGS.find((l) => UI[l] === t) ?? "en";

/** Date and time in the card's language; the user's own time zone (any country). */
function formatWhen(d: Date, lang: Lang): string {
  try {
    return d.toLocaleString(HTML_LANG[lang], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
}

/** Only https links leave the app from a card. */
function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export const isCard = (a: ClientAction): a is Card =>
  a.type === "message" ||
  a.type === "call" ||
  a.type === "calendar" ||
  (a.type === "map" && isGoogleMapsUrl(a.url)) ||
  (a.type === "weather" && typeof a.tempC === "number" && Number.isFinite(a.tempC));

const shell = "panel rounded-lg p-5";
const primary =
  "press inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 text-body font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60";
const callButton =
  "press inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-success px-6 text-body font-semibold text-on-accent [overflow-wrap:anywhere] hover:bg-success/90 focus-visible:outline-ink";
const secondary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-2 px-5 text-body font-medium text-ink hover:bg-panel-3";
const iconTile = "grid size-12 shrink-0 place-items-center rounded-md border border-line bg-panel-2 text-accent";

export function ActionCard({
  action,
  t,
  webhooks,
  onOpenConnections,
}: {
  action: Card;
  t: T;
  webhooks: { discord?: string; slack?: string };
  onOpenConnections: () => void;
}) {
  if (action.type === "call") {
    return (
      <div className={shell}>
        <a href={telUrl(action.number)} className={`${callButton} w-full`}>
          <Phone className="size-6 shrink-0" aria-hidden /> {t.call}: {action.label || action.number}
        </a>
        {!action.known && (
          <p className="mt-3 flex items-start gap-2 text-small text-signal">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.newNumber}
          </p>
        )}
      </div>
    );
  }
  if (action.type === "calendar") return <CalendarCard action={action} t={t} />;
  if (action.type === "map") return <MapCard action={action} t={t} />;
  if (action.type === "weather") return <WeatherCard action={action} t={t} />;
  return <MessageCard action={action} t={t} webhooks={webhooks} onOpenConnections={onOpenConnections} />;
}

// ---- Calendar card ------------------------------------------------------------------------------

const CAL_TEXT: Record<Lang, { adding: string; added: string; failed: string; notLinked: string }> = {
  mn: { adding: "Нэмж байна", added: "Календарьт нэмэгдлээ", failed: "Нэмж чадсангүй. Дахин оролдоно уу.", notLinked: "Google Календарь холбогдоогүй байна. Доорх холбоосоор нэмнэ үү." },
  zh: { adding: "正在添加", added: "已添加到日历", failed: "添加失败，请再试一次。", notLinked: "Google 日历未连接。请用下面的链接添加。" },
  en: { adding: "Adding", added: "Added to your calendar", failed: "Could not add it. Please try again.", notLinked: "Google Calendar is not connected. Use the link below instead." },
  ru: { adding: "Добавляю", added: "Добавлено в календарь", failed: "Не удалось добавить. Попробуйте ещё раз.", notLinked: "Google Календарь не подключён. Добавьте по ссылке ниже." },
  de: { adding: "Wird eingetragen", added: "Im Kalender eingetragen", failed: "Eintragen fehlgeschlagen. Bitte noch einmal versuchen.", notLinked: "Google Kalender ist nicht verbunden. Nutzen Sie den Link unten." },
};

/** Saves straight to Google Calendar when it is connected; otherwise (or on 403) the plain link. */
function CalendarCard({ action, t }: { action: Extract<Card, { type: "calendar" }>; t: T }) {
  const lang = langOf(t);
  const c = CAL_TEXT[lang];
  const { user } = useUser();
  const still = useStillMotion();
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "failed" | "unlinked">("idle");
  const google = user?.externalAccounts.find((a) => a.provider === "google");
  const linked = Boolean(google && google.verification?.status === "verified" && hasScope(google.approvedScopes, CALENDAR));
  const direct = linked && status !== "unlinked";
  const start = new Date(action.start);
  const when = Number.isNaN(start.getTime()) ? null : formatWhen(start, lang);
  const locked = status === "adding" || status === "added";

  const add = async () => {
    setStatus("adding");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: action.title, start: action.start, end: action.end, details: action.details, tz }),
    }).catch(() => null);
    setStatus(res?.ok ? "added" : res?.status === 403 ? "unlinked" : "failed");
  };

  return (
    <div className={shell}>
      <div className="flex items-start gap-3">
        <span className={iconTile} aria-hidden>
          <CalendarPlus className="size-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-body font-semibold text-ink [overflow-wrap:anywhere]">{action.title}</p>
          {when && (
            <p className="num text-small text-ink-muted">
              <time dateTime={start.toISOString()}>{when}</time>
            </p>
          )}
        </div>
      </div>
      <p className="sr-only" role="status">
        {status === "added" ? c.added : status === "adding" ? c.adding : ""}
      </p>
      {(status === "failed" || status === "unlinked") && (
        <p className={`mt-3 flex items-start gap-2 text-small ${status === "failed" ? "text-danger" : "text-signal"}`} role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {status === "failed" ? c.failed : c.notLinked}
        </p>
      )}
      {direct ? (
        // One persistent button (aria-disabled, not disabled) so focus never drops to <body>.
        <button
          type="button"
          onClick={() => {
            if (!locked) void add();
          }}
          aria-disabled={locked || undefined}
          className={
            status === "added"
              ? "mt-4 inline-flex min-h-14 w-full cursor-default items-center justify-center gap-2 rounded-md border border-success/40 bg-success/10 px-5 text-body font-semibold text-success"
              : `${primary} mt-4 w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-60`
          }
        >
          {status === "added" ? (
            <Check className="size-6" aria-hidden />
          ) : status === "adding" ? (
            <LoaderCircle className={still ? "size-5" : "size-5 animate-spin"} aria-hidden />
          ) : status === "failed" ? (
            <RotateCw className="size-5" aria-hidden />
          ) : (
            <CalendarPlus className="size-5" aria-hidden />
          )}
          {status === "added" ? c.added : status === "adding" ? c.adding : status === "failed" ? t.retry : t.addCalendar}
        </button>
      ) : (
        isHttps(action.url) && (
          <a href={action.url} target="_blank" rel="noopener noreferrer" className={`${secondary} mt-4 w-full`}>
            <CalendarPlus className="size-5" aria-hidden /> {t.addCalendar}
          </a>
        )
      )}
    </div>
  );
}

// ---- Map card -----------------------------------------------------------------------------------

type Mode = "transit" | "walking" | "driving" | "bicycling";
interface MapInfo {
  kind: "route" | "place";
  origin: string;
  mode: Mode | null;
}

const LATLNG = /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/;

function readMapUrl(url: string): MapInfo {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const isRoute = u.pathname.startsWith("/maps/dir") || p.has("destination");
    const m = p.get("travelmode");
    const mode = m === "transit" || m === "walking" || m === "driving" || m === "bicycling" ? m : null;
    return { kind: isRoute ? "route" : "place", origin: (p.get("origin") ?? "").trim(), mode };
  } catch {
    return { kind: "place", origin: "", mode: null };
  }
}

const MODE_ICON: Record<Mode, typeof Bus> = { transit: Bus, walking: Footprints, driving: Car, bicycling: Bike };

/** Small stable hash so each destination gets its own (abstract) street plan. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Routes run on the street grid between x 110 and 290, so a 300px-wide card still shows both ends.
const ROUTES = [
  { d: "M112 104 H170 Q178 104 178 96 V72 Q178 64 186 64 H232 Q240 64 240 56 V52 Q240 44 248 44 H284", from: [112, 104], to: [284, 44] },
  { d: "M116 102 V84 Q116 76 124 76 H204 Q212 76 212 68 V60 Q212 52 220 52 H286", from: [116, 102], to: [286, 52] },
  { d: "M114 40 H150 Q158 40 158 48 V96 Q158 104 166 104 H244 Q252 104 252 96 V64 Q252 56 260 56 H288", from: [114, 40], to: [288, 56] },
] as const;

function MapArt({ seed, info }: { seed: number; info: MapInfo }) {
  // Unsigned shifts: `>>` on a seed above 2^31 goes negative and would shift the grid off the card.
  const route = ROUTES[seed % ROUTES.length];
  const dx = (seed >>> 3) % 24;
  const dy = (seed >>> 7) % 18;
  const cols = Array.from({ length: 11 }, (_, i) => i * 40 + dx - 20);
  const rows = Array.from({ length: 6 }, (_, i) => i * 32 + dy - 16);
  const blocks = Array.from({ length: 9 }, (_, i) => {
    const s = (seed >>> (i * 3)) & 7;
    return { x: 40 * ((i * 3 + s) % 10) + dx - 14, y: 32 * ((i + s) % 4) + dy - 6, w: 26 + (s % 3) * 10, h: 18 + (s % 2) * 8 };
  });
  const walking = info.mode === "walking";
  const [dxp, dyp] = info.kind === "route" ? route.to : [200, 64];

  return (
    <svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" className="block h-36 w-full" aria-hidden focusable="false">
      <rect width="400" height="140" className="fill-panel-2" />
      {blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" className="fill-panel-3" opacity={0.7} />
      ))}
      {cols.map((x, i) => (
        <line key={`c${i}`} x1={x} y1="0" x2={x} y2="140" className="stroke-line" strokeWidth={i % 4 === 1 ? 5 : 1.5} />
      ))}
      {rows.map((y, i) => (
        <line key={`r${i}`} x1="0" y1={y} x2="400" y2={y} className="stroke-line" strokeWidth={i % 3 === 1 ? 5 : 1.5} />
      ))}
      {info.kind === "route" ? (
        <>
          <path d={route.d} fill="none" className="stroke-accent" strokeOpacity={0.22} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={route.d}
            fill="none"
            className="stroke-accent"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={walking ? "2 9" : undefined}
          />
          <circle cx={route.from[0]} cy={route.from[1]} r="7" className="fill-bg stroke-accent" strokeWidth="3.5" />
        </>
      ) : (
        <>
          <circle cx={dxp} cy={dyp + 4} r="44" className="fill-accent" fillOpacity={0.06} />
          <circle cx={dxp} cy={dyp + 4} r="26" className="fill-accent stroke-accent" fillOpacity={0.1} strokeOpacity={0.4} strokeWidth="1.5" />
        </>
      )}
      {/* Destination pin */}
      <g transform={`translate(${dxp} ${dyp})`}>
        <ellipse cx="0" cy="4" rx="7" ry="2.5" className="fill-bg" opacity={0.6} />
        <path d="M0 2 C-9 -8 -12 -13 -12 -19 A12 12 0 0 1 12 -19 C12 -13 9 -8 0 2 Z" className="fill-accent stroke-bg" strokeWidth="2" />
        <circle cx="0" cy="-19" r="4.5" className="fill-bg" />
      </g>
    </svg>
  );
}

function MapCard({ action, t }: { action: Extract<Card, { type: "map" }>; t: T }) {
  const lang = langOf(t);
  const m = MAP_TEXT[lang];
  const still = useStillMotion();
  const info = readMapUrl(action.url);
  const ModeIcon = info.mode ? MODE_ICON[info.mode] : null;
  const modeWord = info.mode ? { transit: m.transit, walking: m.walking, driving: m.driving, bicycling: m.cycling }[info.mode] : null;
  const from = info.kind === "route" ? (!info.origin || LATLNG.test(info.origin) ? m.here : info.origin) : null;

  return (
    <a
      href={action.url}
      target="_blank"
      rel="noopener noreferrer"
      lang={HTML_LANG[lang]}
      className="press group panel block overflow-hidden rounded-lg p-0 hover:border-line-strong"
    >
      <div className="relative">
        <MapArt seed={seedOf(action.title)} info={info} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b from-transparent to-[rgb(11_18_32/0.88)] opaque:to-panel" />
      </div>
      <div className="px-5 pt-3 pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-label tracking-[0.08em] text-ink-faint uppercase">{info.kind === "route" ? m.directions : m.place}</p>
          {ModeIcon && modeWord && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-0.5 text-small font-medium text-ink">
              <ModeIcon className="size-4 text-accent" aria-hidden /> {modeWord}
            </span>
          )}
        </div>
        <p className="mt-1 text-lead font-semibold text-ink [overflow-wrap:anywhere]">{action.title}</p>
        {from && (
          <p className="mt-2 flex items-start gap-2 text-small text-ink-muted">
            <Navigation className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span className="[overflow-wrap:anywhere]">
              {m.from}: {from}
            </span>
          </p>
        )}
        <span className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 text-body font-semibold text-on-accent transition-colors group-hover:bg-accent/90">
          <MapPin className="size-5 shrink-0" aria-hidden />
          {t.openMaps}
          <ArrowUpRight
            className={
              "size-5 shrink-0" + (still ? "" : " transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5")
            }
            aria-hidden
          />
        </span>
        <span className="sr-only"> ({m.newTab})</span>
      </div>
    </a>
  );
}

// ---- Send-for-me card ---------------------------------------------------------------------------

function MessageCard({
  action,
  t,
  webhooks,
  onOpenConnections,
}: {
  action: Extract<Card, { type: "message" }>;
  t: T;
  webhooks: { discord?: string; slack?: string };
  onOpenConnections: () => void;
}) {
  const [text, setText] = useState(action.text);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const { icon: Icon } = CHANNEL[action.channel];
  const name = action.channel === "email" ? EMAIL_NAME[langOf(t)] : CHANNEL[action.channel].name;
  const still = useStillMotion();

  const webhook = action.channel === "discord" ? webhooks.discord : action.channel === "slack" ? webhooks.slack : undefined;
  const send = async () => {
    if (action.channel !== "discord" && action.channel !== "slack") return;
    setStatus("sending");
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: action.channel, text, target: { webhookUrl: webhook } }),
    }).catch(() => null);
    setStatus(res?.ok ? "sent" : "failed");
  };

  // Draft -> sent morphs in place inside ONE persistent button, so keyboard focus never drops to
  // <body> (no native disabled, no button/span swap). Only the icon and the word crossfade.
  const swap = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: still ? 0.1 : 0.12 } },
    transition: { duration: still ? 0.15 : 0.2 },
  };
  const locked = status === "sending" || status === "sent" || !text.trim();
  const stateKey = status === "sent" ? "sent" : status === "sending" ? "sending" : status === "failed" ? "failed" : "idle";

  return (
    <div className={shell}>
      <div className="mb-3 flex items-center gap-3">
        <span className={iconTile} aria-hidden>
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{name}</p>
          {action.to && (
            <p className="text-small text-ink-muted [overflow-wrap:anywhere]">
              {t.to}: {action.to}
            </p>
          )}
        </div>
      </div>
      {action.subject && <p className="mb-2 text-body font-semibold text-ink [overflow-wrap:anywhere]">{action.subject}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={status === "sending" || status === "sent"}
        rows={Math.min(6, Math.max(2, Math.ceil(text.length / 40)))}
        aria-label={name}
        className="w-full resize-none rounded-md border border-line-strong bg-panel-2 p-3.5 text-body text-ink placeholder:text-ink-faint focus-visible:border-accent read-only:text-ink-muted"
      />
      {/* One persistent live region: a role=status that mounts with its text is often not announced. */}
      <p className="sr-only" role="status">
        {status === "sent" ? t.sent : status === "sending" ? t.sending : ""}
      </p>
      {/* `relative`: popLayout pops the exiting element out with absolute positioning. */}
      <div className="relative mt-4 flex flex-wrap gap-2">
        {(action.channel === "discord" || action.channel === "slack") &&
          (webhook && isAllowedWebhook(action.channel, webhook) ? (
            <button
              type="button"
              onClick={() => {
                if (!locked) void send();
              }}
              aria-disabled={locked || undefined}
              className={
                status === "sent"
                  ? "inline-flex min-h-14 cursor-default items-center gap-2 rounded-md border border-success/40 bg-success/10 px-5 text-body font-semibold text-success"
                  : `${primary} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={stateKey} {...swap} className="inline-flex items-center gap-2">
                  {status === "sent" ? (
                    <Check className="size-6" aria-hidden />
                  ) : status === "sending" ? (
                    <LoaderCircle className={still ? "size-5" : "size-5 animate-spin"} aria-hidden />
                  ) : status === "failed" ? (
                    <RotateCw className="size-5" aria-hidden />
                  ) : (
                    <Send className="size-5" aria-hidden />
                  )}
                  {status === "sent" ? t.sent : status === "sending" ? t.sending : status === "failed" ? t.retry : t.sendNow}
                </motion.span>
              </AnimatePresence>
            </button>
          ) : (
            <button type="button" onClick={onOpenConnections} className={secondary}>
              {t.connections}
              <ChevronRight className="size-5 text-ink-muted" aria-hidden />
              {name}
            </button>
          ))}
        {action.channel === "telegram" && (
          <a href={telegramShareUrl(text)} target="_blank" rel="noopener noreferrer" className={primary}>
            <Send className="size-5" aria-hidden /> {t.shareTelegram}
          </a>
        )}
        {action.channel === "sms" && (
          <a href={smsUrl(action.to, text)} className={primary}>
            <MessageSquareText className="size-5" aria-hidden /> {t.openSms}
          </a>
        )}
        {action.channel === "email" && (
          <>
            <a
              href={gmailComposeUrl(action.to, action.subject, text)}
              target="_blank"
              rel="noopener noreferrer"
              className={primary}
            >
              <Mail className="size-5" aria-hidden /> {t.openGmail}
            </a>
            <a href={mailtoUrl(action.to, action.subject, text)} className={secondary}>
              <ExternalLink className="size-5" aria-hidden /> {t.otherMail}
            </a>
          </>
        )}
      </div>
      {status === "failed" && (
        <p className="mt-3 flex items-start gap-2 text-small text-danger" role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.sendFailed}
        </p>
      )}
    </div>
  );
}

// ---- Weather card: the numbers behind a spoken weather answer ---------------------------------

function WeatherCard({ action, t }: { action: Extract<Card, { type: "weather" }>; t: T }) {
  const [prefs] = useDisplayPrefs();
  const deg = (c: number) => temp(c, isImperial(prefs.units), false);
  if (typeof action.tempC !== "number" || !Number.isFinite(action.tempC)) return null;
  const lang = langOf(t);
  const name = (k: string) => t.hud.kinds[k as keyof T["hud"]["kinds"]] ?? "";
  const days = (Array.isArray(action.days) ? action.days : []).filter((d) => Number.isFinite(d?.minC) && Number.isFinite(d?.maxC)).slice(0, 3);
  const day = (iso: string, i: number) =>
    i === 0 ? t.hud.today : new Date(`${iso}T12:00:00Z`).toLocaleDateString(HTML_LANG[lang], { weekday: "short", timeZone: "UTC" });
  return (
    <div className={shell}>
      <p className="text-label tracking-[0.12em] text-ink-muted uppercase [overflow-wrap:anywhere]">{action.place}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-4">
        <span className="font-mono text-value tabular-nums text-ink">{deg(action.tempC)}</span>
        <span className="text-lead text-ink">{name(action.kind)}</span>
      </p>
      {typeof action.feelsC === "number" && <p className="text-body text-ink-muted">{t.hud.feels.replace("{t}", deg(action.feelsC))}</p>}
      {days.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {days.map((d, i) => (
            <li key={d.date} className="flex min-h-12 items-center justify-between gap-3 text-body">
              <span className="text-ink">
                {day(d.date, i)} <span className="text-ink-muted">{name(d.kind)}</span>
              </span>
              <span className="font-mono tabular-nums text-ink">
                {deg(d.minC)} / {deg(d.maxC)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
