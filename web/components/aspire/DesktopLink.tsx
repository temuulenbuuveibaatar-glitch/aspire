"use client";

import { Check, Copy, KeyRound, LoaderCircle, Monitor, TriangleAlert, Unlink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HTML_LANG, type Lang } from "@/lib/lang";

// Settings, Desktop: pair Aspire Desktop (desktop/ in the repo) with a one-time code, see the
// paired computers and unlink them. Strings are kept here in all 5 languages.
export const DESKTOP_TEXT: Record<Lang, Record<
  "title" | "intro" | "getCode" | "runHint" | "codeNote" | "copy" | "copied" | "devices" | "none" | "unlink" | "lastSeen" | "unavailable" | "error" | "paired" | "cancel" | "loading" | "expired",
  string
>> = {
  mn: {
    title: "Компьютер",
    intro: "Aspire таны компьютер дээр програм, холбоос нээх, текст бичих, файл хадгалах, маягт бөглөх боломжтой. Ажил бүр таныг тэнд y гэж бичихийг хүлээнэ.",
    getCode: "Холбох код авах",
    runHint: "Компьютер дээрээ үүнийг ажиллуулаад кодыг оруулна уу:",
    codeNote: "Код 10 минут, ганц удаа ажиллана.",
    copy: "Хуулах",
    copied: "Хуулсан",
    devices: "Холбосон компьютерууд",
    none: "Одоогоор холбосон компьютер алга.",
    unlink: "Салгах",
    lastSeen: "Сүүлд",
    unavailable: "Холболт одоогоор боломжгүй байна.",
    error: "Алдаа гарлаа. Дахин оролдоно уу.",
    paired: "Компьютер холбогдлоо.",
    cancel: "Болих",
    loading: "Ачаалж байна",
    expired: "Кодын хугацаа дууслаа. Шинэ код авна уу.",
  },
  zh: {
    title: "电脑",
    intro: "让 Aspire 在你的电脑上打开应用和链接、输入文字、保存文件和填写表单。每项操作都要等你在电脑上输入 y 才会执行。",
    getCode: "获取配对码",
    runHint: "在你的电脑上运行这条命令，然后输入配对码：",
    codeNote: "配对码 10 分钟内有效，只能用一次。",
    copy: "复制",
    copied: "已复制",
    devices: "已配对的电脑",
    none: "还没有配对的电脑。",
    unlink: "取消配对",
    lastSeen: "最近在线",
    unavailable: "暂时无法配对。",
    error: "出错了，请重试。",
    paired: "电脑已配对。",
    cancel: "取消",
    loading: "正在加载",
    expired: "配对码已过期，请重新获取。",
  },
  en: {
    title: "Desktop",
    intro: "Let Aspire open apps and links, type text, save files and fill forms on your computer. Every job waits until you type y there.",
    getCode: "Get pairing code",
    runHint: "Run this on your computer, then type the code:",
    codeNote: "The code works once, for 10 minutes.",
    copy: "Copy",
    copied: "Copied",
    devices: "Paired computers",
    none: "No computer is paired yet.",
    unlink: "Unlink",
    lastSeen: "Last seen",
    unavailable: "Pairing is not available right now.",
    error: "Something went wrong. Please try again.",
    paired: "Computer paired.",
    cancel: "Cancel",
    loading: "Loading",
    expired: "The code expired. Get a new one.",
  },
  ru: {
    title: "Компьютер",
    intro: "Aspire может открывать программы и ссылки, печатать текст, сохранять файлы и заполнять формы на вашем компьютере. Каждое действие ждёт, пока вы не введёте там y.",
    getCode: "Получить код",
    runHint: "Запустите это на компьютере и введите код:",
    codeNote: "Код действует 10 минут и только один раз.",
    copy: "Копировать",
    copied: "Скопировано",
    devices: "Подключённые компьютеры",
    none: "Пока нет подключённых компьютеров.",
    unlink: "Отключить",
    lastSeen: "Был в сети",
    unavailable: "Подключение сейчас недоступно.",
    error: "Что-то пошло не так. Попробуйте ещё раз.",
    paired: "Компьютер подключён.",
    cancel: "Отмена",
    loading: "Загрузка",
    expired: "Срок действия кода истёк. Получите новый.",
  },
  de: {
    title: "Computer",
    intro: "Aspire kann auf Ihrem Computer Apps und Links öffnen, Text tippen, Dateien speichern und Formulare ausfüllen. Jeder Auftrag wartet, bis Sie dort y eingeben.",
    getCode: "Kopplungscode holen",
    runHint: "Führen Sie das auf Ihrem Computer aus und geben Sie dann den Code ein:",
    codeNote: "Der Code gilt 10 Minuten und nur einmal.",
    copy: "Kopieren",
    copied: "Kopiert",
    devices: "Gekoppelte Computer",
    none: "Noch kein Computer gekoppelt.",
    unlink: "Trennen",
    lastSeen: "Zuletzt online",
    unavailable: "Koppeln ist gerade nicht möglich.",
    error: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
    paired: "Computer gekoppelt.",
    cancel: "Abbrechen",
    loading: "Wird geladen",
    expired: "Der Code ist abgelaufen. Hol dir einen neuen.",
  },
};

