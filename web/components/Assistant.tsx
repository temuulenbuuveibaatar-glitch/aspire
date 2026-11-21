"use client";

// The main screen, v5 "Jarvis HUD" (docs/design/aspire-v4-hud.md): the person's own city photo (from
// this device's cache the moment the app opens) with the time of day and the live weather over it
// (Backdrop), the HUD frame with here-and-now readouts (HudFrame), one-tap Map / News / Buses, the orb
// in a reticle at the centre, the conversation with its code and form cards, the headlines
// (NewsStrip), and the OpenStreetMap live map (side panel on desktop, full screen on phones). Sheet
// contents live in components/aspire/SettingsSheets.tsx.
//
// Behaviour kept from v3: voice capture with silence detection (the mobile-safe listen() now in lib/use-voice.ts),
// per-message language detection, /api/ask, /api/listen, /api/speak, the 401 guard, the Settings,
// Connections and Memory sheets, Gmail, Calendar and bot links, the daily briefing, reminders and
// the alarm banner, action and media cards, sign-out, and the device store with cloud sync.

import { Bus, MapIcon, Maximize2, Menu, Newspaper, Sunrise } from "lucide-react";
import { MotionConfig } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isCard } from "@/components/aspire/ActionCard";
import { Backdrop } from "@/components/aspire/Backdrop";
import { useDailyBriefing } from "@/components/aspire/BriefingCard";
import { Composer } from "@/components/aspire/Composer";
import { HudFrame } from "@/components/aspire/HudFrame";
import { LiveMap, prefetchMap } from "@/components/aspire/LiveMap";
import { MessageList, type ChatMessage } from "@/components/aspire/MessageList";
import { NewsStrip } from "@/components/aspire/NewsStrip";
import { hudReadouts } from "@/components/aspire/readouts";
import { ConnectionsBody, MemoryBody, MenuBody, SettingsBody, WherePrompt } from "@/components/aspire/SettingsSheets";
import { Sheet } from "@/components/aspire/Sheet";
import { skyFamily } from "@/components/aspire/Sky";
import { VoiceOrb, voiceOrbWord, type VoiceOrbState } from "@/components/ui/voice-orb";
import { AQI_ORDER, SKY_KINDS, type AmbientSky, type SkyKind } from "@/lib/ambient-types";
import { applyActions, takeDue, useDevice } from "@/lib/device-store";
import { isImperial, useDisplayPrefs, useMedia } from "@/lib/display-prefs";
import { isErdenet } from "@/lib/geo";
import { greeting, notableFrom, notableSentence } from "@/lib/greeting";
import { detectTextLanguage, HTML_LANG, isLang, type Lang } from "@/lib/lang";
import { buildSuggestions } from "@/lib/suggestions";
import { phaseParam } from "@/lib/sun";
import type { Channel, ClientAction, Reminder, Title } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { devicePosition, roundedPosition, useAmbient } from "@/lib/use-ambient";
import { useVoice } from "@/lib/use-voice";
import { cn } from "@/lib/utils";
import { isAllowedWebhook } from "@/lib/webhooks";

type Msg = ChatMessage;
type SheetName = "settings" | "connections" | "memory" | "menu" | null;

const ERROR_HOLD_MS = 2400;
const FLASH_MS = 2500;
const CONDITIONS_EVERY_MS = 10 * 60_000;
const LANG_KEY = "aspire-lang";
const WHERE_KEY = "aspire-where";
const NEWS_KEY = "aspire-news";
const ENGINE: Record<string, string> = { elevenlabs: "ElevenLabs", azure: "Azure", gemini: "Gemini", omnivoice: "OmniVoice" };
const GUARDED = /^\/api\/(ask|listen|speak|send|briefing|ambient|transit|calendar|news)$/;

