"use client";

// The main screen, v6 (docs/design/aspire-v6-spec.md, target docs/design/aspire-v6-reference.webp): the
// top nav; the hero (the city photo with the live weather over it, temperature, hourly strip, "Open city
// map"); four cards (Nearby transit, Live traffic with the live cameras, Air quality, Tomorrow's sunrise);
// the news; and the agent panel on the right (orb, conversation, composer). Phones stack it all, with
// the composer and a tab bar fixed at the bottom, so the agent is one tap away. Every figure carries its
// source and age, unknown is said and never invented, and there is no taxi readout (taxis are map pins).
//
// Live data: /api/ambient every 3 min (lib/use-ambient), /api/city every 60 s (Erdenet traffic cameras,
// parking, fuel), Erdenet's live buses every 30 s; all only while visible. "Live cameras" (and a
// find_cameras answer) opens the camera sheet (/api/cameras) for the place shown.
//
// Behaviour kept from v5: voice capture with silence detection (lib/use-voice.ts), per-message language
// detection, /api/ask, /api/listen, /api/speak, the 401 guard, the Settings, Connections, Memory and
// Where sheets, Gmail, Calendar and bot links, the daily briefing, reminders and the alarm banner, action,
// task and media cards, the live map (a view on desktop, full screen on phones), the news, sign-out, and
// the device store with cloud sync.

import { Bookmark, Fuel, LayoutDashboard, Map as MapIcon, MessageCircle, SquareParking } from "lucide-react";
import { MotionConfig, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isCard } from "@/components/aspire/ActionCard";
import { useDailyBriefing } from "@/components/aspire/BriefingCard";
import { CameraSheet } from "@/components/aspire/CameraSheet";
import { Composer } from "@/components/aspire/Composer";
import { LiveMap, prefetchMap } from "@/components/aspire/LiveMap";
import { MessageList, type ChatMessage } from "@/components/aspire/MessageList";
import { NewsStrip } from "@/components/aspire/NewsStrip";
import { ConnectionsBody, MemoryBody, MenuBody, SettingsBody, WherePrompt } from "@/components/aspire/SettingsSheets";
import { Sheet } from "@/components/aspire/Sheet";
import { skyFamily } from "@/components/aspire/Sky";
import { VoiceOrb, voiceOrbWord, type VoiceOrbState } from "@/components/ui/voice-orb";
import { AgentPanel } from "@/components/v6/AgentPanel";
import { AirCard } from "@/components/v6/AirCard";
import { ageS, PROVIDER, type CardState, type Provenance } from "@/components/v6/Card";
import { CitySheet, cityTabs, stationsSelling, type CityTab } from "@/components/v6/CitySheet";
import { HeroCard, placeClock } from "@/components/v6/HeroCard";
import { SunCard } from "@/components/v6/SunCard";
import { TopNav, type V6View } from "@/components/v6/TopNav";
import { TrafficCard, trafficProvenance } from "@/components/v6/TrafficCard";
import { departuresFromAmbient, OSM_STOPS_PROV, osmStops, TRANSITOUS_SOURCES, transitCredit, TransitCard, type Coverage } from "@/components/v6/TransitCard";
import { fill, textFor } from "@/components/v6/text";
import { AQI_ORDER, SKY_KINDS, type Ambient, type AmbientSky, type SkyKind } from "@/lib/ambient-types";
import { applyActions, takeDue, useDevice } from "@/lib/device-store";
import { isImperial, useDisplayPrefs, useMedia } from "@/lib/display-prefs";
import type { CityData } from "@/lib/erdenet-city";
import { isErdenet } from "@/lib/geo";
import { greeting, notableFrom, notableSentence } from "@/lib/greeting";
import { detectTextLanguage, HTML_LANG, isLang, type Lang } from "@/lib/lang";
import { buildSuggestions } from "@/lib/suggestions";
import type { CameraAction, Channel, ClientAction, Reminder, Title } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { devicePosition, roundedPosition, useAmbient, useCachedPhoto, usePoll } from "@/lib/use-ambient";
import { useVoice } from "@/lib/use-voice";
import { cn } from "@/lib/utils";
import { isAllowedWebhook } from "@/lib/webhooks";

type Msg = ChatMessage;
type SheetName = "settings" | "connections" | "memory" | "menu" | "where" | null;