const DEFAULT_SERVER = "https://aspire-mn.vercel.app";
const POLL_MS = 4000;

interface Device {
  id: string;
  name: string;
  lastSeen: string;
}

/** The one-line command that starts the helper against this Aspire server. */
export function desktopCommand(origin: string): string {
  return origin === DEFAULT_SERVER ? "node desktop/index.mjs" : `node desktop/index.mjs --server ${origin}`;
}

const secondary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-2 px-5 text-body font-medium text-ink hover:bg-panel-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

export function DesktopLink({ lang }: { lang: Lang }) {
  const t = DESKTOP_TEXT[lang];
  const [devices, setDevices] = useState<Device[] | null>(null); // null = loading
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState<{ code: string; expiresAt: number; known: Set<string>; command: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const codeBox = useRef<HTMLDivElement>(null);
  const devicesHead = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async (): Promise<Device[] | null> => {
    try {
      const res = await fetch("/api/desktop/pair", { cache: "no-store" });
      if (res.status === 503) {
        setUnavailable(true);
        setDevices([]);
        return [];
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { devices?: Device[] };
      const list = Array.isArray(body.devices) ? body.devices : [];
      setDevices(list);
      return list;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const got = await refresh();
      if (alive && got === null) setDevices([]);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  // While a code is shown, watch for the new computer.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      if (Date.now() > pending.expiresAt) {
        setPending(null);
        setNotice(t.expired);
        return;
      }
      const now = await refresh();
      if (now?.some((d) => !pending.known.has(d.id))) {
        setPending(null);
        setNotice(t.paired);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, refresh, t.paired, t.expired]);

  // Move focus to a new code so keyboard and screen-reader users land on it.
  const pendingCode = pending?.code;
  useEffect(() => {
    if (pendingCode) codeBox.current?.focus();
  }, [pendingCode]);

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

  const getCode = () => {
    if (busy) return;
    return run("code", async () => {
      const res = await fetch("/api/desktop/code", { method: "POST" });
      if (res.status === 503) return setUnavailable(true);
      if (!res.ok) throw new Error("code");
      const body = (await res.json()) as { code?: unknown; expiresAt?: unknown };
      if (typeof body.code !== "string" || !/^[A-HJKMNP-Z2-9]{10}$/.test(body.code)) throw new Error("code");
      const expires = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
      setCopied("");
      setPending({
        code: body.code,
        expiresAt: Number.isFinite(expires) ? expires : Date.now() + 10 * 60_000,
        known: new Set((devices ?? []).map((d) => d.id)),
        command: desktopCommand(window.location.origin),
      });
    });
  };

  const unlink = (id: string) => {
    if (busy) return;
    return run(`unlink:${id}`, async () => {
      const res = await fetch("/api/desktop/pair", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: id }),
      });
      if (!res.ok && res.status !== 404) throw new Error("unlink");
      await refresh();
      // The row (and its button) is gone: keep focus in the list's heading, not <body>.
      devicesHead.current?.focus();
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setNotice(t.copied);
    } catch {
      /* clipboard blocked: the text is on screen */
    }
  };

  const seen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(HTML_LANG[lang], { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-label tracking-[0.08em] text-ink-muted uppercase">
        <Monitor className="size-5 text-accent" aria-hidden /> {t.title}
      </h3>
      <div className="panel rounded-lg p-5">
        {devices === null ? (
          <p className="flex min-h-12 items-center text-ink-muted" role="status">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">{t.loading}</span>
          </p>
        ) : unavailable ? (
          <p className="text-body text-ink-muted">{t.unavailable}</p>
        ) : (
          <>
            <p className="text-body text-ink">{t.intro}</p>
            <button type="button" className={secondary + " mt-4"} aria-disabled={busy !== null || undefined} onClick={getCode}>
              {busy === "code" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <KeyRound className="size-5 text-accent" aria-hidden />}
              {t.getCode}
              {busy === "code" && <span className="sr-only">{t.loading}</span>}
            </button>

            {pending && (
              <div ref={codeBox} tabIndex={-1} className="mt-4 rounded-lg border border-accent/45 bg-panel-2 p-5 shadow-accent outline-none">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-body text-ink">{t.runHint}</p>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    aria-label={t.cancel}
                    className="press -mt-2 -mr-2 grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink"
                  >
                    <X className="size-6" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 font-mono text-small text-ink select-all [overflow-wrap:anywhere]">
                    {pending.command}
                  </code>
                  <button type="button" className={secondary + " px-3"} onClick={() => copy(pending.command)} aria-label={`${t.copy}: ${pending.command}`}>
                    {copied === pending.command ? <Check className="size-5 text-success" aria-hidden /> : <Copy className="size-5" aria-hidden />}
                  </button>
                </div>
                {/* Sized to the viewport; a line may break only at the dash, never inside a group. */}
                <p className="numeral my-3 rounded-md border border-line bg-panel px-4 py-3 text-center text-[clamp(1.25rem,7vw,2.5rem)] tracking-[0.12em] text-ink select-all">
                  <span className="inline-block">{pending.code.slice(0, 5)}-</span>
                  <span className="inline-block">{pending.code.slice(5)}</span>
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-small text-ink-muted">{t.codeNote}</p>
                  <button type="button" className={secondary} onClick={() => copy(pending.code)}>
                    {copied === pending.code ? <Check className="size-5 text-success" aria-hidden /> : <Copy className="size-5" aria-hidden />}
                    {copied === pending.code ? t.copied : t.copy}
                  </button>
                </div>
              </div>
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

            <h4 ref={devicesHead} tabIndex={-1} className="mt-6 mb-2 text-body font-semibold text-ink outline-none">
              {t.devices}
            </h4>
            {!devices.length ? (
              <p className="text-body text-ink-muted">{t.none}</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel-2">
                {devices.map((d) => (
                  <li key={d.id} className="flex min-h-14 items-center gap-3 px-3 py-1.5">
                    <Monitor className="size-5 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-ink [overflow-wrap:anywhere]">{d.name}</span>
                      <span className="block text-small text-ink-faint">
                        {t.lastSeen}: {seen(d.lastSeen)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="press inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-ink-muted hover:bg-panel-3 hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                      aria-disabled={busy !== null || undefined}
                      onClick={() => unlink(d.id)}
                      aria-label={`${t.unlink}: ${d.name}`}
                    >
                      {busy === `unlink:${d.id}` ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Unlink className="size-5" aria-hidden />}
                      <span className="text-small">{t.unlink}</span>
                      {busy === `unlink:${d.id}` && <span className="sr-only">{t.loading}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
