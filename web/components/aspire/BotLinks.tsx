"use client";

import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Hash,
  LoaderCircle,
  MessagesSquare,
  Send,
  Trash2,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SYNC_EVENT } from "@/lib/device-store";
import { LANGS, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

const LOADING: Record<Lang, string> = { mn: "Ачаалж байна", zh: "正在加载", en: "Loading", ru: "Загрузка", de: "Wird geladen" };
const langOf = (t: T): Lang => LANGS.find((l) => UI[l] === t) ?? "en";
type Platform = "telegram" | "discord" | "slack";

interface Link {
  id: number;
  platform: Platform;
  title: string;
  isPrimary: boolean;
  linkedAt: string;
}

interface Pending {
  platform: Platform;
  code: string;
  expiresAt: number;
}

const PLATFORMS: { id: Platform; name: string; icon: typeof Send }[] = [
  { id: "telegram", name: "Telegram", icon: Send },
  { id: "discord", name: "Discord", icon: MessagesSquare },
  { id: "slack", name: "Slack", icon: Hash },
];
const ICON: Record<Platform, typeof Send> = { telegram: Send, discord: MessagesSquare, slack: Hash };
const NAME: Record<Platform, string> = { telegram: "Telegram", discord: "Discord", slack: "Slack" };

const TELEGRAM_BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
const POLL_MS = 4000;

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
const notifySync = () => window.dispatchEvent(new Event(SYNC_EVENT));

const primary =
  "press inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 text-body font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-2 px-5 text-body font-medium text-ink hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-60";

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * Settings, Connections: link Telegram, Discord and Slack to this account. Linking turns on cloud
 * sync (the consent box must be ticked before a code is shown); the list below picks the chat
 * that gets reminders, unlinks chats, and deletes everything in the cloud.
 */
export function BotLinks({ t, onLinkedChange }: { t: T; onLinkedChange?: (linked: boolean) => void }) {
  const [links, setLinks] = useState<Link[] | null>(null); // null = loading
  const [unavailable, setUnavailable] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const knownIds = useRef<Set<number>>(new Set());
  const wasLinked = useRef<boolean | null>(null);
  const consentHintId = useId();

  const hasLinks = (links?.length ?? 0) > 0;
  const agreed = consent || hasLinks; // a linked account already gave consent

  const refresh = useCallback(async (): Promise<Link[] | null> => {
    try {
      const res = await fetch("/api/link", { cache: "no-store" });
      if (res.status === 503) {
        setUnavailable(true);
        setLinks([]);
        return [];
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { links?: Link[] };
      const next = body.links ?? [];
      setUnavailable(false);
      setLinks(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const got = await refresh();
      if (alive && got === null) setLinks([]);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  // Tell the parent (and the device store) when the account becomes linked or unlinked.
  useEffect(() => {
    if (links === null) return;
    const linked = links.length > 0;
    if (wasLinked.current !== linked) {
      if (wasLinked.current !== null) notifySync();
      onLinkedChange?.(linked);
    }
    wasLinked.current = linked;
  }, [links, onLinkedChange]);

  // While a code is shown, watch for the new link (the person sends the code to the bot).
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      if (Date.now() > pending.expiresAt) {
        setPending(null);
        return;
      }
      const now = await refresh();
      if (now?.some((l) => !knownIds.current.has(l.id))) {
        setPending(null);
        setNotice(t.botLinkedOk);
        notifySync(); // push this device's memory and reminders to the cloud copy
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, refresh, t.botLinkedOk]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setFailed(false);
    setNotice("");
    try {
      await fn();
    } catch {
      setFailed(true);
    }
    setBusy(null);
  };

  const requestCode = (platform: Platform) =>
    run(`code:${platform}`, async () => {
      const res = await post("/api/link/code", { consent: true });
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      if (!res.ok) throw new Error("code");
      const body = (await res.json()) as { code?: unknown; expiresAt?: unknown };
      // Validate before the code reaches the screen and a t.me deep link.
      if (typeof body.code !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(body.code)) throw new Error("code");
      const expires = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
      knownIds.current = new Set((links ?? []).map((l) => l.id));
      setCopied(false);
      setPending({ platform, code: body.code, expiresAt: Number.isFinite(expires) ? expires : Date.now() + 10 * 60_000 });
    });

  const unlink = (id: number) =>
    run(`unlink:${id}`, async () => {
      const res = await post("/api/unlink", { linkId: id });
      if (!res.ok && res.status !== 404) throw new Error("unlink");
      await refresh();
    });

  const makePrimary = (id: number) =>
    run(`primary:${id}`, async () => {
      setLinks((l) => l?.map((x) => ({ ...x, isPrimary: x.id === id })) ?? l);
      const res = await post("/api/link/primary", { linkId: id });
      await refresh();
      if (!res.ok) throw new Error("primary");
    });

  const deleteAll = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    void run("delete", async () => {
      const res = await post("/api/unlink", { all: true });
      if (!res.ok) throw new Error("delete");
      setConfirmDelete(false);
      setPending(null);
      await refresh();
      setNotice(t.botDeleted);
    });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };

  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-label tracking-[0.08em] text-ink-muted uppercase">
        <Bot className="size-5 text-accent" aria-hidden /> {t.botsTitle}
      </h3>
      <div className="panel rounded-lg p-5">
        {links === null ? (
          <p className="flex min-h-12 items-center text-ink-muted" role="status">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">{LOADING[langOf(t)]}</span>
          </p>
        ) : unavailable ? (
          <p className="text-body text-ink-muted">{t.botUnavailable}</p>
        ) : (
          <>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 py-1">
              <input
                type="checkbox"
                className="mt-0.5 size-6 shrink-0 cursor-pointer accent-accent disabled:cursor-default"
                checked={agreed}
                disabled={hasLinks}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-body text-ink">{t.botConsent}</span>
            </label>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PLATFORMS.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={secondary + " px-4"}
                  disabled={!agreed || busy !== null}
                  aria-describedby={agreed ? undefined : consentHintId}
                  onClick={() => requestCode(id)}
                >
                  {busy === `code:${id}` ? (
                    <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="size-5 text-accent" aria-hidden />
                  )}
                  {t.botLink} {name}
                </button>
              ))}
            </div>
            {!agreed && (
              <p id={consentHintId} className="mt-2 text-small text-ink-faint">
                {t.botConsentFirst}
              </p>
            )}

            {pending && (
              <CodeCard
                t={t}
                pending={pending}
                copied={copied}
                onCopy={() => copy(pending.code)}
                onCancel={() => setPending(null)}
              />
            )}

            <div aria-live="polite" className="empty:hidden">
              {notice && (
                <p className="mt-3 flex items-start gap-2 text-body text-success">
                  <Check className="mt-0.5 size-5 shrink-0" aria-hidden /> {notice}
                </p>
              )}
              {failed && (
                <p className="mt-3 flex items-start gap-2 text-body text-danger">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.error}
                </p>
              )}
            </div>

            <h4 className="mt-6 mb-2 text-body font-semibold text-ink">{t.botLinkedChats}</h4>
            {!hasLinks ? (
              <p className="text-body text-ink-muted">{t.botNoLinks}</p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-small text-ink-muted">{t.botPrimary}</legend>
                <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel-2">
                  {links.map((l) => {
                    const Icon = ICON[l.platform];
                    const title = l.title || (l.platform === "telegram" ? t.botPrivateChat : NAME[l.platform]);
                    return (
                      <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
                        <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="radio"
                            name="aspire-primary-chat"
                            className="size-6 shrink-0 cursor-pointer accent-accent"
                            checked={l.isPrimary}
                            disabled={busy !== null}
                            onChange={() => makePrimary(l.id)}
                          />
                          <Icon className="size-5 shrink-0 text-accent" aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-body text-ink [overflow-wrap:anywhere]">{title}</span>
                            <span className="block text-small text-ink-faint">{NAME[l.platform]}</span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="press inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-ink-muted hover:bg-panel-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={busy !== null}
                          onClick={() => unlink(l.id)}
                          aria-label={`${t.botUnlink}: ${title}`}
                        >
                          {busy === `unlink:${l.id}` ? (
                            <LoaderCircle className="size-5 animate-spin" aria-hidden />
                          ) : (
                            <Unlink className="size-5" aria-hidden />
                          )}
                          <span className="text-small">{t.botUnlink}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            {hasLinks && (
              <div className="mt-6">
                {confirmDelete && (
                  <p className="mb-3 flex gap-2 text-small text-signal" role="alert">
                    <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.botDeleteConfirm}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="press inline-flex min-h-12 items-center gap-2 rounded-md border border-danger/60 px-5 text-body font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy !== null}
                    onClick={deleteAll}
                  >
                    {busy === "delete" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
                    {t.botDeleteCloud}
                  </button>
                  {confirmDelete && (
                    <button type="button" className={secondary} onClick={() => setConfirmDelete(false)}>
                      {t.botCancel}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function CodeCard({
  t,
  pending,
  copied,
  onCopy,
  onCancel,
}: {
  t: T;
  pending: Pending;
  copied: boolean;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const { platform, code } = pending;
  const Icon = ICON[platform];
  return (
    <div className="mt-4 rounded-lg border border-accent/45 bg-panel-2 p-5 shadow-accent">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-body font-semibold text-ink">
          <Icon className="size-5 text-accent" aria-hidden /> {NAME[platform]}
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t.botCancel}
          className="press -mr-2 grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink"
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>

      <p
        className="numeral my-3 rounded-md border border-line bg-panel px-4 py-3 text-center text-value tracking-[0.22em] text-ink select-all [overflow-wrap:anywhere]"
        aria-live="polite"
      >
        {code}
      </p>

      {platform === "telegram" && (
        <>
          <p className="text-body text-ink">{fill(t.botTelegramHow, { code, bot: TELEGRAM_BOT ? `@${TELEGRAM_BOT}` : "Aspire" })}</p>
          {TELEGRAM_BOT && (
            <a
              href={`https://t.me/${encodeURIComponent(TELEGRAM_BOT)}?start=${encodeURIComponent(code)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={primary + " mt-3 w-full"}
            >
              <Send className="size-5" aria-hidden /> {t.botOpenTelegram}
              <ExternalLink className="size-5" aria-hidden />
            </a>
          )}
          <p className="mt-3 text-small text-ink-muted">{fill(t.botGroupHow, { code })}</p>
        </>
      )}
      {platform === "discord" && <p className="text-body text-ink">{fill(t.botDiscordHow, { code })}</p>}
      {platform === "slack" && (
        <>
          <p className="text-body text-ink">{fill(t.botSlackHow, { code })}</p>
          <a href="/api/bots/slack/install" className={secondary + " mt-3 w-full"}>
            <Hash className="size-5" aria-hidden /> {t.botAddSlack}
          </a>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className={secondary} onClick={onCopy}>
          {copied ? <Check className="size-5 text-success" aria-hidden /> : <Copy className="size-5" aria-hidden />}
          {copied ? t.botCopied : t.botCopy}
        </button>
        <span className="flex items-center gap-2 text-small text-ink-muted">
          <LoaderCircle className="size-5 animate-spin still:animate-none" aria-hidden /> {t.botWaiting}
        </span>
      </div>
      <p className="mt-3 text-small text-ink-faint">{t.botCodeExpires}</p>
    </div>
  );
}