const ERROR_HOLD_MS = 2400;
const FLASH_MS = 2500;
const CONDITIONS_EVERY_MS = 10 * 60_000;
const CITY_EVERY_MS = 60_000;
/** A place with no city feeds (all null) is asked again only this often. */
const NO_CITY_EVERY_MS = 30 * 60_000;
const BUSES_EVERY_MS = 30_000;
/** An average walk, 80 m a minute: the walk to the stop in "Leave in N min". */
const WALK_M_PER_MIN = 80;
const LANG_KEY = "aspire-lang";
const WHERE_KEY = "aspire-where";
const ENGINE: Record<string, string> = { elevenlabs: "ElevenLabs", azure: "Azure", gemini: "Gemini", omnivoice: "OmniVoice" };
const GUARDED = /^\/api\/(ask|listen|speak|send|briefing|ambient|transit|city|cameras|calendar|news)$/;

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

/** Demo override: ?sky=rain|snow|storm|fog|drizzle|sleet|hail|cloudy|partly|clear and &night=1. */
function skyOverride(search: string): { kind: SkyKind; night: boolean } | null {
  const q = new URLSearchParams(search);
  const kind = q.get("sky")?.toLowerCase();
  return kind && (SKY_KINDS as readonly string[]).includes(kind) ? { kind: kind as SkyKind, night: q.get("night") === "1" } : null;
}

/** Trust boundary for /api/city: an object with the CityData keys (the cards check every URL again). */
function parseCity(x: unknown): CityData | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Partial<CityData>;
  return "traffic" in c && "parking" in c && "fuel" in c && "cameras" in c ? (c as CityData) : null;
}

/** Erdenet's live buses (/api/transit?live=1): vehicles whose position is fresh, and the feed's time. */
function parseBuses(x: unknown): { count: number; at: string } | null {
  const v = x as { vehicles?: unknown; updatedAt?: unknown } | null;
  if (!v || !Array.isArray(v.vehicles) || typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.updatedAt))) return null;
  return { count: v.vehicles.filter((b) => !!b && typeof b === "object" && (b as { stale?: unknown }).stale === false).length, at: v.updatedAt };
}

/** Nearby transit from a snapshot: departures, how they are known, the stop and the walk, and the source line. */
export function transitFrom(a: Ambient, receivedAt: number, now: number | null) {
  const at = a.nextBus?.at ?? new Date(receivedAt).toISOString();
  const departures = departuresFromAmbient(a, at);
  // Credit whoever gave the departures: the stop's own lines, else the next bus (Google stops with no
  // lines and a Transitous bus are Transitous's).
  const fromStop = !!a.stops[0]?.lines?.length && !!a.stopsSource;
  const source = fromStop ? a.stopsSource : (a.nextBus?.source ?? a.stopsSource);
  const anyLive = departures.some((d) => d.kind === "live");
  // Stops with no departure from any source are "stops only" ("No timetable data"), never a timetable
  // that answered with nothing due. The Erdenet feed is live even when nothing is due.
  const coverage: Coverage = anyLive || source === "erdenet-live" ? "live" : departures.length ? "scheduled" : a.stops.length ? "static" : "none";
  // OpenStreetMap stops: names only, credited, and never given minutes.
  const osm = source ? [] : osmStops(a);
  const bare = coverage === "static" ? (osm.length ? osm : a.stops) : [];
  const prov: Provenance | null = osm.length
    ? OSM_STOPS_PROV
    : source
    ? coverage === "static"
      ? { source: transitCredit(source), ageS: null, kind: "static" }
      : {
          source: transitCredit(source),
          ageS: ageS(at, now),
          kind: source === "erdenet-live" ? "estimated" : anyLive ? "live" : "scheduled",
          ...(source === "transitous" ? { href: TRANSITOUS_SOURCES } : {}),
        }
    : null;
  return {
    departures,
    coverage,
    prov,
    // The stop the departures leave from: the stop's own lines, else the one the next bus names (never
    // the nearest stop of another source above a departure that may leave elsewhere).
    stopName: fromStop ? a.stops[0].name : (a.nextBus?.stop ?? null),
    // Distances only from the device's own position: a typed city's coords are its centre, not the person.
    stops: bare.map((s) => ({ name: s.name, distanceM: a.locatedBy === "device" ? s.distanceM : NaN })),
    // The walk only from the device's own position (a typed city is its centre, not the person) to
    // the stop the departures are from; without it the card shows no "Leave in".
    walkMin: fromStop && a.locatedBy === "device" ? a.stops[0].distanceM / WALK_M_PER_MIN : null,
  };
}

