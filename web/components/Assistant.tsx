"use client";

// The main screen, v3 "Skylight Halo" (docs/design/aspire-v3-design.md).
// Your city's live sky fills the window; Jarvis is one orb hanging in it, ringed only by real
// data (24h clock, voice, AQI or rain chance). Below sit the greeting and four solid
// instruments (sky, air, road, bus). Once you talk, the orb docks into the top bar and the
// instruments collapse into the ambient bar. Text only ever sits on solid panels.
//
// Behaviour kept from v2: voice capture with silence detection, per-message language
// detection, /api/ask, /api/listen, /api/speak, the 401 guard, the Settings, Connections and
// Memory sheets, Gmail and bot links, the daily briefing, reminders and the alarm banner,
// action and map cards, the location opt-in, sign-out, and the device store with cloud sync.

import { SignOutButton } from "@clerk/nextjs";
import {
  BookOpen,
  Brain,
  Bus,
  Cable,
  Check,
  ChevronRight,
  CloudRain,
  CloudSun,
  Bell,
  Coins,
  Footprints,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Repeat,
  Settings,
  Sunrise,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isCard } from "@/components/aspire/ActionCard";
import { AmbientBar, type AmbientSection } from "@/components/aspire/AmbientBar";
import { BotLinks } from "@/components/aspire/BotLinks";
import { useDailyBriefing } from "@/components/aspire/BriefingCard";
import { Composer, type ComposerPhase } from "@/components/aspire/Composer";
import { EdgeGlow } from "@/components/aspire/EdgeGlow";
import { GmailConnect } from "@/components/aspire/GmailConnect";
import { ForecastMini, LivePanel, type LiveSection } from "@/components/aspire/LivePanel";
import { MessageList, type ChatMessage } from "@/components/aspire/MessageList";
import { OrbHalo } from "@/components/aspire/OrbHalo";
import { Sheet } from "@/components/aspire/Sheet";
import { Sky, stillSkyGradient } from "@/components/aspire/Sky";
import {
  pulseVoiceOrbLightning,
  VOICE_ORB_HALO_RATIO,
  VoiceOrb,
  voiceOrbColorClass,
  voiceOrbWord,
  type VoiceOrbSkyFamily,
  type VoiceOrbState,
  type VoiceOrbTone,
  type VoiceOrbWeather,
} from "@/components/ui/voice-orb";
import { SKY_KINDS, type AqiCategory, type SkyKind } from "@/lib/ambient-types";
import { applyActions, takeDue, useDevice } from "@/lib/device-store";
import { useDisplayPrefs, type TextSize, type UnitsPref } from "@/lib/display-prefs";
import { greeting, notableFrom, notableSentence } from "@/lib/greeting";
import { detectTextLanguage, isLang, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import { buildSuggestions, followUps, type SuggestionKind } from "@/lib/suggestions";
import { sunState } from "@/lib/sun";
import type { Channel, ClientAction, Reminder, Title, VoiceStyle } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { roundedPosition, useAmbient } from "@/lib/use-ambient";
import { cn } from "@/lib/utils";
import { isAllowedWebhook } from "@/lib/webhooks";

type Phase = ComposerPhase;
type Msg = ChatMessage;
type SheetName = "settings" | "connections" | "memory" | "live" | "menu" | null;
type T = (typeof UI)["en"];

// Voice activity detection: stop recording after this much silence.
const SILENCE_MS = 1300;
const MAX_RECORD_MS = 15_000;
const NO_SPEECH_MS = 7000;
const SPEECH_RMS = 0.035;

const SUGGESTION_ICON: Record<SuggestionKind, LucideIcon> = {
  rain: CloudRain,
  air: Leaf,
  bus: Bus,
  briefing: Sunrise,
  reminder: Bell,
  teach: BookOpen,
  currency: Coins,
  weather: CloudSun,
  route: Footprints,
  places: MapPin,
};
/** How long the orb holds its error state after a failure (spec 6.1). */
const ERROR_HOLD_MS = 2400;
/** The status region repeats a notable change in conditions at most this often (spec 13.2). */
const CONDITIONS_EVERY_MS = 10 * 60_000;

const HTML_LANG: Record<Lang, string> = {
  mn: "mn",
  zh: "zh-Hans",
  en: "en",
  ru: "ru",
  de: "de",
};
const LANG_KEY = "aspire-lang";

const AQI_ORDER: readonly AqiCategory[] = ["good", "moderate", "sensitive", "unhealthy", "very_unhealthy", "hazardous"];
const ORB_FAMILY: Record<SkyKind, VoiceOrbSkyFamily> = {
  clear: "clear",
  partly: "clear",
  cloudy: "cloudy",
  fog: "fog",
  drizzle: "rain",
  rain: "rain",
  sleet: "rain",
  hail: "rain",
  storm: "storm",
  snow: "snow",
};
const RAIN_KINDS = new Set<SkyKind>(["drizzle", "rain", "sleet", "hail", "storm"]);

/** Sky window event (components/aspire/Sky.tsx) fired on every storm flash. */
const SKY_LIGHTNING_EVENT = "aspire:sky-lightning";

const uid = () => Math.random().toString(36).slice(2, 10);

/** 24 voice bands (0..1, about 0-4 kHz) from an analyser, for the orb's ring and contours. */
function makeBands(analyser: AnalyserNode): () => Float32Array {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const out = new Float32Array(24);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const top = Math.min(freq.length - 1, Math.max(24, Math.round(4000 / binHz)));
  const span = Math.max(1, Math.floor(top / 24));
  return () => {
    analyser.getByteFrequencyData(freq);
    for (let b = 0; b < 24; b++) {
      let sum = 0;
      for (let i = 0; i < span; i++) sum += freq[1 + b * span + i] ?? 0;
      out[b] = sum / span / 255;
    }
    return out;
  };
}

/** Coarse position (rounded to ~100 m), or undefined if unavailable or refused. Only used when the person opted in. */
function coarsePosition(): Promise<{ lat: number; lng: number } | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(undefined);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: r3(p.coords.latitude), lng: r3(p.coords.longitude) }),
      () => resolve(undefined),
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8000 },
    ),
  );
}

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

