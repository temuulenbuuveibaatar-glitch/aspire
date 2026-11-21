"use client";

// Reminder notifications while Aspire is closed (Web Push, lib/push.ts, public/sw.js).
// - ServiceWorker: registers /sw.js in production (offline page, cached build files, push).
// - PushToggle: the Settings switch. Asks the browser for permission, subscribes with the VAPID
//   public key and hands the subscription to /api/push; off (and signing out) unsubscribes and tells the server.
//   iPhone/iPad only get push from a Home Screen app (iOS 16.4+), so Safari tabs are told how.

import { useEffect, useState } from "react";
import { SYNC_EVENT } from "@/lib/device-store";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const HIDE_KEY = "aspire:push-hide-text";

const TEXT: Record<Lang, Record<"title" | "help" | "warn" | "ios" | "denied" | "unsupported" | "error" | "hide" | "on" | "off", string>> = {
  mn: {
    title: "Сануулгын мэдэгдэл",
    help: "Aspire хаалттай байсан ч сануулга дуугарна.",
    warn: "Энэ нь эмнэлгийн дохиолол биш. Сэрэх эсвэл чухал эм уух бол утасныхаа сэрүүлгийг бас тохируулаарай.",
    ios: "iPhone, iPad дээр: Share, дараа нь Add to Home Screen-г дарж, Aspire-г тэндээс нээнэ үү (iOS 16.4 ба түүнээс хойш).",
    denied: "Aspire-ийн мэдэгдлийг хөтөч хаасан байна. Хөтчийн сайтын тохиргооноос зөвшөөрнө үү.",
    unsupported: "Энэ хөтөч Aspire хаалттай үед мэдэгдэл харуулж чадахгүй.",
    error: "Мэдэгдлийг асааж чадсангүй. Дараа дахин оролдоно уу.",
    hide: "Түгжээтэй дэлгэц дээр сануулгын текстийг нуух",
    on: "Асаалттай",
    off: "Унтраалттай",
  },
  zh: {
    title: "提醒通知",
    help: "即使 Aspire 已关闭，提醒也会响起。",
    warn: "这不是医疗警报。起床或重要服药，请同时设置手机闹钟。",
    ios: "在 iPhone 和 iPad 上：点按“分享”，再点“添加到主屏幕”，然后从主屏幕打开 Aspire（需 iOS 16.4 或更高版本）。",
    denied: "Aspire 的通知已被阻止。请在浏览器的网站设置中允许。",
    unsupported: "此浏览器无法在 Aspire 关闭时显示通知。",
    error: "无法开启通知，请稍后再试。",
    hide: "在锁屏上隐藏提醒内容",
    on: "开",
    off: "关",
  },
  en: {
    title: "Reminder notifications",
    help: "Reminders ring even when Aspire is closed.",
    warn: "Not a medical alarm. For waking up or critical medicine, also set your phone alarm.",
    ios: "On iPhone and iPad: tap Share, then Add to Home Screen, and open Aspire from there (iOS 16.4 or later).",
    denied: "Notifications are blocked for Aspire. Allow them in your browser's site settings.",
    unsupported: "This browser cannot show notifications while Aspire is closed.",
    error: "Could not turn notifications on. Please try again later.",
    hide: "Hide reminder text on the lock screen",
    on: "On",
    off: "Off",
  },
  ru: {
    title: "Уведомления о напоминаниях",
    help: "Напоминания сработают, даже когда Aspire закрыт.",
    warn: "Это не медицинский будильник. Чтобы проснуться или не пропустить важное лекарство, поставьте и будильник в телефоне.",
    ios: "На iPhone и iPad: нажмите «Поделиться», затем «На экран „Домой“» и откройте Aspire оттуда (iOS 16.4 или новее).",
    denied: "Уведомления для Aspire заблокированы. Разрешите их в настройках сайта в браузере.",
    unsupported: "Этот браузер не может показывать уведомления, когда Aspire закрыт.",
    error: "Не удалось включить уведомления. Попробуйте позже.",
    hide: "Скрывать текст напоминания на экране блокировки",
    on: "Вкл.",
    off: "Выкл.",
  },
  de: {
    title: "Erinnerungen als Mitteilung",
    help: "Erinnerungen klingeln auch, wenn Aspire geschlossen ist.",
    warn: "Kein medizinischer Alarm. Zum Aufwachen oder für wichtige Medikamente stellen Sie zusätzlich den Wecker im Telefon.",
    ios: "Auf iPhone und iPad: Teilen antippen, dann Zum Home-Bildschirm, und Aspire von dort öffnen (ab iOS 16.4).",
    denied: "Mitteilungen für Aspire sind blockiert. Erlauben Sie sie in den Website-Einstellungen des Browsers.",
    unsupported: "Dieser Browser kann keine Mitteilungen zeigen, wenn Aspire geschlossen ist.",
    error: "Mitteilungen konnten nicht eingeschaltet werden. Bitte später erneut versuchen.",
    hide: "Erinnerungstext auf dem Sperrbildschirm ausblenden",
    on: "An",
    off: "Aus",
  },
};