// ---- tiny external stores (stable during hydration) ----
const subscribeNothing = () => () => {};
const subscribeTick = (cb: () => void) => {
  const id = window.setInterval(cb, 5_000);
  return () => window.clearInterval(id);
};
/** The clock in 15 s steps (ages and countdowns); null on the server and during hydration. */
const useNow = () => {
  const step = useSyncExternalStore(subscribeTick, () => Math.floor(Date.now() / 15_000), () => null);
  return step == null ? null : step * 15_000;
};
const useDeviceTags = () =>
  useSyncExternalStore(subscribeNothing, () => (navigator.languages?.length ? navigator.languages : [navigator.language]).join(","), () => "");
const useSearch = () => useSyncExternalStore(subscribeNothing, () => window.location.search, () => "");
const useMac = () => useSyncExternalStore(subscribeNothing, () => /Mac|iPhone|iPad/.test(navigator.userAgent), () => false);
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
  const [view, setView] = useState<V6View>("overview");
  const [cityTab, setCityTab] = useState<CityTab | null>(null);
  /** Where the camera sheet is open (the place shown, or a find_cameras answer); null = closed. */
  const [cameraAt, setCameraAt] = useState<{ lat: number; lng: number } | null>(null);
  const [agentWide, setAgentWide] = useState(false);
  const [mapFull, setMapFull] = useState(false);
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
  const now = useNow();
  const minute = now == null ? null : Math.floor(now / 60_000);
  const search = useSearch();
  const first = useFirstOpen();
  const deviceTags = useDeviceTags();
  const mac = useMac();

  const input = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);

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
  const v6 = textFor(lang);
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

  const ambientOn = langReady && whereAsked !== null && (whereAsked || located);
  const {
    data: ambient,
    at: ambientAt,
    reload: reloadAmbient,
  } = useAmbient({ lang, shareLocation: settings.shareLocation === true, city: settings.city ?? null, enabled: ambientOn });

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
      const cards = actions.filter((a) => isCard(a) || a.type === "video" || a.type === "spotify" || a.type === "code" || a.type === "form" || a.type === "open_app" || a.type === "cameras");
      // find_cameras says the panel is open: open it (the reply keeps a button to open it again).
      const cam = actions.find((a): a is CameraAction => a.type === "cameras" && Number.isFinite(a.lat) && Number.isFinite(a.lng));
      if (cam) setCameraAt({ lat: cam.lat, lng: cam.lng });
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
  const rememberOpener = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) opener.current = active;
  };
  const refocus = () => {
    const back = opener.current;
    requestAnimationFrame(() => back?.isConnected && back.focus());
  };
  const openSheet = (name: Exclude<SheetName, null>) => {
    if (sheet === null) rememberOpener();
    setSheet(name);
  };
  const closeSheet = () => {
    setSheet(null);
    setSheetWord("");
    refocus();
  };
  const openCity = (tab: CityTab) => {
    rememberOpener();
    setCityTab(tab);
  };
  const closeCity = () => {
    setCityTab(null);
    refocus();
  };
  const openCameras = (at: { lat: number; lng: number }) => {
    rememberOpener();
    setCameraAt({ lat: at.lat, lng: at.lng });
  };
  const closeCameras = () => {
    setCameraAt(null);
    refocus();
  };
  // A searched city replaces the person's own position until they go back to it (the GPS, asked again).
  const backToMe = () =>
    void setShareLocation(true).then((ok) => {
      if (ok) setCity("");
    });
  // Full screen map (phones): a history entry so Back closes it, the app behind turns inert, and
  // focus returns to whatever opened it.
  const openFullMap = () => {
    rememberOpener();
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
  // A JS "smooth" overrides the global reduced-motion CSS, so the OS setting is checked here too.
  const osReduced = useReducedMotion();
  const smooth = prefs.calm || osReduced ? "auto" : "smooth";
  // Desktop: the City map view; phones: the map full screen.
  const openMap = () => {
    if (desktop) {
      setView("map");
      window.scrollTo({ top: 0, behavior: smooth });
    } else openFullMap();
  };
  const onView = (v: V6View) => {
    if (v === "saved") openSheet("memory");
    else if (v === "map") openMap();
    else setView("overview");
  };
  // Scroll, then move focus to the conversation (not the input: that would raise the keyboard over it).
  const toAgent = () => {
    document.getElementById("aspire-agent")?.scrollIntoView({ block: "start", behavior: smooth });
    document.getElementById("aspire-thread")?.focus({ preventScroll: true });
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
      // The tab bar steps aside while typing (globals.css: [data-kb] .v6-dock-nav).
      document.documentElement.toggleAttribute("data-kb", kb > 0);
    };
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    on();
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      root.removeProperty("--kb");
      root.removeProperty("--kb-pad");
      document.documentElement.removeAttribute("data-kb");
    };
  }, []);

  // Phones: the dock's real height (consent notice, listening row, safe area), so the page and the
  // newest message are never left under it.
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty("--dock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--dock-h");
    };
  }, [desktop]);

  // Keys: Cmd/Ctrl+K searches cities; Space on an unscrollable page with nothing focused is the core.
  const sheetRef = useRef(sheet);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || sheetRef.current) return;
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.getElementById("aspire-search")?.click();
        return;
      }
      if (e.code !== "Space") return;
      if (e.target !== document.body && e.target !== document.documentElement) return;
      const root = document.scrollingElement;
      if (root && root.scrollHeight > window.innerHeight + 1) return;
      e.preventDefault();
      document.getElementById("aspire-core")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Phones: the conversation sits under the cards, so a new message brings it into view.
  const count = messages.length;
  useEffect(() => {
    if (count && !desktop) document.getElementById("aspire-agent")?.scrollIntoView({ block: "end", behavior: prefs.calm ? "auto" : "smooth" });
  }, [count, desktop, prefs.calm]);

  // ---- live feeds ----
  const coords = ambient?.coords ?? null;
  const erdenet = (!!coords && isErdenet(coords.lat, coords.lng)) || ambient?.nextBus?.source === "erdenet-live";
  // About 110 m is plenty to find the city and sort parking and fuel by distance.
  const cityUrl = coords ? `/api/city?lat=${coords.lat.toFixed(3)}&lng=${coords.lng.toFixed(3)}` : null;
  const [cityEvery, setCityEvery] = useState(CITY_EVERY_MS);
  const cityFeed = usePoll(cityUrl, cityEvery, parseCity);
  const city = cityFeed.data;
  const hasCity = !!city && !!(city.traffic || city.parking || city.fuel || city.down?.length);
  // A city with no feeds at all is not asked every minute.
  const wantEvery = city && !hasCity ? NO_CITY_EVERY_MS : CITY_EVERY_MS;
  if (wantEvery !== cityEvery) setCityEvery(wantEvery);
  const buses = usePoll(erdenet ? "/api/transit?live=1" : null, BUSES_EVERY_MS, parseBuses);

  // Phones: fetch the map library while idle, so the first tap on the map shows a map, not a dark box.
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
  const mapStops = erdenet ? [] : (ambient?.stops ?? []).flatMap((s) => (s.lat != null && s.lng != null ? [{ name: s.name, lat: s.lat, lng: s.lng }] : []));
  const orbWeather = {
    family: skyFamily(sky.kind),
    windKph: Math.max(0, sky.windKph ?? 0),
    aqiSeverity: ambient?.air ? AQI_ORDER.indexOf(ambient.air.category) + 1 || 1 : 1,
    storm: sky.kind === "storm",
  };
  const pill = orbState !== "idle" ? word : flash;

  // The city photo: this snapshot's, else the last good one on this device (before the first snapshot, then only for the same place).
  const cached = useCachedPhoto();
  const photo = ambient ? (ambient.photo ?? (cached && cached.place === ambient.place ? cached : null)) : cached;
  // An IP guess is said to be one, and the place picker lets the person fix it.
  const approx = ambient?.locatedBy === "network";
  const place = ambient?.place ? (approx ? `${ambient.place}, ${t.hud.approx}` : ambient.place) : (settings.city ?? null);
  const loading: CardState | undefined = ambient === null && ambientOn ? "loading" : undefined;
  const timeZone = ambient?.timeZone ?? null;

  // Source and age of every figure (each card's source line; the agent's source chips).
  const w = shown?.weather ?? null;
  const weatherProv: Provenance | null = w?.source ? { source: PROVIDER[w.source], ageS: ageS(w.at, now), kind: "estimated" } : null;
  const air = ambient?.air ?? null;
  const airProv: Provenance | null = air?.source ? { source: PROVIDER[air.source], ageS: ageS(air.at, now), kind: "estimated" } : null;
  const transit = ambient && ambientAt != null ? transitFrom(ambient, ambientAt, now) : null;
  const trafficDown = !!city?.down?.includes("traffic") || (erdenet && cityFeed.failed && !city?.traffic);
  // Google's probe route starts at the position: not for an IP guess (Erdenet's cameras are city-wide).
  const google = approx ? null : (ambient?.traffic ?? null);
  const trafficLine = trafficProvenance(city?.traffic, google, google?.at, city?.credit, now);
  const trafficProv = trafficLine?.kind === "none" ? null : trafficLine;
  const sources = (
    [
      [v6.weather, weatherProv],
      [v6.transit, transit?.prov ?? null],
      [v6.traffic, trafficProv],
    ] as const
  ).flatMap(([label, p]) => (p ? [{ ...p, label }] : []));
  const answering = [weatherProv, airProv, transit?.departures.length || ambient?.stops.length ? transit?.prov : null, trafficProv].filter(Boolean).length;
  const clock = now != null ? placeClock(now, timeZone, lang) : null;
  const cityChips = cityTabs(city);
  // The figure on each chip: free spaces (approx., camera vision) and stations with fuel on sale.
  const parkingKnown = (city?.parking?.lots ?? []).filter((l) => l.free != null);
  const chipText = (k: CityTab): string => {
    if (k === "parking") return parkingKnown.length ? `${v6.parking} · ${fill(v6.free, { n: parkingKnown.reduce((n, l) => n + (l.free ?? 0), 0) })} (${v6.approx})` : v6.parking;
    if (!city?.fuel) return v6.fuel;
    const selling = stationsSelling(city.fuel.stations);
    return `${v6.fuel} · ${selling ? fill(v6.fuelSelling, { n: selling }, lang) : v6.fuelUnknown}`;
  };

  // A notable change in conditions is announced at most once per 10 minutes (the first is in the greeting).
  const [conditionsNote, setConditionsNote] = useState("");
  const lastNote = useRef<{ at: number; text: string } | null>(null);
  useEffect(() => {
    if (!ambient) return;
    const n = notableFrom(ambient);
    const text = n ? notableSentence(lang, n) : "";
    const at = Date.now();
    if (!lastNote.current) {
      lastNote.current = { at, text };
      return;
    }
    if (!text || text === lastNote.current.text || at - lastNote.current.at < CONDITIONS_EVERY_MS) return;
    lastNote.current = { at, text };
    setConditionsNote(text);
  }, [ambient, lang]);

  const map = (full: boolean) => (
    <LiveMap
      center={coords}
      lang={lang}
      stops={mapStops}
      taxis={ambient?.taxis ?? []}
      erdenet={erdenet}
      fullscreen={full}
      onClose={full ? closeFullMap : undefined}
      className={full ? undefined : "h-[calc(100dvh-140px)] min-h-[420px] rounded-[var(--radius-xl)]"}
    />
  );

  // Desktop: in the agent panel. Phones: in the dock, whose own padding covers the safe area (pb-0).
  const composer = (className: string) => (
    <Composer
      className={className}
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
          <p className={cn("mb-2 rounded-[var(--radius-sm)] bg-surface-2 px-4 py-2 text-meta", notice ? "text-warn" : "text-ink-muted")} role={notice ? "alert" : undefined}>
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
  );

  // Live traffic as its own band (load, busiest roads, cameras, parking, fuel), then the reference row:
  // Nearby transit, Air quality, Tomorrow's sunrise.
  const cards = (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <TrafficCard
        className="sm:col-span-2 xl:col-span-3"
        lang={lang}
        now={now}
        city={ambient?.place}
        traffic={city?.traffic}
        credit={city?.credit}
        down={trafficDown}
        google={google}
        googleAt={google?.at}
        onCameras={coords ? () => openCameras(coords) : undefined}
        footer={
          cityChips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {cityChips.map((k) => (
                <li key={k} className="min-w-0 max-w-full">
                  <button type="button" onClick={() => openCity(k)} className="press v6-chip min-h-11 max-w-full gap-2 px-3">
                    {k === "parking" ? <SquareParking aria-hidden className="size-4 shrink-0" /> : <Fuel aria-hidden className="size-4 shrink-0" />}
                    <span className="num truncate">{chipText(k)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
        state={loading}
        index={1}
        onRetry={cityFeed.reload}
      />
      <TransitCard
        className="xl:min-h-[240px]"
        lang={lang}
        now={now}
        coverage={transit?.coverage ?? "none"}
        departures={transit?.departures ?? []}
        stopName={transit?.stopName}
        stops={transit?.stops}
        walkMin={transit?.walkMin}
        liveBuses={buses.data}
        city={ambient?.place}
        prov={transit?.prov}
        // No stops or buses "from here" for an IP guess: ask for the place instead.
        state={loading ?? (ambient && (approx || !ambient.locatedBy) ? "denied" : "ready")}
        index={2}
        onRetry={reloadAmbient}
        onViewRoutes={openMap}
      />
      <AirCard className="xl:min-h-[240px]" lang={lang} air={air} pm25={air?.pm25} prov={airProv} state={loading} index={3} onRetry={reloadAmbient} />
      <SunCard
        className="xl:min-h-[240px]"
        lang={lang}
        now={now}
        coords={coords}
        timeZone={timeZone}
        photo={photo}
        autoScene={prefs.skyEffects}
        onAutoScene={(on) => setPrefs({ skyEffects: on })}
        state={loading}
        index={4}
      />
    </div>
  );

  const agent = (
    <AgentPanel
      lang={lang}
      expanded={agentWide}
      onExpand={desktop ? () => setAgentWide((x) => !x) : undefined}
      // Under the nav (16 px padding, 61 px nav, 20 px gap), so the composer is in view on first paint.
      className="lg:sticky lg:top-5 lg:h-[calc(100dvh-117px)]"
      orb={
        <div className="flex flex-col items-center gap-2">
          <button id="aspire-core" type="button" onClick={onCore} aria-label={coreLabel} className="press grid place-items-center rounded-full">
            <VoiceOrb state={orbState} level={voice.level} bands={voice.bands} size={empty ? 96 : 72} weather={orbWeather} lang={lang} label={word} />
          </button>
          <p aria-hidden className={cn("min-h-6 text-meta tracking-[0.12em] text-ink-muted uppercase", !pill && "invisible")}>
            {pill || " "}
          </p>
        </div>
      }
      opener={empty ? <h2 id="aspire-greeting">{minute == null ? " " : greetingText}</h2> : undefined}
      messages={
        <>
          {empty && (
            <>
              <p className="text-copy text-ink-muted">{t.tapOrSay}</p>
              <ul aria-label={t.suggestionsLabel} className="mt-3 flex flex-col gap-2">
                {starters.map((s) => (
                  <li key={s.kind}>
                    <button
                      type="button"
                      onClick={() => !busy && send(s.label)}
                      aria-disabled={busy || undefined}
                      className="press min-h-11 w-full rounded-[var(--radius-md)] bg-surface-2 px-4 py-3 text-left text-copy text-ink aria-disabled:opacity-60"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <MessageList
            className="mt-3"
            messages={messages}
            lang={lang}
            busy={busy}
            thinking={phase === "thinking"}
            webhooks={settings.webhooks ?? {}}
            onReplay={(m) => voice.replay(m.text, m.lang)}
            onOpenConnections={() => openSheet("connections")}
            onCameras={openCameras}
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
        </>
      }
      sources={sources}
      composer={desktop ? composer("pointer-events-auto w-full") : null}
    />
  );

  const covered = sheet !== null || whereOpen || mapFull || cityTab !== null || cameraAt !== null;
  return (
    <MotionConfig reducedMotion={prefs.calm ? "always" : "user"}>
      <div lang={HTML_LANG[lang]} className="min-h-dvh bg-bg">
        <a href="#aspire-thread" className="skip-link">
          {t.skipToConversation}
        </a>

        {/* Under the full-screen map: inert, and on phones not rendered at all (no hidden canvas loops). */}
        <div inert={covered} hidden={mapFull && !desktop} className="mx-auto w-full max-w-[1440px] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-[max(16px,env(safe-area-inset-top))] pb-[calc(var(--dock-h,200px)+16px)] md:px-6 lg:pb-6">
          <TopNav
            lang={lang}
            view={view}
            onView={onView}
            onSearch={() => openSheet("where")}
            onSettings={() => openSheet("menu")}
            onMyLocation={settings.city && settings.shareLocation !== true ? backToMe : undefined}
            mac={mac}
          />

          <div className={cn("mt-5 grid gap-5", agentWide ? "lg:grid-cols-[minmax(0,1fr)_520px]" : "lg:grid-cols-[minmax(0,1fr)_360px]")}>
            <main className="flex min-w-0 flex-col gap-5">
              {view === "map" && desktop ? (
                <section aria-label={v6.cityMap}>{!mapFull && map(false)}</section>
              ) : (
                <>
                  <HeroCard
                    lang={lang}
                    place={place}
                    sky={sky}
                    weather={w}
                    photo={photo}
                    timeZone={timeZone}
                    now={now}
                    coords={coords}
                    imperial={imperial}
                    prov={weatherProv}
                    state={loading}
                    effects={prefs.skyEffects && !mapFull}
                    onOpenMap={openMap}
                    onPlace={() => openSheet("where")}
                  />
                  {cards}
                </>
              )}
              {/* Only once the screen language is known, so the first request is not wasted on the "en" default. */}
              {langReady && <NewsStrip lang={lang} country={erdenet ? "mn" : null} max={desktop ? 5 : 3} />}
            </main>
            {/* Phones: a scroll to the agent's end stops above the dock, so the newest reply shows. */}
            <div id="aspire-agent" className="min-w-0 scroll-mt-4 scroll-mb-[calc(var(--dock-h,220px)+8px)] lg:scroll-mb-0">
              {agent}
            </div>
          </div>

          <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-meta text-ink-faint">
            {ambient && (
              <span>
                <span aria-hidden className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", answering ? "bg-live" : "bg-warn")} />
                {fill(t.hud.status, { n: answering, m: 4 })}
              </span>
            )}
            {ambient?.address && <span className="min-w-0 truncate">{ambient.address}</span>}
            {timeZone && (
              <span className="num">
                {timeZone}
                {clock?.zone && ` · ${clock.zone}`}
              </span>
            )}
          </footer>
        </div>

        {/* ---- phones: the composer and the tab bar, above the on-screen keyboard (--kb) ---- */}
        {!desktop && (
          <div
            ref={dock}
            inert={covered}
            hidden={mapFull}
            className="pointer-events-none fixed inset-x-0 z-20 bg-gradient-to-t from-bg via-bg/90 to-transparent pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-6"
            style={{ bottom: "var(--kb, 0px)", paddingBottom: "var(--kb-pad, max(8px, env(safe-area-inset-bottom)))" }}
          >
            {composer("pointer-events-auto w-full pb-0")}
            <nav aria-label={v6.tabBar} className="v6-dock-nav pointer-events-auto mt-2 grid grid-cols-4 gap-1">
              {(
                [
                  ["overview", v6.overview, LayoutDashboard, () => window.scrollTo({ top: 0, behavior: smooth })],
                  ["map", v6.tabMap, MapIcon, openFullMap],
                  ["saved", v6.tabSaved, Bookmark, () => openSheet("memory")],
                  ["agent", t.hud.agent, MessageCircle, toAgent],
                ] as const
              ).map(([id, label, Icon, onClick]) => (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  onPointerDown={id === "map" ? () => void prefetchMap() : undefined}
                  className="press flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] text-meta text-ink-muted hover:text-ink"
                >
                  <Icon aria-hidden className="size-5" />
                  <span className="max-w-full truncate">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {mapFull && map(true)}

        {/* The single status region, outside the inert root so it also speaks while a sheet is open. */}
        <p role="status" className="sr-only">
          <span>{pill}</span> <span>{sheetWord}</span> <span>{conditionsNote}</span>
        </p>

        {cameraAt && <CameraSheet lat={cameraAt.lat} lng={cameraAt.lng} lang={lang} onClose={closeCameras} />}
        <CitySheet open={cityTab !== null} onClose={closeCity} lang={lang} city={city} cityName={ambient?.place} now={now} tab={cityTab ?? undefined} />
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
        <Sheet open={sheet === "where"} title={v6.search} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <WherePrompt
            t={t}
            onAllow={() =>
              setShareLocation(true).then((ok) => {
                if (ok) closeSheet();
                return ok;
              })
            }
            onCity={(c) => {
              if (!c) return;
              // A city picked here is the place the person wants to see: it takes over from the GPS.
              update((d) => ({ ...d, settings: { ...d.settings, city: c, shareLocation: false } }));
              answerWhere();
              closeSheet();
            }}
            onLater={closeSheet}
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