/** The saved screen language, else the browser's (mn, zh, en, ru, de), else English. */
function startingLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const wanted = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of wanted) {
    const base = String(tag || "")
      .toLowerCase()
      .split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

/** Demo override: ?sky=rain|snow|storm|fog|drizzle|sleet|hail|cloudy|partly|clear and &night=1. */
function skyOverride(search: string): { kind: SkyKind; night: boolean } | null {
  if (!search) return null;
  const q = new URLSearchParams(search);
  const kind = q.get("sky")?.toLowerCase();
  if (!kind || !(SKY_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as SkyKind, night: q.get("night") === "1" };
}

/** Hour and minutes since midnight at the place (its IANA time zone), else on the device. */
function placeClock(minute: number | null, timeZone: string | null | undefined): { hour: number; minutes: number } | null {
  if (minute == null) return null;
  const at = new Date(minute * 60_000);
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(at);
      const h = Number(parts.find((p) => p.type === "hour")?.value);
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return { hour: h % 24, minutes: (h % 24) * 60 + m };
    } catch {
      /* unknown zone: device clock */
    }
  }
  return { hour: at.getHours(), minutes: at.getHours() * 60 + at.getMinutes() };
}

// ---- tiny external stores (no setState in effects, stable during hydration) ----

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const subscribeMinute = (cb: () => void) => {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
};
/** Minutes since the epoch on the device (null while rendering on the server). */
function useMinute(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

const subscribeNothing = () => () => {};
/** The device's language tags ("de-AT,en"), empty on the server (stable during hydration). */
function useDeviceTags(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => (navigator.languages?.length ? navigator.languages : [navigator.language]).join(","),
    () => "",
  );
}
function useSearch(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => window.location.search,
    () => "",
  );
}

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
function useFirstOpen(): boolean {
  return useSyncExternalStore(subscribeNothing, readFirstOpen, () => true);
}