/** Registers the service worker once, in production builds only. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

type Status = "loading" | "unsupported" | "ios" | "denied" | "off" | "on" | "error";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => !!KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(k: string): Uint8Array<ArrayBuffer> {
  const raw = atob(k.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(k.length / 4) * 4, "="));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSub(): Promise<PushSubscription | null> {
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Notifications off for this browser: the server row goes, then the browser subscription.
 * Also runs before signing out, so a shared phone never rings with the last person's reminders.
 */
export async function dropPush(): Promise<void> {
  try {
    const sub = await currentSub();
    if (!sub) return;
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    // Once unsubscribed here, a row the DELETE missed is dropped on the push service's next 404/410.
    await sub.unsubscribe();
  } catch {
    // no service worker or push support: nothing to drop
  }
}

const readHide = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

export function PushToggle({ lang }: { lang: Lang }) {
  const t = TEXT[lang] ?? TEXT.en;
  const [status, setStatus] = useState<Status>("loading");
  const [hide, setHide] = useState(false);

  useEffect(() => {
    let live = true;
    (async (): Promise<Status> => {
      if (!supported()) return isIos() && !standalone() ? "ios" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      return (await currentSub().catch(() => null)) ? "on" : "off";
    })().then((s) => {
      if (!live) return;
      setHide(readHide());
      setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);

  async function turnOn(hideText: boolean) {
    setStatus("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setStatus(perm === "denied" ? "denied" : "off");
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), lang, hideText }) });
      setStatus(res.ok ? "on" : "error");
      // Reminders reach the push sender through the cloud copy: send them there now.
      if (res.ok) window.dispatchEvent(new Event(SYNC_EVENT));
    } catch {
      setStatus("error");
    }
  }

  async function turnOff() {
    setStatus("loading");
    await dropPush();
    setStatus("off");
  }

  function setHideText(on: boolean) {
    setHide(on);
    try {
      localStorage.setItem(HIDE_KEY, on ? "1" : "0");
    } catch {
      // private mode: the choice still reaches the server below
    }
    if (status === "on") void turnOn(on);
  }

  const on = status === "on";
  const usable = status === "on" || status === "off" || status === "error";
  const note = status === "ios" ? t.ios : status === "denied" ? t.denied : status === "unsupported" ? t.unsupported : status === "error" ? t.error : null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!usable}
        aria-busy={status === "loading"}
        onClick={() => void (on ? turnOff() : turnOn(hide))}
        className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body font-medium text-ink disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span>{t.title}</span>
          <span className="text-small font-normal text-ink-muted">{t.help}</span>
        </span>
        <span aria-hidden className={cn("shrink-0 text-small", on ? "text-accent" : "text-ink-muted")}>
          {on ? t.on : t.off}
        </span>
        <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full border", on ? "border-accent bg-accent/30" : "border-line-strong bg-panel-3")}>
          <span className={cn("absolute top-1/2 left-1 size-5 -translate-y-1/2 rounded-full transition-transform duration-150 still:transition-none", on ? "translate-x-5 bg-accent" : "translate-x-0 bg-ink-muted")} />
        </span>
      </button>
      {note && (
        <p role="status" className="text-small text-ink-muted">
          {note}
        </p>
      )}
      {on && (
        <label className="flex min-h-12 items-center gap-3 text-body text-ink">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={hide} onChange={(e) => setHideText(e.target.checked)} />
          {t.hide}
        </label>
      )}
      <p className="text-small text-ink-muted">{t.warn}</p>
    </div>
  );
}