const uid = () => Math.random().toString(36).slice(2, 10);
const storeIn = (area: () => Storage) => ({
  get: (k: string) => {
    try {
      return area().getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      area().setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
});
const store = storeIn(() => localStorage);
const session = storeIn(() => sessionStorage);

/** The saved screen language, else the browser's (mn, zh, en, ru, de), else English. */
function startingLang(): Lang {
  const saved = store.get(LANG_KEY);
  if (isLang(saved)) return saved;
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = String(tag || "").toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

/** Demo override: ?sky=rain|snow|storm|fog|drizzle|sleet|hail|cloudy|partly|clear and &night=1 (time of day: ?time=sunset, lib/sun). */
function skyOverride(search: string): { kind: SkyKind; night: boolean } | null {
  const q = new URLSearchParams(search);
  const kind = q.get("sky")?.toLowerCase();
  return kind && (SKY_KINDS as readonly string[]).includes(kind) ? { kind: kind as SkyKind, night: q.get("night") === "1" } : null;
}

/** "14:32 Sat 21 Nov" at the place (its IANA zone), else on the device. */
function clockText(minute: number | null, lang: Lang, timeZone: string | null | undefined): string {
  if (minute == null) return " ";
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short", day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat(HTML_LANG[lang], { ...opts, timeZone: timeZone ?? undefined }).format(minute * 60_000);
  } catch {
    return new Intl.DateTimeFormat(HTML_LANG[lang], opts).format(minute * 60_000);
  }
}

// ---- tiny external stores (stable during hydration) ----
const subscribeNothing = () => () => {};
const subscribeMinute = (cb: () => void) => {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
};
const useMinute = () => useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => null);
const useDeviceTags = () =>
  useSyncExternalStore(subscribeNothing, () => (navigator.languages?.length ? navigator.languages : [navigator.language]).join(","), () => "");
const useSearch = () => useSyncExternalStore(subscribeNothing, () => window.location.search, () => "");
let firstOpen: boolean | null = null;
/** True on the first open of this browser session (the greeting adds "How is it going?"). */
function readFirstOpen(): boolean {
  if (firstOpen === null) {
    try {
      firstOpen = sessionStorage.getItem("aspire-greeted") !== "1";
      sessionStorage.setItem("aspire-greeted", "1");
    } catch {
      firstOpen = true;
    }
  }
  return firstOpen;
}
const useFirstOpen = () => useSyncExternalStore(subscribeNothing, readFirstOpen, () => true);

export default function Assistant() {
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [alarm, setAlarm] = useState<Reminder | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [sheetWord, setSheetWord] = useState("");
  const [mapFull, setMapFull] = useState(false);
  const [newsOpen, setNewsOpen] = useState(true);
  const [whereAsked, setWhereAsked] = useState<boolean | null>(null);
  const [consented, setConsented] = useState(true);
  const [ready, setReady] = useState(false);
  const { device, update } = useDevice();
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  const [prefs, setPrefs] = useDisplayPrefs();
  const desktop = useMedia("(min-width: 1024px)");
  const short = useMedia("(max-height: 719px)");
  const minute = useMinute();
  const search = useSearch();
  const first = useFirstOpen();
  const deviceTags = useDeviceTags();

  const input = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mapPanel = useRef<HTMLElement>(null);

  // Orb error state, held briefly after a failure; transient status pill text ("Voice: Jarvis (ElevenLabs)").
  const [orbError, setOrbError] = useState(false);
  const [flash, setFlash] = useState("");
  const timers = useRef<{ error?: number; flash?: number }>({});
  const flashError = useCallback(() => {
    setOrbError(true);
    window.clearTimeout(timers.current.error);
    timers.current.error = window.setTimeout(() => setOrbError(false), ERROR_HOLD_MS);
  }, []);
  const showFlash = useCallback((text: string) => {
    setFlash(text);
    window.clearTimeout(timers.current.flash);
    timers.current.flash = window.setTimeout(() => setFlash(""), FLASH_MS);
  }, []);
  const lastEngine = useRef("");

  const t = UI[lang];
  const settings = device.settings ?? {};
  const title: Title = settings.title ?? "mr";

  // ---- browser-only state, read after mount ----
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- storage and navigator are browser-only */
    setLang(startingLang());
    setLangReady(true);
    // "Not now" lasts this session only, so the question comes back until a place is set.
    setWhereAsked(store.get(WHERE_KEY) === "1" || session.get(WHERE_KEY) === "1");
    setConsented(store.get("aspire-consent") === "1" || store.get("emee-consent") === "1");
    setNewsOpen(store.get(NEWS_KEY) !== "0");
    setReady(true); // useDevice loads stored data in its own earlier effect
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const chooseLang = useCallback((l: Lang) => {
    setLang(l);
    store.set(LANG_KEY, l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  // A guarded API answering 401 sends the person to sign in again (covers ActionCard's /api/send too).
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original.apply(window, args);
      if (res.status === 401) {
        const req = args[0];
        const target = new URL(typeof req === "string" ? req : req instanceof URL ? req.href : req.url, window.location.href);
        if (target.origin === window.location.origin && GUARDED.test(target.pathname)) window.location.replace("/login?next=/&expired=1");
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  // ---- location: ask once on first open (no silent network guess before the person answers) ----
  const located = settings.shareLocation === true || !!settings.city;
  const whereOpen = ready && whereAsked === false && !located;
  const answerWhere = (forGood = true) => {
    (forGood ? store : session).set(WHERE_KEY, "1");
    setWhereAsked(true);
  };
  const setShareLocation = async (on: boolean): Promise<boolean> => {
    // Turning it on asks the browser right away (inside the tap); refused = stays off.
    if (on && !(await devicePosition())) {
      setNotice(t.hud.noLocation);
      return false;
    }
    update((d) => ({ ...d, settings: { ...d.settings, shareLocation: on } }));
    return true;
  };
  const setCity = (city: string) => update((d) => ({ ...d, settings: { ...d.settings, city: city || undefined } }));

  const ambient = useAmbient({
    lang,
    shareLocation: settings.shareLocation === true,
    city: settings.city ?? null,
    enabled: langReady && whereAsked !== null && (whereAsked || located),
  });

  const voice = useVoice({
    lang,
    voice: () => deviceRef.current.settings?.voice ?? "jarvis",
    onHeard: (text, l) => askBrain(text, l),
    onNotice: setNotice,
    onError: flashError,
    onEngine: (engine, v, l) => {
      const name = ENGINE[engine];
      if (!name || name === lastEngine.current) return;
      lastEngine.current = name;
      showFlash(UI[l].hud.voiceVia.replace("{name}", `${v === "friday" ? "Friday" : "Jarvis"} (${name})`));
    },
  });
  const { phase, setPhase, speak } = voice;
  useEffect(
    () => () => {
      window.clearTimeout(timers.current.error);
      window.clearTimeout(timers.current.flash);
    },
    [],
  );

  // ---- morning briefing: first open of the day ----
  const { briefing, refresh: refreshBriefing } = useDailyBriefing({
    lang,
    reminders: device.reminders,
    speak: (text: string, l: Lang) => speak(text, l),
    lastDate: settings.lastBriefingDate,
    setLastDate: (date) => update((d) => ({ ...d, settings: { ...d.settings, lastBriefingDate: date } })),
    title,
    // Wait for the snapshot, so the briefing names the person's place, not the IP guess.
    ready: ready && !whereOpen && ambient !== null,
    city: ambient?.place ?? settings.city ?? null,
    location: settings.shareLocation === true ? roundedPosition : undefined,
  });

  // ---- thinking ----
  const ambientRef = useRef(ambient);
  useEffect(() => {
    ambientRef.current = ambient;
  }, [ambient]);
  const askBrain = useCallback(
    async (text: string, l: Lang) => {
      setNotice("");
      chooseLang(l);
      setPhase("thinking");
      const history = messages
        .filter((m) => !m.error)
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, { id: uid(), role: "user", text, lang: l }]);
      const d = deviceRef.current;
      const hooks = d.settings?.webhooks ?? {};
      const connected: Channel[] = ["sms", "email"];
      if (hooks.discord && isAllowedWebhook("discord", hooks.discord)) connected.push("discord");
      if (hooks.slack && isAllowedWebhook("slack", hooks.slack)) connected.push("slack");
      // The fix is cached (lib/use-ambient), and 3 decimals (about 100 m) is all the server keeps.
      const location = d.settings?.shareLocation ? await devicePosition(3) : null;
      let tz: string | undefined;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      } catch {
        tz = undefined;
      }
      const city = ambientRef.current?.place ?? d.settings?.city;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: l,
          history,
          ...(tz ? { tz } : {}),
          ...(city ? { city } : {}),
          // Channel URLs stay on the device; only names of connected apps are sent.
          device: {
            memory: d.memory,
            reminders: d.reminders,
            routines: d.routines ?? [],
            lessons: d.lessons ?? [],
            connected,
            settings: {
              voice: d.settings?.voice,
              title: d.settings?.title ?? "mr",
              // The same units as the screen (Settings, mirrored on <html data-units>), so spoken numbers match.
              units: isImperial(document.documentElement.dataset.units === "imperial" ? "imperial" : document.documentElement.dataset.units === "metric" ? "metric" : "auto") ? "imperial" : "metric",
            },
            ...(location ? { location } : {}),
          },
        }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as {
        reply?: string;
        error?: string;
        actions?: ClientAction[];
        steps?: Msg["steps"];
        sources?: { title: string; url: string }[];
      } | null;
      if (!res?.ok || !data?.reply) {
        const msg = data?.error === "brain_not_configured" ? UI[l].brainOffline : UI[l].error;
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: msg, lang: l, error: true }]);
        setPhase("idle");
        flashError();
        return;
      }
      const actions = data.actions ?? [];
      if (actions.length) update((dev) => applyActions(dev, actions));
      const cards = actions.filter((a) => isCard(a) || a.type === "video" || a.type === "spotify" || a.type === "code" || a.type === "form");
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: data.reply!, lang: l, steps: data.steps ?? [], cards, sources: data.sources ?? [] }]);
      await speak(data.reply, l);
    },
    [messages, speak, setPhase, update, chooseLang, flashError],
  );

  // ---- reminders: checked every 15 s, spoken when due (shown only while the mic or the brain is busy) ----
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    const id = setInterval(() => {
      const { due, next } = takeDue(deviceRef.current, new Date());
      if (!due.length) return;
      update(() => next);
      setAlarm(due[0]);
      if (phaseRef.current === "listening" || phaseRef.current === "thinking") return;
      void speak(due[0].text, detectTextLanguage(due[0].text));
    }, 15_000);
    return () => clearInterval(id);
  }, [speak, update]);

  const acceptConsent = () => {
    if (consented) return;
    setConsented(true);
    store.set("aspire-consent", "1");
  };
  const onCore = () => {
    acceptConsent();
    voice.core();
  };
  const send = (text: string) => {
    const q = text.trim();
    if (!q || phase !== "idle") return;
    voice.unlock(); // inside the tap, before any await: iOS plays the reply only then
    acceptConsent();
    setDraft("");
    void askBrain(q, detectTextLanguage(q, lang));
  };

  // ---- sheets: remember the opener ourselves (the app root turns inert while a sheet is open) ----
  const openSheet = (name: Exclude<SheetName, null>) => {
    const active = document.activeElement;
    if (sheet === null && active instanceof HTMLElement && active !== document.body) opener.current = active;
    setSheet(name);
  };
  const closeSheet = () => {
    setSheet(null);
    setSheetWord("");
    const back = opener.current;
    requestAnimationFrame(() => back?.isConnected && back.focus());
  };
  // Full screen map: a history entry so the phone's Back closes it, the app behind turns inert, and
  // focus returns to whatever opened it.
  const openFullMap = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) opener.current = active;
    history.pushState({ aspireMap: 1 }, "");
    setMapFull(true);
  };
  const closeFullMap = () => {
    if ((history.state as { aspireMap?: number } | null)?.aspireMap) history.back(); // popstate closes it
    else setMapFull(false);
  };
  useEffect(() => {
    if (!mapFull) return;
    const onPop = () => setMapFull(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const back = opener.current;
      requestAnimationFrame(() => back?.isConnected && back.focus());
    };
  }, [mapFull]);
  // Desktop: the map is already beside the chat, so bring it into view; phones open it full screen.
  const openMap = () => {
    if (desktop && mapPanel.current) {
      mapPanel.current.scrollIntoView({ block: "nearest" });
      mapPanel.current.querySelector<HTMLElement>("[role=region]")?.focus();
    } else openFullMap();
  };
  const newsBox = useRef<HTMLDivElement>(null);
  const toggleNews = () => {
    const open = !newsOpen;
    setNewsOpen(open);
    store.set(NEWS_KEY, open ? "1" : "0");
    if (open) requestAnimationFrame(() => newsBox.current?.scrollIntoView({ block: "nearest", behavior: prefs.calm ? "auto" : "smooth" }));
  };

  // On-screen keyboard (iOS never resizes the layout viewport): lift the composer above it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const on = () => {
      const kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.setProperty("--kb", `${kb}px`);
      if (kb > 0) root.setProperty("--kb-pad", "8px");
      else root.removeProperty("--kb-pad");
    };
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    on();
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      root.removeProperty("--kb");
      root.removeProperty("--kb-pad");
    };
  }, []);

  // Space on an unscrollable page = the core (kiosks and keyboards), only when nothing has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || sheet || e.defaultPrevented) return;
      if (e.target !== document.body && e.target !== document.documentElement) return;
      const root = document.scrollingElement;
      if (root && root.scrollHeight > window.innerHeight + 1) return;
      e.preventDefault();
      document.getElementById("aspire-core")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  // ---- derived view state ----
  const empty = messages.length === 0;
  const busy = phase !== "idle";
  const orbState: VoiceOrbState = orbError && phase === "idle" ? "error" : phase;
  const word = voiceOrbWord(orbState, lang);
  const coreLabel = phase === "idle" ? t.startListening : phase === "listening" ? t.stopListening : phase === "speaking" ? t.stopSpeaking : word;
  const deviceHour = minute == null ? null : new Date(minute * 60_000).getHours();
  const override = useMemo(() => skyOverride(search), [search]);
  const sky: AmbientSky = override
    ? { kind: override.kind, intensity: override.kind === "clear" ? 0 : 0.85, isDay: !override.night, windKph: override.kind === "storm" ? 40 : 14, cloudCover: null }
    : (ambient?.sky ?? { kind: "clear", intensity: 0, isDay: deviceHour == null || (deviceHour >= 5 && deviceHour < 21), windKph: 0, cloudCover: null, known: false });
  const localHour = override ? (override.night ? 23 : 13) : (ambient?.localHour ?? deviceHour);
  const shown = useMemo(() => (override && ambient ? { ...ambient, sky: { ...ambient.sky, kind: override.kind, known: true } } : ambient), [override, ambient]);
  const greetingText = useMemo(
    () => greeting(lang, title, localHour ?? 12, shown, first, minute == null ? null : minute * 60_000),
    [lang, title, shown, localHour, first, minute],
  );
  const starters = useMemo(
    () => buildSuggestions({ ambient: shown, hour: localHour, lang, tags: deviceTags ? deviceTags.split(",") : [] }),
    [shown, localHour, lang, deviceTags],
  );
  const imperial = isImperial(prefs.units);
  const readouts = hudReadouts(shown, t, { imperial, openMap, openLocation: () => openSheet("settings"), now: minute == null ? null : minute * 60_000 });
  const erdenet = (!!ambient?.coords && isErdenet(ambient.coords.lat, ambient.coords.lng)) || ambient?.nextBus?.source === "erdenet-live";
  const mapStops = erdenet ? [] : (ambient?.stops ?? []).flatMap((s) => (s.lat != null && s.lng != null ? [{ name: s.name, lat: s.lat, lng: s.lng }] : []));
  const orbWeather = {
    family: skyFamily(sky.kind),
    windKph: Math.max(0, sky.windKph ?? 0),
    aqiSeverity: ambient?.air ? AQI_ORDER.indexOf(ambient.air.category) + 1 || 1 : 1,
    storm: sky.kind === "storm",
  };
  const sphere = empty ? (desktop ? 200 : short ? 128 : 160) : desktop ? 120 : 96;
  const pill = orbState !== "idle" ? word : flash;
  // The photo credit (bottom-left): Backdrop says when it is actually on screen.
  const [credit, setCredit] = useState(false);
  const quick: { id: string; icon: typeof Bus; label: string; onClick: () => void; expanded?: boolean; map?: boolean }[] = [
    { id: "map", icon: MapIcon, label: t.hud.map, onClick: openMap, map: true },
    { id: "news", icon: Newspaper, label: t.hud.news, onClick: toggleNews, expanded: newsOpen },
    ...(erdenet ? [{ id: "bus", icon: Bus, label: t.hud.buses, onClick: openFullMap, map: true }] : []),
  ];
  // Phones: fetch the map library while idle, so the first tap on Map or Buses shows a map, not a dark box.
  useEffect(() => {
    if (!ready || desktop) return;
    const load = () => void prefetchMap();
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 2000);
    return () => window.clearTimeout(id);
  }, [ready, desktop]);
  // Only once the screen language is known, so the first request is not wasted on the "en" default.
  const news = newsOpen && langReady && (
    <div ref={newsBox} id="aspire-news" className="scroll-mt-4">
      <NewsStrip lang={lang} country={erdenet ? "mn" : null} max={desktop ? 5 : 3} />
    </div>
  );

  // A notable change in conditions is announced at most once per 10 minutes (the first is in the greeting).
  const [conditionsNote, setConditionsNote] = useState("");
  const lastNote = useRef<{ at: number; text: string } | null>(null);
  useEffect(() => {
    if (!ambient) return;
    const n = notableFrom(ambient);
    const text = n ? notableSentence(lang, n) : "";
    const now = Date.now();
    if (!lastNote.current) {
      lastNote.current = { at: now, text };
      return;
    }
    if (!text || text === lastNote.current.text || now - lastNote.current.at < CONDITIONS_EVERY_MS) return;
    lastNote.current = { at: now, text };
    setConditionsNote(text);
  }, [ambient, lang]);

  const map = (full: boolean) => (
    <LiveMap
      center={ambient?.coords ?? null}
      lang={lang}
      stops={mapStops}
      taxis={ambient?.taxis ?? []}
      erdenet={erdenet}
      fullscreen={full}
      onClose={full ? closeFullMap : undefined}
      className={full ? undefined : "h-[min(420px,60vh)] rounded-md"}
    />
  );

  return (
    <MotionConfig reducedMotion={prefs.calm ? "always" : "user"}>
      <div lang={HTML_LANG[lang]}>
        <a href="#aspire-thread" className="skip-link">
          {t.skipToConversation}
        </a>
        {/* Calm and reduced motion still show the weather (one still frame); the opaque full-screen map pauses it. */}
        <Backdrop
          photo={ambient?.photo ?? null}
          sky={sky}
          localHour={localHour}
          effects={prefs.skyEffects && !mapFull}
          label={t.hud.photo}
          coords={ambient?.coords ?? null}
          place={ambient?.place ?? null}
          phase={phaseParam(search) ?? (override?.night ? "midnight" : null)}
          loaded={ambient != null}
          onCredit={setCredit}
        />

        {/* Under the full-screen map: inert, and on phones not rendered at all (no hidden canvas loops). */}
        <div inert={sheet !== null || whereOpen || mapFull} hidden={mapFull && !desktop} className="relative z-[1]">
          <HudFrame readouts={readouts} clock={clockText(minute, lang, ambient?.timeZone)}>
            <main className="mx-auto w-full max-w-[1200px] px-4 pb-56 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:gap-6 lg:px-6 lg:pt-6">
              <div className="min-w-0">
                <div className="hud mt-2 flex min-h-14 items-center gap-1 px-3">
                  <span lang="en" className="font-display text-wordmark text-ink">
                    ASPIRE
                  </span>
                  <button type="button" onClick={() => void refreshBriefing()} aria-label={t.briefing} title={t.briefing} className={cn(iconBtn, "ml-auto")}>
                    <Sunrise className="size-6" aria-hidden />
                  </button>
                  <button type="button" onClick={() => openSheet("menu")} aria-label={t.menu} title={t.menu} className={iconBtn}>
                    <Menu className="size-6" aria-hidden />
                  </button>
                </div>

                {/* ---- one tap to the map, the headlines and (Erdenet) the live buses ---- */}
                <nav aria-label={t.hud.quick} className="mt-2">
                  <ul className="flex flex-wrap gap-2">
                    {quick.map(({ id, icon: Icon, label, onClick, expanded, map: isMap }) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={onClick}
                          onPointerDown={isMap ? () => void prefetchMap() : undefined}
                          aria-expanded={expanded}
                          aria-controls={expanded ? "aspire-news" : undefined}
                          className="press hud inline-flex min-h-12 items-center gap-2 px-4 text-body font-medium text-ink"
                        >
                          <Icon className="size-5 shrink-0 text-hud" aria-hidden />
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                {/* ---- the orb in its reticle, the status pill, and (empty state) the greeting ---- */}
                <section aria-labelledby={empty ? "aspire-greeting" : undefined} className="flex flex-col items-center pt-[2vh]">
                  {!empty && <h1 className="sr-only">Aspire</h1>}
                  <button
                    id="aspire-core"
                    type="button"
                    onClick={onCore}
                    aria-label={coreLabel}
                    className="press relative grid place-items-center rounded-full"
                    style={{ width: Math.round(sphere * 1.4), height: Math.round(sphere * 1.4) }}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 100 100"
                      fill="none"
                      stroke="currentColor"
                      className={cn("pointer-events-none absolute inset-0 size-full text-hud", phase === "listening" && "animate-[spin_8s_linear_infinite] still:animate-none")}
                    >
                      <circle cx="50" cy="50" r="48" strokeWidth="0.8" strokeDasharray="44 10 6 10" />
                      <circle cx="50" cy="50" r="43" strokeWidth="0.5" strokeOpacity="0.6" strokeDasharray="1.5 3.5" />
                      <path d="M50 0v6M50 94v6M0 50h6M94 50h6" strokeWidth="0.8" />
                    </svg>
                    <VoiceOrb state={orbState} level={voice.level} bands={voice.bands} size={sphere} weather={orbWeather} lang={lang} label={word} />
                  </button>
                  <p aria-hidden className={cn("hud mt-3 min-h-12 px-4 py-2 text-label tracking-[0.12em] text-ink uppercase", !pill && "invisible")}>
                    {pill || " "}
                  </p>
                  {empty && (
                    <div className="hud mt-3 w-full max-w-[640px] px-5 py-4 text-center">
                      <h1 id="aspire-greeting" className="text-greeting text-ink">
                        {minute == null ? " " : greetingText}
                      </h1>
                      <p className="mt-2 text-body text-ink-muted">{t.tapOrSay}</p>
                    </div>
                  )}
                  {empty && (
                    <ul aria-label={t.suggestionsLabel} className="mt-4 flex w-full max-w-[640px] flex-wrap justify-center gap-2">
                      {starters.map((s) => (
                        <li key={s.kind}>
                          <button
                            type="button"
                            onClick={() => !busy && send(s.label)}
                            aria-disabled={busy || undefined}
                            className="press hud min-h-12 px-5 py-2 text-left text-body text-ink aria-disabled:opacity-60"
                          >
                            {s.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {!desktop && news && <div className="mx-auto mt-4 max-w-[720px]">{news}</div>}

                <MessageList
                  className="mx-auto mt-4 max-w-[720px]"
                  messages={messages}
                  lang={lang}
                  busy={busy}
                  thinking={phase === "thinking"}
                  webhooks={settings.webhooks ?? {}}
                  onReplay={(m) => voice.replay(m.text, m.lang)}
                  onOpenConnections={() => openSheet("connections")}
                  onRetry={(q) => {
                if (phase !== "idle") return;
                voice.unlock();
                void askBrain(q.text, q.lang);
              }}
                  address={title}
                  briefing={briefing ? { text: briefing.text, lang: briefing.lang, gmailError: briefing.gmailError, headlines: briefing.headlines } : null}
                  onReplayBriefing={() => {
                    if (!briefing || phase !== "idle") return;
                    voice.unlock();
                    void speak(briefing.text, briefing.lang);
                  }}
                  alarm={alarm}
                  onDismissAlarm={() => setAlarm(null)}
                  reducedMotion={prefs.calm || undefined}
                />
              </div>

              {/* desktop: the live map beside the chat, with a full-screen toggle */}
              {desktop && (
                <aside ref={mapPanel} aria-label={t.hud.map} className="sticky top-6 mt-4 max-h-[calc(100dvh-3rem)] self-start overflow-y-auto pb-2">
                  <div className="hud mb-2 flex items-center justify-between px-3">
                    <h2 className="text-label tracking-[0.12em] text-ink-muted uppercase">{t.hud.map}</h2>
                    <button type="button" onClick={openFullMap} aria-label={t.hud.fullscreen} title={t.hud.fullscreen} className={iconBtn}>
                      <Maximize2 className="size-5" aria-hidden />
                    </button>
                  </div>
                  {!mapFull && map(false)}
                  {news && <div className="mt-4">{news}</div>}
                </aside>
              )}
            </main>
          </HudFrame>

          {/* ---- composer: above the on-screen keyboard (--kb), and clear of the 48px photo credit ---- */}
          <div
            className="pointer-events-none fixed inset-x-0 z-20 bg-gradient-to-t from-bg/85 via-bg/50 to-transparent px-4 pt-8 lg:pl-[276px]"
            style={{
              bottom: "var(--kb, 0px)",
              paddingBottom: `var(--kb-pad, calc(max(8px, env(safe-area-inset-bottom)) + ${credit ? 56 : 0}px))`,
            }}
          >
            <Composer
              className="pointer-events-auto mx-auto w-full max-w-[720px]"
              phase={phase}
              draft={draft}
              onDraft={setDraft}
              onSubmit={send}
              onMic={onCore}
              level={voice.level}
              lang={lang}
              inputRef={input}
              before={
                notice || !consented ? (
                  <p className={cn("hud mb-2 px-4 py-2 text-small", notice ? "text-signal" : "text-ink-muted")} role={notice ? "alert" : undefined}>
                    {notice || t.consent}{" "}
                    {!notice && (
                      <>
                        <Link href="/privacy" className="text-ink underline">
                          {t.privacy}
                        </Link>{" "}
                        ·{" "}
                        <Link href="/terms" className="text-ink underline">
                          {t.terms}
                        </Link>
                      </>
                    )}
                  </p>
                ) : null
              }
            />
          </div>
        </div>

        {mapFull && map(true)}

        {/* The single status region, outside the inert root so it also speaks while a sheet is open. */}
        <p role="status" className="sr-only">
          <span>{pill}</span> <span>{sheetWord}</span> <span>{conditionsNote}</span>
        </p>

        <Sheet open={whereOpen && sheet === null} title={t.hud.whereTitle} closeLabel={t.hud.notNow} onClose={() => answerWhere(false)} onAnnounce={setSheetWord}>
          <WherePrompt
            t={t}
            onAllow={() =>
              setShareLocation(true).then((ok) => {
                if (ok) answerWhere();
                return ok;
              })
            }
            onCity={(c) => {
              if (!c) return;
              setCity(c);
              answerWhere();
            }}
            onLater={() => answerWhere(false)}
          />
        </Sheet>
        <Sheet open={sheet === "menu"} title={t.menu} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <MenuBody
            t={t}
            onNewChat={
              empty
                ? undefined
                : () => {
                    setMessages([]);
                    closeSheet();
                  }
            }
            onBriefing={() => {
              closeSheet();
              void refreshBriefing();
            }}
            open={openSheet}
          />
        </Sheet>
        <Sheet open={sheet === "settings"} title={t.settings} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <SettingsBody
            t={t}
            lang={lang}
            settings={settings}
            busy={busy}
            prefs={prefs}
            setPrefs={setPrefs}
            update={update}
            sample={(v) => {
              voice.unlock();
              void speak(t.voiceSample, lang, v);
            }}
            chooseLang={chooseLang}
            setShareLocation={(on) => void setShareLocation(on)}
          />
        </Sheet>
        <Sheet open={sheet === "connections"} title={t.connections} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <ConnectionsBody t={t} webhooks={settings.webhooks ?? {}} update={update} />
        </Sheet>
        <Sheet open={sheet === "memory"} title={t.memory} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <MemoryBody t={t} lang={lang} device={device} update={update} />
        </Sheet>
      </div>
    </MotionConfig>
  );
}

const iconBtn = "press grid size-12 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink";