export default function Assistant() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [alarm, setAlarm] = useState<Reminder | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | undefined>(undefined);
  const { device, update } = useDevice();
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  const [prefs, setPrefs] = useDisplayPrefs();
  const reducedOS = useMedia("(prefers-reduced-motion: reduce)");
  const still = reducedOS || prefs.calm;
  const desktop = useMedia("(min-width: 1024px)");
  const wide = useMedia("(min-width: 1280px)");
  const tablet = useMedia("(min-width: 768px)");
  const short = useMedia("(max-height: 719px)");
  const minute = useMinute();
  const search = useSearch();
  const first = useFirstOpen();
  const deviceTags = useDeviceTags();

  const level = useRef(0);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const out = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    bands: () => Float32Array;
  } | null>(null);
  const bandsRef = useRef<(() => Float32Array) | null>(null);
  const lastAudio = useRef<{ url: string; text: string } | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Orb error state (spec 6.1): held briefly after any failure, then back to idle.
  const [orbError, setOrbError] = useState(false);
  const errorTimer = useRef<number | null>(null);
  const flashError = useCallback(() => {
    setOrbError(true);
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setOrbError(false), ERROR_HOLD_MS);
  }, []);
  // Confirm tone (spec 6.1): how many send-for-me drafts are waiting for the person.
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const onPendingChange = useCallback((pending: boolean) => setPendingDrafts((n) => Math.max(0, n + (pending ? 1 : -1))), []);
  // The sheet's size word, announced through the one status region outside the inert root.
  const [sheetWord, setSheetWord] = useState("");

  const t = UI[lang];
  const settings = device.settings ?? {};
  const webhooks = settings.webhooks ?? {};
  // Spec 13.4: the form of address defaults to "sir" until the person chooses.
  const title: Title = settings.title ?? "mr";
  const units = prefs.units === "auto" ? undefined : prefs.units;

  // ---- screen language: saved, else the browser's; every message can switch it -----------
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage and navigator are browser-only, read after mount
    setLang(startingLang());
    setLangReady(true);
  }, []);
  const chooseLang = useCallback((l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  // Session ended while the app is open: a guarded API answering 401 sends the person to sign in
  // again with a short notice instead of a blank error (covers ActionCard's /api/send too).
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original.apply(window, args);
      if (res.status === 401) {
        const req = args[0];
        const href = typeof req === "string" ? req : req instanceof URL ? req.href : req.url;
        const target = new URL(href, window.location.href);
        if (target.origin === window.location.origin && /^\/api\/(ask|listen|speak|send|briefing|ambient)$/.test(target.pathname)) {
          window.location.replace("/login?next=/&expired=1");
        }
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  // ---- live conditions: weather, air, traffic, stops ------------------------------------
  const { data: ambient, loading: ambientLoading } = useAmbient({
    lang,
    shareLocation: settings.shareLocation === true,
    enabled: langReady,
  });

  // ---- speaking: play the reply and feed its loudness to the orb -----------------------
  const playUrl = useCallback(async (url: string) => {
    const el = audioEl.current ?? (audioEl.current = new Audio());
    if (!out.current) {
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaElementSource(el).connect(analyser);
        analyser.connect(ctx.destination);
        out.current = { ctx, analyser, bands: makeBands(analyser) };
      } catch {
        /* no Web Audio: the orb still speaks, just without levels */
      }
    }
    void out.current?.ctx.resume();
    el.src = url;
    setPhase("speaking");
    let raf = 0;
    const buf = new Float32Array(512);
    const meter = () => {
      if (out.current) level.current = Math.min(1, rms(out.current.analyser, buf) * 5);
      raf = requestAnimationFrame(meter);
    };
    try {
      await el.play();
      bandsRef.current = out.current?.bands ?? null;
      raf = requestAnimationFrame(meter);
      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onpause = () => resolve();
      });
    } catch {
      /* autoplay blocked or bad audio: answer stays on screen */
    } finally {
      cancelAnimationFrame(raf);
      level.current = 0;
      bandsRef.current = null;
      setPhase("idle");
    }
  }, []);

  const speak = useCallback(
    async (text: string, l: Lang, voice?: VoiceStyle) => {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: l,
          voice: voice ?? deviceRef.current.settings?.voice ?? "jarvis",
        }),
      }).catch(() => null);
      if (!res?.ok) {
        setNotice(UI[l].voiceOffline);
        setPhase("idle");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (lastAudio.current) URL.revokeObjectURL(lastAudio.current.url);
      lastAudio.current = { url, text };
      await playUrl(url);
    },
    [playUrl],
  );

  // Leaving the page (e.g. to /privacy): close the audio graph, stop the mic, free the last reply.
  useEffect(
    () => () => {
      stopRecording.current?.();
      const el = audioEl.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      void out.current?.ctx.close().catch(() => {});
      out.current = null;
      if (lastAudio.current) URL.revokeObjectURL(lastAudio.current.url);
      lastAudio.current = null;
      if (errorTimer.current) window.clearTimeout(errorTimer.current);
    },
    [],
  );

  // ---- morning briefing: first open of the day ------------------------------------------
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // useDevice loads stored data in its own (earlier) effect, so state is real from here on.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark stored device data as loaded
    setReady(true);
  }, []);
  const { briefing, refresh: refreshBriefing } = useDailyBriefing({
    lang,
    reminders: device.reminders,
    speak: (text: string, l: Lang) => speak(text, l),
    lastDate: device.settings?.lastBriefingDate,
    setLastDate: (date) =>
      update((d) => ({
        ...d,
        settings: { ...d.settings, lastBriefingDate: date },
      })),
    title,
    ready,
    city: ambient?.place ?? null,
    location: settings.shareLocation === true ? roundedPosition : undefined,
  });

  // ---- thinking ----------------------------------------------------------------------
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
      const location = d.settings?.shareLocation ? await coarsePosition() : undefined;
      let tz: string | undefined;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      } catch {
        tz = undefined;
      }
      const city = ambientRef.current?.place ?? undefined;
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
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          text: data.reply!,
          lang: l,
          steps: data.steps ?? [],
          cards: actions.filter(isCard),
          sources: data.sources ?? [],
        },
      ]);
      await speak(data.reply, l);
    },
    [messages, speak, update, chooseLang, flashError],
  );

  // ---- reminders: checked every 15 s, spoken when due ------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const { due, next } = takeDue(deviceRef.current, new Date());
      if (!due.length) return;
      update(() => next);
      setAlarm(due[0]);
      void speak(due[0].text, detectTextLanguage(due[0].text));
    }, 15_000);
    return () => clearInterval(id);
  }, [speak, update]);

  // ---- listening ------------------------------------------------------------------------
  const listen = useCallback(async () => {
    setNotice("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setNotice(UI[lang].noMic);
      flashError();
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    bandsRef.current = makeBands(analyser);
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const started = performance.now();
    let spoke = false;
    let lastVoice = started;
    let raf = 0;
    let cancelled = false;
    const finish = (cancel = false) => {
      cancelled = cancel;
      if (rec.state !== "inactive") rec.stop();
    };
    stopRecording.current = () => finish(false);

    const tick = () => {
      const r = rms(analyser, buf);
      level.current = Math.min(1, r * 8);
      const now = performance.now();
      if (r > SPEECH_RMS) {
        spoke = true;
        lastVoice = now;
      }
      if ((spoke && now - lastVoice > SILENCE_MS) || now - started > MAX_RECORD_MS) return finish(false);
      if (!spoke && now - started > NO_SPEECH_MS) return finish(true);
      raf = requestAnimationFrame(tick);
    };

    rec.onstop = async () => {
      cancelAnimationFrame(raf);
      stopRecording.current = null;
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
      level.current = 0;
      bandsRef.current = null;
      if (cancelled || !spoke) {
        setNotice(UI[lang].notHeard);
        setPhase("idle");
        return;
      }
      setPhase("thinking");
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType }), "speech.webm");
      const res = await fetch("/api/listen", {
        method: "POST",
        body: form,
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as {
        text?: string;
        lang?: Lang;
        error?: string;
      } | null;
      if (!res?.ok || !data?.text || !data.lang) {
        setNotice(data?.error === "voice_offline" ? UI[lang].voiceOffline : UI[lang].notHeard);
        setPhase("idle");
        flashError();
        return;
      }
      await askBrain(data.text, data.lang);
    };

    rec.start(250);
    setPhase("listening");
    raf = requestAnimationFrame(tick);
  }, [askBrain, lang, flashError]);

  // ---- consent note until first use ------------------------------------------------------
  const [consented, setConsented] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage is read after mount
      setConsented(localStorage.getItem("aspire-consent") === "1" || localStorage.getItem("emee-consent") === "1");
    } catch {
      setConsented(false);
    }
  }, []);
  function acceptConsent() {
    if (consented) return;
    setConsented(true);
    try {
      localStorage.setItem("aspire-consent", "1");
    } catch {
      /* storage unavailable */
    }
  }

  const onCore = () => {
    acceptConsent();
    if (phase === "idle") void listen();
    else if (phase === "listening") stopRecording.current?.();
    else if (phase === "speaking") audioEl.current?.pause();
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || phase !== "idle") return;
    acceptConsent();
    setDraft("");
    void askBrain(q, detectTextLanguage(q));
  };

  const replay = (m: Msg) => {
    if (phase !== "idle") return;
    if (lastAudio.current?.text === m.text) void playUrl(lastAudio.current.url);
    else void speak(m.text, m.lang);
  };

  // ---- sheets: remember the opener ourselves (the app root turns inert while a sheet is open) --
  const openSheet = (name: Exclude<SheetName, null>, section?: LiveSection) => {
    const active = document.activeElement;
    if (sheet === null && active instanceof HTMLElement && active !== document.body) opener.current = active;
    if (name === "live") setLiveSection(section);
    setSheet(name);
  };
  const closeSheet = () => {
    setSheet(null);
    setSheetWord("");
    const back = opener.current;
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus();
    });
  };
  const openLiveRef = useRef(openSheet);
  useEffect(() => {
    openLiveRef.current = openSheet;
  });
  // Stable, so the memoised ambient bar does not re-render on every keystroke.
  const openLive = useCallback((section?: AmbientSection) => openLiveRef.current("live", section), []);
  const openLiveTop = useCallback(() => openLiveRef.current("live"), []);

  // ---- location opt-in (Settings, and "Use my precise location" in the live panel) ------------
  const setShareLocation = async (on: boolean) => {
    // Turning it on asks the browser for permission right away; refused = stays off.
    if (on && !(await coarsePosition())) return;
    update((d) => ({ ...d, settings: { ...d.settings, shareLocation: on } }));
  };

  // Space on the page = the core (for kiosks and keyboards), only when nothing has focus and the
  // page cannot scroll: otherwise Space keeps scrolling the page (including from the thread).
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

  // Storm flashes in the sky give the orb its split jitter (spec 5.4).
  useEffect(() => {
    const onFlash = () => pulseVoiceOrbLightning();
    window.addEventListener(SKY_LIGHTNING_EVENT, onFlash);
    return () => window.removeEventListener(SKY_LIGHTNING_EVENT, onFlash);
  }, []);

  // ---- derived view state ----------------------------------------------------------------
  const empty = messages.length === 0;
  const busy = phase !== "idle";
  const tone: VoiceOrbTone = pendingDrafts > 0 ? "confirm" : "default";
  const orbState: VoiceOrbState = orbError && phase === "idle" ? "error" : phase;
  const word = voiceOrbWord(orbState, lang, tone);
  const wordColor = voiceOrbColorClass(orbState, tone);

  // The core button moves between the halo and the top bar when the screen switches between the
  // empty state and a conversation; focus would fall to <body>. Put it on the core that now exists.
  const wasEmpty = useRef(empty);
  useEffect(() => {
    if (wasEmpty.current === empty) return;
    wasEmpty.current = empty;
    const a = document.activeElement;
    if (a && a !== document.body) return;
    requestAnimationFrame(() => document.getElementById("aspire-core")?.focus());
  }, [empty]);

  // Scroll padding follows the real sticky header (4 columns versus 2 x 2 bar, text size).
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--aspire-header-h", `${Math.ceil(el.getBoundingClientRect().height) + 8}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--aspire-header-h");
    };
  }, []);
  const coreLabel = phase === "idle" ? t.startListening : phase === "listening" ? t.stopListening : phase === "speaking" ? t.stopSpeaking : word;

  const clock = placeClock(minute, ambient?.timeZone);
  const deviceHour = minute == null ? null : new Date(minute * 60_000).getHours();
  const override = useMemo(() => skyOverride(search), [search]);
  // NOAA sun position from a shared position (spec 5.1, 6.3); the hour fallback without one.
  const sunLat = ambient?.coords?.lat;
  const sunLng = ambient?.coords?.lng;
  const sunZone = ambient?.timeZone ?? null;
  const sun = useMemo(
    () => (minute != null && sunLat != null && sunLng != null ? sunState(new Date(minute * 60_000), sunLat, sunLng, sunZone) : null),
    [minute, sunLat, sunLng, sunZone],
  );
  // Without a place time zone or coordinates the server guessed day/night from UTC: use the device clock.
  const ambientDay = ambient && ambient.localHour == null && !ambient.coords ? deviceHour != null && deviceHour >= 5 && deviceHour < 21 : ambient?.sky.isDay;
  const aqiSeverity = ambient?.air ? AQI_ORDER.indexOf(ambient.air.category) + 1 || 1 : 1;
  const sky = override
    ? {
        kind: override.kind,
        intensity: override.kind === "clear" ? 0 : override.kind === "partly" || override.kind === "cloudy" ? 0.5 : 0.85,
        isDay: !override.night,
        windKph: override.kind === "storm" ? 40 : 14,
        localHour: override.night ? 23 : 13,
      }
    : ambient
      ? {
          kind: ambient.sky.kind,
          intensity: ambient.sky.intensity,
          isDay: ambientDay ?? ambient.sky.isDay,
          windKph: ambient.sky.windKph,
          localHour: ambient.localHour ?? clock?.hour ?? null,
        }
      : {
          kind: "clear" as SkyKind,
          intensity: 0,
          isDay: deviceHour != null && deviceHour >= 5 && deviceHour < 21,
          windKph: 0,
          localHour: deviceHour,
        };
  const orbWeather: VoiceOrbWeather = {
    family: ORB_FAMILY[sky.kind],
    windKph: Math.max(0, sky.windKph ?? 0),
    aqiSeverity,
    storm: sky.kind === "storm",
  };
  const today = ambient?.weather?.days?.[0];
  const rainChance = RAIN_KINDS.has(sky.kind)
    ? Math.max(today?.precipChance ?? 0, override ? 90 : Math.round(sky.intensity * 100))
    : today?.precipChance != null && today.precipChance >= 40
      ? today.precipChance
      : null;

  // ?sky= demo override: the greeting and the tiles follow the sky that is shown.
  const shown = useMemo(
    () =>
      override && ambient
        ? {
            ...ambient,
            sky: {
              ...ambient.sky,
              kind: sky.kind,
              intensity: sky.intensity,
              isDay: sky.isDay,
              known: true,
            },
          }
        : ambient,
    [override, ambient, sky.kind, sky.intensity, sky.isDay],
  );
  const placeHour = ambient?.localHour ?? clock?.hour ?? deviceHour;
  const greetingText = useMemo(() => greeting(lang, title, placeHour ?? 12, shown, first), [lang, title, shown, placeHour, first]);

  // Starters from context (spec 10.4), and follow-ups for the latest reply.
  const starters = useMemo(
    () =>
      buildSuggestions({
        ambient: shown,
        hour: placeHour,
        lang,
        tags: deviceTags ? deviceTags.split(",") : [],
      }),
    [shown, placeHour, lang, deviceTags],
  );
  const lastReply = messages.length ? messages[messages.length - 1] : null;
  const lastTool = lastReply?.role === "assistant" && !lastReply.error ? (lastReply.steps?.[0]?.tool ?? null) : null;
  const followUpChips = useMemo(
    () =>
      followUps(lastTool, lang).map((f) => ({
        label: f.label,
        icon: SUGGESTION_ICON[f.kind],
      })),
    [lastTool, lang],
  );

  // Status region: a notable change in conditions, at most once per 10 minutes (spec 13.2).
  const [conditionsNote, setConditionsNote] = useState("");
  const lastNote = useRef<{ at: number; text: string } | null>(null);
  const ambientStamp = ambient?.updatedAt;
  useEffect(() => {
    if (!ambientStamp || !ambientRef.current) return;
    const n = notableFrom(ambientRef.current);
    const text = n ? notableSentence(lang, n) : "";
    const now = Date.now();
    // The first snapshot is already in the greeting; only later changes are announced.
    if (!lastNote.current) {
      lastNote.current = { at: now, text };
      return;
    }
    if (!text || text === lastNote.current.text || now - lastNote.current.at < CONDITIONS_EVERY_MS) return;
    lastNote.current = { at: now, text };
    setConditionsNote(text);
  }, [ambientStamp, lang]);

  const sphere = desktop ? 240 : tablet ? 196 : short ? 152 : 176;
  const box = Math.round(sphere * VOICE_ORB_HALO_RATIO);
  // Reduced motion: no shared-layout move, a 150 ms crossfade instead (spec 11).
  const dock = still ? { duration: 0.15 } : ({ type: "spring", bounce: 0, duration: 0.45 } as const);
  const coreLayout = still
    ? {}
    : {
        layoutId: "aspire-core",
        layout: "position" as const,
        layoutDependency: empty,
      };
  const placeName = ambient?.place ?? null;
  const placeShort = placeName ?? (ambientLoading ? "" : t.locationOff);
  const statusUpper = lang === "zh" ? "" : "uppercase";

  const bar = (variant: "grid" | "bar" | "rail", only?: AmbientSection[]) => (
    <AmbientBar
      data={shown}
      lang={lang}
      loading={ambientLoading}
      onOpen={openLiveTop}
      onOpenSection={openLive}
      units={units}
      showPlace={variant === "rail" && (!only || only.includes("sky"))}
      variant={variant}
      only={only}
    />
  );
  const locationOff = ambient != null && ambient.locatedBy === null;
  // The state word in the top bar during a conversation, phones included (spec 7.2).
  const showWord = !empty && (orbState !== "idle" || tone === "confirm");

  return (
    <MotionConfig reducedMotion={prefs.calm ? "always" : "user"}>
      <div lang={HTML_LANG[lang]}>
        <a href="#aspire-thread" className="skip-link">
          {t.skipToConversation}
        </a>

        {/* ---- the live sky: its own fixed layer, so the body background never covers it ---- */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          {prefs.skyEffects ? (
            <Sky
              kind={sky.kind}
              intensity={sky.intensity}
              isDay={sky.isDay}
              windKph={sky.windKph}
              localHour={sky.localHour}
              calm={prefs.calm}
              density={empty ? 1 : 0.6}
              aqiSeverity={aqiSeverity}
              sunAltDeg={override ? null : (sun?.altDeg ?? null)}
              sunAzDeg={override ? null : (sun?.azDeg ?? null)}
            />
          ) : (
            // Sky effects off: the still gradient of the current weather and phase (never a blue sky in a storm).
            <div
              className="absolute inset-0"
              style={{
                background: stillSkyGradient(sky.kind, sky.isDay, sky.localHour ?? null, override ? null : sun?.altDeg, override ? null : sun?.azDeg),
              }}
            />
          )}
        </div>

        {/* ---- the app (inert while a sheet is open; sheets live outside it) ---- */}
        <div inert={sheet !== null} className="relative z-[1] flex min-h-dvh flex-col">
          <header ref={headerRef} className="sticky top-0 z-30 px-4 pt-[max(8px,env(safe-area-inset-top))] md:px-6 lg:px-8">
            <div className="panel mx-auto flex min-h-14 max-w-[1200px] items-center gap-1 rounded-xl py-1 pr-1 pl-3 sm:gap-2">
              {empty ? (
                <span aria-hidden className="mx-1 size-2.5 shrink-0 rounded-full bg-accent" />
              ) : (
                // Only the position morphs (a scale from the 250px halo would draw a blurry 40px canvas);
                // the docked orb fades in instead.
                <motion.div {...coreLayout} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={dock} className="shrink-0">
                  <button
                    id="aspire-core"
                    type="button"
                    onClick={onCore}
                    aria-label={coreLabel}
                    title={coreLabel}
                    className="press -ml-1 grid size-12 place-items-center rounded-full"
                  >
                    <VoiceOrb
                      state={orbState}
                      tone={tone}
                      level={() => level.current}
                      bands={() => bandsRef.current?.() ?? null}
                      size={40}
                      ring={false}
                      weather={orbWeather}
                      lang={lang}
                      label={word}
                    />
                  </button>
                </motion.div>
              )}
              <span lang="en" className="shrink-0 font-display text-wordmark text-ink">
                ASPIRE
              </span>
              <button
                type="button"
                onClick={() => openLive("sky")}
                aria-label={`${t.live}: ${placeName ?? t.locationOff}`}
                title={placeName ?? t.locationOff}
                className="press ml-1 flex min-h-12 min-w-0 items-center gap-1.5 rounded-full px-3 text-body text-ink-muted hover:bg-panel-3 hover:text-ink"
              >
                <MapPin aria-hidden className="size-5 shrink-0" />
                {/* Phones in conversation: the place chip goes icon-only so the state word fits (spec 7.2). */}
                <span className={cn("max-w-[14ch] truncate", showWord && !tablet && "hidden")}>{placeShort}</span>
              </button>
              {showWord && (
                <span aria-hidden className={cn("min-w-0 shrink truncate text-label font-semibold tracking-[0.08em]", statusUpper, wordColor)}>
                  {word}
                </span>
              )}
              <span aria-hidden className="ml-1 hidden shrink-0 rounded-sm border border-line px-2 font-display text-label text-ink-muted xl:inline">
                {LANG_NAMES[lang].code}
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                {desktop ? (
                  <>
                    {!empty && <BarButton icon={Plus} label={t.newChat} onClick={() => setMessages([])} />}
                    <BarButton icon={Sunrise} label={t.briefing} onClick={() => void refreshBriefing()} />
                    <BarButton icon={Brain} label={t.memory} onClick={() => openSheet("memory")} />
                    <BarButton icon={Cable} label={t.connections} onClick={() => openSheet("connections")} />
                    <BarButton icon={Settings} label={t.settings} onClick={() => openSheet("settings")} />
                  </>
                ) : (
                  <>
                    <IconButton label={t.briefing} onClick={() => void refreshBriefing()}>
                      <Sunrise className="size-6" aria-hidden />
                    </IconButton>
                    <IconButton label={t.menu} onClick={() => openSheet("menu")}>
                      <Menu className="size-6" aria-hidden />
                    </IconButton>
                  </>
                )}
              </div>
            </div>

            {/* conversation, phone and tablet: the four instruments collapse into the ambient bar */}
            {!empty && !desktop && <div className="mx-auto mt-2 max-w-[640px]">{bar("bar")}</div>}
          </header>

          <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:px-8 xl:max-w-[1440px] xl:grid-cols-[300px_minmax(0,720px)_300px] xl:justify-between">
            <main className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col pt-2 pb-48 lg:max-w-[720px] xl:col-start-2 xl:row-start-1">
              {/* The greeting is the h1 of the empty state; in a conversation the page keeps an h1. */}
              {!empty && <h1 className="sr-only">Aspire</h1>}
              {empty && (
                <section aria-labelledby="aspire-greeting" className="flex flex-col items-center pt-[3vh]">
                  {/* ---- the core: orb in its Halo (moves into the top bar once you talk) ---- */}
                  <motion.div {...coreLayout} initial={still ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={dock}>
                    <button
                      id="aspire-core"
                      type="button"
                      onClick={onCore}
                      aria-label={coreLabel}
                      className="press relative grid place-items-center rounded-full"
                      style={{ width: box, height: box }}
                    >
                      {/* A dark lens behind the halo, so its ticks and arcs read on bright day and snow skies. */}
                      <span aria-hidden className="panel pointer-events-none absolute inset-0 rounded-full" />
                      <VoiceOrb
                        state={orbState}
                        tone={tone}
                        level={() => level.current}
                        bands={() => bandsRef.current?.() ?? null}
                        size={sphere}
                        halo
                        weather={orbWeather}
                        lang={lang}
                        label={word}
                      />
                      <OrbHalo
                        box={box}
                        minutes={clock?.minutes ?? null}
                        aqiSeverity={ambient?.air ? aqiSeverity : null}
                        rainChance={rainChance}
                        sunriseMin={sun?.sunriseMin ?? null}
                        sunsetMin={sun?.sunsetMin ?? null}
                        polar={sun?.polar ?? null}
                      />
                    </button>
                  </motion.div>

                  <div className="panel mt-6 w-full rounded-lg px-5 py-4 text-center">
                    <h1 id="aspire-greeting" className="text-greeting text-ink">
                      {minute == null ? " " : greetingText}
                    </h1>
                    {orbState === "idle" && tone === "default" ? (
                      <p className="mt-2 text-body text-ink-muted">{t.tapOrSay}</p>
                    ) : (
                      <p aria-hidden className={cn("mt-2 text-lead font-semibold tracking-[0.08em]", statusUpper, wordColor)}>
                        {word}
                      </p>
                    )}
                    {/* Spec 12: with no location at all, a visible way to turn it on. */}
                    {locationOff && (
                      <button
                        type="button"
                        onClick={() => void setShareLocation(true)}
                        className="press mx-auto mt-3 inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-5 text-body font-medium text-ink hover:bg-panel-3"
                      >
                        <MapPin className="size-5 shrink-0 text-accent" aria-hidden />
                        {t.useLocation}
                      </button>
                    )}
                  </div>

                  {!desktop && <div className="mt-4 w-full">{bar("grid")}</div>}

                  <ul aria-label={t.suggestionsLabel} className="mt-6 flex w-full flex-wrap justify-center gap-2">
                    {starters.map((s, i) => {
                      const Icon = SUGGESTION_ICON[s.kind];
                      return (
                        <motion.li
                          key={s.kind}
                          className={i === 3 ? "hidden lg:block" : undefined}
                          initial={still ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            type: "spring",
                            bounce: 0,
                            duration: 0.35,
                            delay: still ? 0 : 0.05 * i,
                          }}
                        >
                          {/* aria-disabled, not disabled: a natively disabled button drops focus to <body>. */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!busy) send(s.label);
                            }}
                            aria-disabled={busy || undefined}
                            className="press panel-2 flex min-h-14 items-center gap-2 rounded-full border border-line px-5 text-left text-body text-ink hover:bg-panel-3 aria-disabled:cursor-default aria-disabled:opacity-60"
                          >
                            <Icon className="size-5 shrink-0 text-accent" aria-hidden />
                            <span>{s.label}</span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* ---- briefing, conversation, thinking row, reminder banner, reply live region ---- */}
              <MessageList
                className="mt-4"
                messages={messages}
                lang={lang}
                busy={busy}
                thinking={phase === "thinking"}
                webhooks={webhooks}
                onReplay={replay}
                onOpenConnections={() => openSheet("connections")}
                onRetry={(q) => {
                  if (phase === "idle") void askBrain(q.text, q.lang);
                }}
                address={title}
                briefing={
                  briefing
                    ? {
                        text: briefing.text,
                        lang: briefing.lang,
                        gmailError: briefing.gmailError,
                      }
                    : null
                }
                onReplayBriefing={() => {
                  if (briefing && phase === "idle") void speak(briefing.text, briefing.lang);
                }}
                alarm={alarm}
                onDismissAlarm={() => setAlarm(null)}
                reducedMotion={still}
                onPendingChange={onPendingChange}
                followUps={followUpChips}
                onFollowUp={(label) => send(label)}
              />
            </main>

            {/* 1280px and wider (spec 7.5): the sky and the 3-day forecast on the left edge. */}
            {wide && (
              <div className="sticky top-[88px] flex flex-col gap-4 self-start pt-2 xl:col-start-1 xl:row-start-1">
                {bar("rail", ["sky"])}
                <ForecastMini data={shown} lang={lang} units={units} />
              </div>
            )}
            {/* desktop: the telemetry rail (air, road and bus on the right edge from 1280px) */}
            {desktop && (
              <aside aria-label={t.live} className="sticky top-[88px] self-start pt-2 xl:col-start-3 xl:row-start-1">
                {bar("rail", wide ? ["air", "road", "transit"] : undefined)}
              </aside>
            )}
          </div>

          {/* ---- composer ---- */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg/85 via-bg/50 to-transparent px-4 pt-8 md:px-6 lg:px-8">
            <div className="mx-auto max-w-[1200px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 xl:max-w-[1440px] xl:grid-cols-[300px_minmax(0,720px)_300px] xl:justify-between">
              <Composer
                className="pointer-events-auto mx-auto w-full max-w-[640px] pb-[max(8px,env(safe-area-inset-bottom))] lg:max-w-[720px] xl:col-start-2"
                phase={phase}
                draft={draft}
                onDraft={setDraft}
                onSubmit={send}
                onMic={onCore}
                level={() => level.current}
                lang={lang}
                inputRef={input}
                before={
                  notice || !consented ? (
                    <p
                      className={cn("panel mb-2 rounded-md px-4 py-2 text-small", notice ? "text-signal" : "text-ink-muted")}
                      role={notice ? "alert" : undefined}
                    >
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
        </div>

        <EdgeGlow state={orbState} tone={tone} />

        {/* The single status region (spec 13.2), outside the inert root so it also speaks while a sheet
          is open: the state word, the sheet's new size, and a notable change in conditions. */}
        <p role="status" className="sr-only">
          <span>{word}</span> <span>{sheetWord}</span> <span>{conditionsNote}</span>
        </p>

        {/* ---- sheets ---- */}
        <Sheet open={sheet === "menu"} title={t.menu} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <nav aria-label={t.menu} className="flex flex-col gap-2">
            <MenuRow icon={CloudSun} label={t.live} onClick={() => openSheet("live")} />
            {!empty && (
              <MenuRow
                icon={Plus}
                label={t.newChat}
                onClick={() => {
                  setMessages([]);
                  closeSheet();
                }}
              />
            )}
            <MenuRow icon={Brain} label={t.memory} onClick={() => openSheet("memory")} />
            <MenuRow icon={Cable} label={t.connections} onClick={() => openSheet("connections")} />
            <MenuRow icon={Settings} label={t.settings} onClick={() => openSheet("settings")} />
          </nav>
          <Section title={t.display}>
            <h4 className="mb-2 text-body font-medium text-ink">{t.textSize}</h4>
            <TextSizeChoices t={t} value={prefs.textSize} onChange={(v) => setPrefs({ textSize: v })} />
            <div className="mt-4">
              <Toggle label={t.calmMode} help={t.calmHelp} checked={prefs.calm} onLabel={t.on} offLabel={t.off} onChange={(on) => setPrefs({ calm: on })} />
            </div>
          </Section>
        </Sheet>

        <Sheet
          open={sheet === "live"}
          title={placeName ?? t.live}
          closeLabel={t.close}
          onClose={closeSheet}
          onAnnounce={setSheetWord}
          snapPoints={[0.3, 0.6, 0.92]}
          initialSnap={1}
        >
          <LivePanel
            data={ambient}
            lang={lang}
            locationShared={settings.shareLocation === true}
            onShareLocation={() => void setShareLocation(true)}
            onAsk={(prompt) => {
              closeSheet();
              send(prompt);
            }}
            section={liveSection}
            units={units}
          />
        </Sheet>

        <Sheet open={sheet === "settings"} title={t.settings} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <Section title={t.voice}>
            <Choices>
              {(["jarvis", "friday"] as const).map((v) => (
                <Choice
                  key={v}
                  pressed={(settings.voice ?? "jarvis") === v}
                  disabled={busy}
                  onClick={() => {
                    update((d) => ({
                      ...d,
                      settings: { ...d.settings, voice: v },
                    }));
                    void speak(t.voiceSample, lang, v);
                  }}
                >
                  {v === "jarvis" ? t.voiceJarvis : t.voiceFriday}
                </Choice>
              ))}
            </Choices>
          </Section>
          <Section title={t.address}>
            <Choices>
              {(["mr", "mrs", ""] as Title[]).map((v) => (
                <Choice
                  key={v || "none"}
                  pressed={title === v}
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      settings: { ...d.settings, title: v },
                    }))
                  }
                >
                  {v === "mr" ? t.addressMr : v === "mrs" ? t.addressMrs : t.addressNone}
                </Choice>
              ))}
            </Choices>
          </Section>
          <Section title={t.location}>
            <Toggle
              label={t.useLocation}
              icon={MapPin}
              checked={settings.shareLocation === true}
              onLabel={t.on}
              offLabel={t.off}
              onChange={(on) => void setShareLocation(on)}
            />
          </Section>
          <Section title={t.display}>
            <h4 className="mb-2 text-body font-medium text-ink">{t.textSize}</h4>
            <TextSizeChoices t={t} value={prefs.textSize} onChange={(v) => setPrefs({ textSize: v })} />
            <div className="mt-4 flex flex-col gap-3">
              <Toggle
                label={t.skyEffects}
                help={t.skyEffectsHelp}
                checked={prefs.skyEffects}
                onLabel={t.on}
                offLabel={t.off}
                onChange={(on) => setPrefs({ skyEffects: on })}
              />
              <Toggle label={t.calmMode} help={t.calmHelp} checked={prefs.calm} onLabel={t.on} offLabel={t.off} onChange={(on) => setPrefs({ calm: on })} />
            </div>
            <h4 className="mt-4 mb-2 text-body font-medium text-ink">{t.units}</h4>
            <Choices>
              {(
                [
                  ["auto", t.unitsAuto],
                  ["metric", t.unitsMetric],
                  ["imperial", t.unitsImperial],
                ] as [UnitsPref, string][]
              ).map(([v, label]) => (
                <Choice key={v} pressed={prefs.units === v} onClick={() => setPrefs({ units: v })}>
                  {label}
                </Choice>
              ))}
            </Choices>
          </Section>
          <Section title={t.language}>
            <Choices>
              {LANGS.map((l) => (
                <Choice key={l} pressed={lang === l} onClick={() => chooseLang(l)}>
                  <span lang={HTML_LANG[l]}>{LANG_NAMES[l].native}</span>
                </Choice>
              ))}
            </Choices>
          </Section>
          <div className="mt-6">
            <SignOutButton redirectUrl="/login">
              <button
                type="button"
                className="press flex min-h-12 items-center gap-2 rounded-full border border-line px-5 text-body font-medium text-ink-muted hover:bg-panel-3 hover:text-ink"
              >
                <LogOut className="size-5" aria-hidden />
                {t.signOut}
              </button>
            </SignOutButton>
          </div>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 text-small text-ink-muted">
            <Link href="/privacy" className="inline-flex min-h-12 items-center underline">
              {t.privacy}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="inline-flex min-h-12 items-center underline">
              {t.terms}
            </Link>
          </p>
        </Sheet>

        <Sheet open={sheet === "connections"} title={t.connections} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <p className="text-body text-ink-muted">{t.alwaysOn}</p>
          <WebhookField
            label={t.discordWebhook}
            kind="discord"
            value={webhooks.discord ?? ""}
            t={t}
            onSave={(v) =>
              update((d) => ({
                ...d,
                settings: {
                  ...d.settings,
                  webhooks: {
                    ...d.settings?.webhooks,
                    discord: v || undefined,
                  },
                },
              }))
            }
          />
          <WebhookField
            label={t.slackWebhook}
            kind="slack"
            value={webhooks.slack ?? ""}
            t={t}
            onSave={(v) =>
              update((d) => ({
                ...d,
                settings: {
                  ...d.settings,
                  webhooks: { ...d.settings?.webhooks, slack: v || undefined },
                },
              }))
            }
          />
          <p className="mt-2 text-small text-ink-muted">{t.webhookHelp}</p>
          <Section title="Gmail">
            <GmailConnect t={t} />
          </Section>
          <Section title="Telegram · Discord · Slack">
            <BotLinks t={t} />
          </Section>
        </Sheet>

        <Sheet open={sheet === "memory"} title={t.memory} closeLabel={t.close} onClose={closeSheet} onAnnounce={setSheetWord}>
          <Section title={t.memory}>
            <List
              empty={t.nothingSaved}
              items={Object.entries(device.memory).map(([k, v]) => ({
                key: k,
                body: (
                  <>
                    <b className="font-semibold">{k}:</b> {v}
                  </>
                ),
                remove: () => update((d) => applyActions(d, [{ type: "forget", key: k }])),
              }))}
              removeLabel={t.remove}
            />
          </Section>
          <Section title={t.reminders}>
            <List
              empty={t.nothingSaved}
              items={device.reminders.map((r) => ({
                key: r.id,
                body: (
                  <>
                    <b className="inline-flex items-center gap-1.5 font-semibold">
                      {new Date(r.at).toLocaleString(HTML_LANG[lang], {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {r.repeatDaily && (
                        <>
                          <Repeat className="size-4 text-ink-muted" aria-hidden />
                          <span className="sr-only">{t.daily}</span>
                        </>
                      )}
                    </b>{" "}
                    {r.text}
                  </>
                ),
                remove: () => update((d) => applyActions(d, [{ type: "cancel_reminder", id: r.id }])),
              }))}
              removeLabel={t.remove}
            />
          </Section>
          <Section title={t.routines}>
            <List
              empty={t.nothingSaved}
              items={(device.routines ?? []).map((r) => ({
                key: r.id,
                body: (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <b className="font-semibold">“{r.trigger}”</b>
                    <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span>{r.steps}</span>
                  </span>
                ),
                remove: () => update((d) => applyActions(d, [{ type: "delete_routine", id: r.id }])),
              }))}
              removeLabel={t.remove}
            />
          </Section>
          <Section title={t.learning}>
            <List
              empty={t.nothingSaved}
              items={(device.lessons ?? []).map((l) => ({
                key: l.id,
                body: (
                  <>
                    <b className="font-semibold">{l.topic}</b>
                    {", "}
                    {t.lessonLine
                      .replace("{level}", t.lessonLevel[l.level as keyof typeof t.lessonLevel] ?? String(l.level))
                      .replace("{step}", String(l.step))
                      .replace("{score}", String(l.score))}
                  </>
                ),
              }))}
              removeLabel={t.remove}
            />
          </Section>
        </Sheet>
      </div>
    </MotionConfig>
  );
}

/* ---- small building blocks ---- */

function TextSizeChoices({ t, value, onChange }: { t: T; value: TextSize; onChange: (v: TextSize) => void }) {
  return (
    <Choices>
      {(
        [
          ["md", t.textNormal],
          ["lg", t.textLarge],
          ["xl", t.textLargest],
        ] as [TextSize, string][]
      ).map(([v, label]) => (
        <Choice key={v} pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </Choice>
      ))}
    </Choices>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press grid size-12 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Desktop top-bar button: icon plus a visible word (spec 7.4). */
function BarButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex min-h-12 items-center gap-2 rounded-full px-3 text-body text-ink-muted hover:bg-panel-3 hover:text-ink"
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function MenuRow({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press panel-2 flex min-h-14 w-full items-center gap-3 rounded-md border border-line px-4 text-left text-body font-medium text-ink hover:bg-panel-3"
    >
      <Icon className="size-6 shrink-0 text-accent" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 text-label tracking-[0.08em] text-accent uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Choice({ pressed, disabled, onClick, children }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  // aria-disabled, not disabled: choosing a voice starts the sample (busy), and a natively
  // disabled button would blur to <body>, outside the modal.
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        "press inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-body font-medium",
        disabled && "cursor-default opacity-60",
        pressed ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-muted hover:bg-panel-3 hover:text-ink",
      )}
    >
      {pressed && <Check className="size-5 shrink-0 text-accent" aria-hidden />}
      {children}
    </button>
  );
}

/** An on/off switch: icon-free track plus the visible word, so colour is never the only cue. */
function Toggle({
  label,
  help,
  icon: Icon,
  checked,
  onLabel,
  offLabel,
  onChange,
}: {
  label: string;
  help?: string;
  icon?: LucideIcon;
  checked: boolean;
  onLabel: string;
  offLabel: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press panel-2 flex min-h-14 w-full items-center gap-3 rounded-md border border-line px-4 py-2 text-left hover:bg-panel-3"
    >
      {Icon && <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-medium text-ink">{label}</span>
        {help && <span className="text-small text-ink-muted">{help}</span>}
      </span>
      <span aria-hidden className={cn("shrink-0 text-small font-medium", checked ? "text-accent" : "text-ink-muted")}>
        {checked ? onLabel : offLabel}
      </span>
      <span
        aria-hidden
        className={cn("relative h-7 w-12 shrink-0 rounded-full border", checked ? "border-accent bg-accent/30" : "border-line-strong bg-panel-3")}
      >
        <span
          className={cn(
            "absolute top-1/2 left-1 size-5 -translate-y-1/2 rounded-full transition-transform duration-150 still:transition-none",
            checked ? "translate-x-5 bg-accent" : "translate-x-0 bg-ink-muted",
          )}
        />
      </span>
    </button>
  );
}

function List({ items, empty, removeLabel }: { items: { key: string; body: React.ReactNode; remove?: () => void }[]; empty: string; removeLabel: string }) {
  if (!items.length) return <p className="text-body text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel-2">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 px-4 py-2 text-body">
          <span className="min-w-0 flex-1">{it.body}</span>
          {it.remove && (
            <button
              type="button"
              onClick={it.remove}
              aria-label={removeLabel}
              title={removeLabel}
              className="press grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-danger"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WebhookField({ label, kind, value, t, onSave }: { label: string; kind: "discord" | "slack"; value: string; t: T; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  const bad = v.trim() !== "" && !isAllowedWebhook(kind, v.trim());
  return (
    <div className="mt-4">
      <label className="mb-1 block text-body font-medium text-ink" htmlFor={`hook-${kind}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`hook-${kind}`}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            setSaved(false);
          }}
          placeholder={kind === "discord" ? "https://discord.com/api/webhooks/..." : "https://hooks.slack.com/services/..."}
          aria-invalid={bad}
          aria-describedby={bad ? `hook-${kind}-error` : undefined}
          className={cn(
            "min-h-12 min-w-0 flex-1 rounded-md border bg-panel-2 px-3 text-body text-ink placeholder:text-ink-faint focus-visible:border-accent",
            bad ? "border-danger" : "border-line",
          )}
        />
        <button
          type="button"
          disabled={bad}
          onClick={() => {
            onSave(v.trim());
            setSaved(true);
          }}
          className="press inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md border border-line px-4 text-body font-medium text-ink hover:bg-panel-3 disabled:opacity-60"
        >
          {saved ? (
            <>
              <Check className="size-5 text-success" aria-hidden />
              {t.saved}
            </>
          ) : (
            t.save
          )}
        </button>
      </div>
      {bad && (
        <p id={`hook-${kind}-error`} className="mt-1 text-small text-danger">
          {t.invalidLink}
        </p>
      )}
    </div>
  );
}
