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
import { useCallback, useEffect, useRef, useState } from "react";
import { SYNC_EVENT } from "@/lib/device-store";
import type { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];
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
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan px-5 font-semibold text-[#03202a] hover:bg-[#62e4ff] disabled:opacity-50";
const secondary =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 font-medium text-ink hover:bg-white/10 disabled:opacity-50";

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * Settings → Connections: link Telegram, Discord and Slack to this account. Linking turns on cloud
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
      const body = (await res.json()) as { code: string; expiresAt: string };
      knownIds.current = new Set((links ?? []).map((l) => l.id));
      setCopied(false);
      setPending({ platform, code: body.code, expiresAt: Date.parse(body.expiresAt) });
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
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide text-cyan uppercase">
        <Bot className="size-4" aria-hidden /> {t.botsTitle}
      </h3>
      <div className="glass rounded-2xl p-4">
        {links === null ? (
          <LoaderCircle className="size-5 animate-spin text-ink-soft" aria-label="…" />
        ) : unavailable ? (
          <p className="text-ink-soft">{t.botUnavailable}</p>
        ) : (
          <>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 size-6 shrink-0 cursor-pointer accent-[#38dcff] disabled:cursor-default"
                checked={agreed}
                disabled={hasLinks}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-ink">{t.botConsent}</span>
            </label>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PLATFORMS.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={secondary + " min-h-12"}
                  disabled={!agreed || busy !== null}
                  aria-describedby={agreed ? undefined : "bot-consent-first"}
                  onClick={() => requestCode(id)}
                >
                  {busy === `code:${id}` ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
                  {t.botLink} {name}
                </button>
              ))}
            </div>
            {!agreed && (
              <p id="bot-consent-first" className="mt-2 text-sm text-ink-faint">
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
                <p className="mt-3 flex items-center gap-2 text-ok">
                  <Check className="size-5 shrink-0" aria-hidden /> {notice}
                </p>
              )}
              {failed && (
                <p className="mt-3 flex items-center gap-2 text-bad">
                  <TriangleAlert className="size-5 shrink-0" aria-hidden /> {t.error}
                </p>
              )}
            </div>

            <h4 className="mt-5 mb-2 font-semibold">{t.botLinkedChats}</h4>
            {!hasLinks ? (
              <p className="text-ink-faint">{t.botNoLinks}</p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-sm text-ink-soft">{t.botPrimary}</legend>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {links.map((l) => {
                    const Icon = ICON[l.platform];
                    const title = l.title || (l.platform === "telegram" ? t.botPrivateChat : NAME[l.platform]);
                    return (
                      <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
                        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="radio"
                            name="aspire-primary-chat"
                            className="size-5 shrink-0 cursor-pointer accent-[#38dcff]"
                            checked={l.isPrimary}
                            disabled={busy !== null}
                            onChange={() => makePrimary(l.id)}
                          />
                          <Icon className="size-5 shrink-0 text-ink-soft" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate">{title}</span>
                            <span className="block text-sm text-ink-faint">{NAME[l.platform]}</span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-ink-soft hover:bg-white/10 hover:text-ink disabled:opacity-50"
                          disabled={busy !== null}
                          onClick={() => unlink(l.id)}
                          aria-label={`${t.botUnlink}: ${title}`}
                        >
                          {busy === `unlink:${l.id}` ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Unlink className="size-4" aria-hidden />}
                          <span className="text-sm">{t.botUnlink}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            {hasLinks && (
              <div className="mt-5">
                {confirmDelete && (
                  <p className="mb-2 flex gap-2 text-sm text-amber" role="alert">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t.botDeleteConfirm}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="press inline-flex min-h-11 items-center gap-2 rounded-xl border border-bad/50 px-4 font-medium text-bad hover:bg-bad/10 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={deleteAll}
                  >
                    {busy === "delete" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
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
    <div className="mt-4 rounded-2xl border border-cyan/40 bg-cyan/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Icon className="size-5 text-cyan" aria-hidden /> {NAME[platform]}
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t.botCancel}
          className="press -mt-2 -mr-2 grid size-11 place-items-center rounded-full text-ink-soft hover:bg-white/10"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <p className="my-2 font-mono text-4xl font-semibold tracking-[0.25em] text-ink" aria-live="polite">
        {code}
      </p>

      {platform === "telegram" && (
        <>
          <p className="text-ink">{fill(t.botTelegramHow, { code, bot: TELEGRAM_BOT ? `@${TELEGRAM_BOT}` : "Aspire" })}</p>
          {TELEGRAM_BOT && (
            <a
              href={`https://t.me/${encodeURIComponent(TELEGRAM_BOT)}?start=${code}`}
              target="_blank"
              rel="noopener noreferrer"
              className={primary + " mt-3 w-full"}
            >
              <Send className="size-5" aria-hidden /> {t.botOpenTelegram}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <p className="mt-3 text-sm text-ink-soft">{fill(t.botGroupHow, { code })}</p>
        </>
      )}
      {platform === "discord" && <p className="text-ink">{fill(t.botDiscordHow, { code })}</p>}
      {platform === "slack" && (
        <>
          <p className="text-ink">{fill(t.botSlackHow, { code })}</p>
          <a href="/api/bots/slack/install" className={secondary + " mt-3 w-full"}>
            <Hash className="size-5" aria-hidden /> {t.botAddSlack}
          </a>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={secondary} onClick={onCopy}>
          {copied ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t.botCopied : t.botCopy}
        </button>
        <span className="flex items-center gap-2 text-sm text-ink-soft">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> {t.botWaiting}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-faint">{t.botCodeExpires}</p>
    </div>
  );
}
