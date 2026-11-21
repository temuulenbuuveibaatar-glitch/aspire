"use client";

import { ExternalLink, Globe } from "lucide-react";
import { useSyncExternalStore } from "react";
import { appName, checkAppAction, detectPlatform, PLATFORM_NAMES, type Platform } from "@/lib/app-links";
import type { Lang } from "@/lib/lang";
import type { OpenAppAction } from "@/lib/tools/types";

type Text = { kind: string; open: (n: string) => string; web: string; hint: string; elsewhere: string; nowhere: string; worksOn: string };
const TEXT: Record<Lang, Text> = {
  mn: { kind: "Апп", open: (n) => `${n} нээх`, web: "Вэбээр нээх", hint: "Апп суусан бол дарахад нээгдэнэ.", elsewhere: "Энэ төхөөрөмж дээр нээгдэхгүй байж магадгүй. Вэб хувилбарыг ашиглана уу.", nowhere: "Энэ төхөөрөмж дээр нээгдэхгүй байж магадгүй.", worksOn: "Ажиллах" },
  zh: { kind: "应用", open: (n) => `打开 ${n}`, web: "在网页中打开", hint: "如已安装，点击即可打开。", elsewhere: "此设备上可能无法打开，请使用网页版。", nowhere: "此设备上可能无法打开。", worksOn: "适用于" },
  en: { kind: "App", open: (n) => `Open ${n}`, web: "Open on the web", hint: "Opens if the app is installed on this device.", elsewhere: "This may not open on this device. Use the web version.", nowhere: "This may not open on this device.", worksOn: "Works on" },
  ru: { kind: "Приложение", open: (n) => `Открыть ${n}`, web: "Открыть в браузере", hint: "Откроется, если приложение установлено.", elsewhere: "На этом устройстве может не открыться. Используйте веб-версию.", nowhere: "На этом устройстве может не открыться.", worksOn: "Работает на" },
  de: { kind: "App", open: (n) => `${n} öffnen`, web: "Im Web öffnen", hint: "Öffnet sich, wenn die App installiert ist.", elsewhere: "Auf diesem Gerät öffnet es sich vielleicht nicht. Nutze die Web-Version.", nowhere: "Auf diesem Gerät öffnet es sich vielleicht nicht.", worksOn: "Läuft auf" },
};

const noop = () => () => {};
/** The device family; null during SSR and hydration so the markup matches. */
const usePlatform = (): Platform | null =>
  useSyncExternalStore(noop, () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints), () => null);

const BTN = "press inline-flex items-center justify-center gap-2 rounded-md px-4 font-medium focus-visible:outline-2 focus-visible:outline-accent";

/** "Open <app>": a big button for the app's own URL plus an "Open on the web" fallback. Never opens anything by itself. */
export function OpenAppCard({ action, lang }: { action: OpenAppAction; lang: Lang }) {
  const t = TEXT[lang] ?? TEXT.en;
  const platform = usePlatform();
  const ok = checkAppAction(action); // only allow-listed URLs reach the DOM
  if (!ok) return null;
  const { app, web } = ok;
  // Settings: the catalog's macOS scheme on a Mac (a Windows page target does not apply there).
  const scheme = platform === "mac" && app.mac ? app.mac : ok.scheme;
  // Shown before the tap so a number, @username, address or search baked into the link is never hidden.
  const target = scheme === ok.scheme ? ok.target : "";
  const name = appName(app, lang); // from the catalog, never from the action
  const elsewhere = platform !== null && !app.platforms.includes(platform) && !(platform === "mac" && app.mac);

  return (
    <section className="hud flex min-w-0 flex-col gap-3 p-3 text-ink" aria-label={`${t.kind}: ${name}`}>
      <header className="min-w-0">
        <p className="text-label uppercase tracking-[0.12em] text-ink-muted">{t.kind}</p>
        <p className="text-body font-medium [overflow-wrap:anywhere]">{name}</p>
        {/* Never truncated: a number, @username or address baked into the link must stay visible. */}
        {target && <p className="text-small text-ink-muted [overflow-wrap:anywhere]">{target}</p>}
        <p className="text-small text-ink-muted">
          {t.worksOn}: {app.platforms.map((p) => PLATFORM_NAMES[p]).join(", ")}
        </p>
      </header>
      <a href={scheme} className={`${BTN} min-h-14 bg-accent text-body text-on-accent hover:opacity-90`}>
        <ExternalLink aria-hidden className="size-5" />
        {t.open(name)}
      </a>
      {web && (
        <a href={web} target="_blank" rel="noopener noreferrer" className={`${BTN} min-h-12 border border-line-strong bg-panel-2 text-body text-ink hover:bg-panel-3`}>
          <Globe aria-hidden className="size-5" />
          {t.web}
          <span className="sr-only"> ({new URL(web).host})</span>
        </a>
      )}
      <p className={`text-small ${elsewhere ? "text-warn" : "text-ink-muted"}`}>{elsewhere ? (web ? t.elsewhere : t.nowhere) : t.hint}</p>
    </section>
  );
}
