"use client";

import { SignOutButton } from "@clerk/nextjs";
import {
  ArrowUp,
  Bell,
  BookOpen,
  Bus,
  CloudSun,
  Coins,
  Brain,
  Cable,
  LogOut,
  Mic,
  Plus,
  Settings,
  Square,
  Sunrise,
  Trash2,
  TriangleAlert,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionCard, isCard } from "@/components/aspire/ActionCard";
import { BotLinks } from "@/components/aspire/BotLinks";
import { BriefingCard, useDailyBriefing } from "@/components/aspire/BriefingCard";
import { GmailConnect } from "@/components/aspire/GmailConnect";
import { Sheet } from "@/components/aspire/Sheet";
import { VoiceOrb, type VoiceOrbState } from "@/components/ui/voice-orb";
import { applyActions, takeDue, useDevice } from "@/lib/device-store";
import { detectTextLanguage, LANG_NAMES, type Lang } from "@/lib/lang";
import type { Channel, ClientAction, Reminder, Title, VoiceStyle } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { cn } from "@/lib/utils";
import { isAllowedWebhook } from "@/lib/webhooks";

type Phase = "idle" | "listening" | "thinking" | "speaking";
interface Step {
  tool: string;
  icon: string;
  label: string;
  ok: boolean;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  lang: Lang;
  steps?: Step[];
  cards?: ClientAction[];
  sources?: { title: string; url: string }[];
  error?: boolean;
}
type SheetName = "settings" | "connections" | "memory" | null;

// Voice activity detection: stop recording after this much silence.
const SILENCE_MS = 1300;
const MAX_RECORD_MS = 15_000;
const NO_SPEECH_MS = 7000;
const SPEECH_RMS = 0.035;

const PHASE_COLOR: Record<Phase, string> = {
  idle: "text-cyan",
  listening: "text-cyan",
  thinking: "text-violet",
  speaking: "text-amber",
};
const PHASE_GLOW: Record<Phase, string> = {
  idle: "rgb(56 220 255 / 0.18)",
  listening: "rgb(56 220 255 / 0.32)",
  thinking: "rgb(139 124 255 / 0.3)",
  speaking: "rgb(255 181 71 / 0.28)",
};

// Teach, weather, remind, message, bus, money: same order as UI.suggestions.
const SUGGESTION_ICONS = [BookOpen, CloudSun, Bell, Wand2, Bus, Coins];

const uid = () => Math.random().toString(36).slice(2, 10);

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

export default function Assistant() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<Lang>("mn");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [alarm, setAlarm] = useState<Reminder | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const { device, update } = useDevice();
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);
  const reduced = useReducedMotion();

  const level = useRef(0);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const out = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const lastAudio = useRef<{ url: string; text: string } | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const t = UI[lang];
  const settings = device.settings ?? {};
  const webhooks = settings.webhooks ?? {};

  // Session ended while the app is open: a guarded API answering 401 sends the person to sign in
  // again with a short notice instead of a blank error (covers ActionCard's /api/send too).
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original.apply(window, args);
      if (res.status === 401) {
        const input = args[0];
        const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const target = new URL(href, window.location.href);
        if (target.origin === window.location.origin && /^\/api\/(ask|listen|speak|send|briefing)$/.test(target.pathname)) {
          window.location.replace("/login?next=/&expired=1");
        }
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, reduced]);

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
        out.current = { ctx, analyser };
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
      setPhase("idle");
    }
  }, []);

  const speak = useCallback(
    async (text: string, l: Lang, voice?: VoiceStyle) => {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: l, voice: voice ?? deviceRef.current.settings?.voice ?? "jarvis" }),
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

  // ---- morning briefing: first open of the day (Mongolia time) -------------------------
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
    setLastDate: (date) => update((d) => ({ ...d, settings: { ...d.settings, lastBriefingDate: date } })),
    title: device.settings?.title,
    ready,
  });

  // ---- thinking ----------------------------------------------------------------------
  const askBrain = useCallback(
    async (text: string, l: Lang) => {
      setNotice("");
      setLang(l);
      setPhase("thinking");
      const history = messages.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, { id: uid(), role: "user", text, lang: l }]);
      const d = deviceRef.current;
      const hooks = d.settings?.webhooks ?? {};
      const connected: Channel[] = ["sms", "email"];
      if (hooks.discord && isAllowedWebhook("discord", hooks.discord)) connected.push("discord");
      if (hooks.slack && isAllowedWebhook("slack", hooks.slack)) connected.push("slack");
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: l,
          history,
          // Channel URLs stay on the device; only names of connected apps are sent.
          device: {
            memory: d.memory,
            reminders: d.reminders,
            routines: d.routines ?? [],
            lessons: d.lessons ?? [],
            connected,
            settings: { voice: d.settings?.voice, title: d.settings?.title },
          },
        }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as {
        reply?: string;
        error?: string;
        actions?: ClientAction[];
        steps?: Step[];
        sources?: { title: string; url: string }[];
      } | null;
      if (!res?.ok || !data?.reply) {
        const msg = data?.error === "brain_not_configured" ? UI[l].brainOffline : UI[l].error;
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: msg, lang: l, error: true }]);
        setPhase("idle");
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
    [messages, speak, update],
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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setNotice(UI[lang].noMic);
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
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
      if (cancelled || !spoke) {
        setNotice(UI[lang].notHeard);
        setPhase("idle");
        return;
      }
      setPhase("thinking");
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType }), "speech.webm");
      const res = await fetch("/api/listen", { method: "POST", body: form }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { text?: string; lang?: Lang; error?: string } | null;
      if (!res?.ok || !data?.text || !data.lang) {
        setNotice(data?.error === "voice_offline" ? UI[lang].voiceOffline : UI[lang].notHeard);
        setPhase("idle");
        return;
      }
      await askBrain(data.text, data.lang);
    };

    rec.start(250);
    setPhase("listening");
    raf = requestAnimationFrame(tick);
  }, [askBrain, lang]);

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

  // Space on the page = the core (for kiosks and keyboards), unless typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || sheet) return;
      if (e.code === "Space") {
        e.preventDefault();
        document.getElementById("aspire-core")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

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

  const orbState: VoiceOrbState = phase;
  const label = { idle: t.idle, listening: t.listening, thinking: t.thinking, speaking: t.speaking }[phase];
  const empty = messages.length === 0;
  const busy = phase !== "idle";
  const enter = reduced ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <div className="flex min-h-dvh flex-col" lang={lang}>
      {/* ---- top bar ---- */}
      <header className="sticky top-0 z-30 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass mx-auto flex max-w-3xl items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4">
          {empty ? (
            <span aria-hidden className="size-2.5 rounded-full bg-cyan shadow-[0_0_12px_#38dcff]" />
          ) : (
            <button
              onClick={onCore}
              aria-label={`${label} — ${t.tapOrSay}`}
              className={cn("press -my-1 -ml-2 grid size-10 place-items-center rounded-full", PHASE_COLOR[phase])}
            >
              <VoiceOrb state={orbState} level={() => level.current} size={36} label={label} />
            </button>
          )}
          <span className="font-display text-[15px] font-bold tracking-[0.28em]">ASPIRE</span>
          {!empty && (
            <span aria-live="polite" className={cn("hidden text-xs font-medium sm:inline", PHASE_COLOR[phase], phase === "idle" && "sr-only")}>
              {label}
            </span>
          )}
          <span className="ml-1 hidden rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft sm:inline" title="Auto-detected language">
            {LANG_NAMES[lang].native}
          </span>
          <div className="ml-auto flex items-center">
            {!empty && (
              <IconButton label={t.newChat} onClick={() => setMessages([])}>
                <Plus className="size-5" />
              </IconButton>
            )}
            <IconButton label={t.briefing} onClick={() => void refreshBriefing()}>
              <Sunrise className="size-5" />
            </IconButton>
            <IconButton label={t.memory} onClick={() => setSheet("memory")}>
              <Brain className="size-5" />
            </IconButton>
            <IconButton label={t.connections} onClick={() => setSheet("connections")}>
              <Cable className="size-5" />
            </IconButton>
            <IconButton label={t.settings} onClick={() => setSheet("settings")}>
              <Settings className="size-5" />
            </IconButton>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-2 pb-44">
        {/* ---- the core (moves into the top bar once you start talking) ---- */}
        {empty && (
        <section className="flex flex-col items-center pt-[8vh] pb-6">
          <button
            id="aspire-core"
            onClick={onCore}
            aria-label={`${label} — ${t.tapOrSay}`}
            className={cn("press relative grid place-items-center rounded-full", PHASE_COLOR[phase])}
          >
            <span
              aria-hidden
              className="absolute inset-[-18%] rounded-full blur-2xl transition-[background] duration-500"
              style={{ background: `radial-gradient(circle, ${PHASE_GLOW[phase]}, transparent 65%)` }}
            />
            <VoiceOrb state={orbState} level={() => level.current} size={232} label={label} />
            {phase === "listening" && (
              <span className="absolute -bottom-1 grid size-9 place-items-center rounded-full bg-cyan text-[#03202a]">
                <Square className="size-3.5 fill-current" aria-hidden />
              </span>
            )}
          </button>
          <p aria-live="polite" className="mt-3 text-2xl font-semibold tracking-tight">
            {label}
          </p>
          <p className="mt-1 text-center text-ink-soft">{t.tapOrSay}</p>
        </section>
        )}

        {/* ---- suggestions ---- */}
        {empty && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Suggestions">
            {t.suggestions.map((s, i) => {
              const Icon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length];
              return (
              <motion.li
                key={s}
                initial={enter}
                animate={shown}
                transition={{ duration: 0.3, delay: reduced ? 0 : 0.05 * i, ease: [0.23, 1, 0.32, 1] }}
              >
                <button
                  onClick={() => send(s)}
                  disabled={busy}
                  className="press glass flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-white/10"
                >
                  <Icon className="size-5 shrink-0 text-cyan" aria-hidden />
                  <span>{s}</span>
                </button>
              </motion.li>
              );
            })}
          </ul>
        )}

        {briefing && (
          <div className="mt-2">
            <BriefingCard
              text={briefing.text}
              t={t}
              onReplay={() => phase === "idle" && void speak(briefing.text, briefing.lang)}
              gmailError={briefing.gmailError}
              onReconnect={() => setSheet("connections")}
            />
          </div>
        )}

        {/* ---- conversation ---- */}
        <ol className="mt-2 flex flex-col gap-4" aria-live="polite">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.li
                key={m.id}
                initial={enter}
                animate={shown}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}
              >
                {m.role === "user" ? (
                  <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-white/10 px-4 py-2.5 text-[17px]">{m.text}</p>
                ) : (
                  <div className="w-full">
                    <p className={cn("text-[18px] leading-7", m.error && "flex items-center gap-2 text-bad")}>
                      {m.error && <TriangleAlert className="size-5 shrink-0" aria-hidden />}
                      {m.text}
                    </p>
                    {(m.steps?.length || !m.error) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {m.steps?.map((s, i) => (
                          <span
                            key={i}
                            className={cn(
                              "rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft",
                              !s.ok && "line-through opacity-60",
                            )}
                          >
                            {s.label}
                          </span>
                        ))}
                        {!m.error && (
                          <button
                            onClick={() => replay(m)}
                            disabled={busy}
                            aria-label={t.repeat}
                            className="press grid size-9 place-items-center rounded-full text-ink-soft hover:bg-white/10 disabled:opacity-40"
                          >
                            <Volume2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                    {!!m.sources?.length && (
                      <details className="mt-2 text-sm text-ink-soft">
                        <summary className="cursor-pointer select-none">
                          {t.sources} ({m.sources.length})
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {m.sources.map((s) => (
                            <li key={s.url}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">
                                {s.title || new URL(s.url).hostname}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {!!m.cards?.length && (
                      <div className="mt-3 flex flex-col gap-2">
                        {m.cards.filter(isCard).map((c, i) => (
                          <ActionCard key={i} action={c} t={UI[m.lang]} webhooks={webhooks} onOpenConnections={() => setSheet("connections")} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {phase === "thinking" && (
          <p className="mt-4 flex items-center gap-2 text-violet" role="status">
            <span className="size-2 animate-pulse rounded-full bg-violet" aria-hidden /> {t.thinking}
          </p>
        )}
        <div ref={bottom} />
      </main>

      {/* ---- reminder banner ---- */}
      <AnimatePresence>
        {alarm && (
          <motion.div
            role="alert"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass fixed top-20 left-1/2 z-30 flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl border-amber/60 px-4 py-3"
          >
            <Bell className="size-5 shrink-0 text-amber" aria-hidden />
            <p className="flex-1 font-medium">{alarm.text}</p>
            <IconButton label={t.close} onClick={() => setAlarm(null)}>
              <X className="size-5" />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- composer ---- */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/90 to-transparent px-3 pt-6 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          {(notice || !consented) && (
            <p className={cn("mb-2 px-2 text-sm", notice ? "text-amber" : "text-ink-faint")} role={notice ? "alert" : undefined}>
              {notice || t.consent}{" "}
              {!notice && (
                <>
                  <Link href="/privacy" className="underline">
                    {t.privacy}
                  </Link>{" "}
                  ·{" "}
                  <Link href="/terms" className="underline">
                    {t.terms}
                  </Link>
                </>
              )}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="glass flex items-end gap-2 rounded-[28px] bg-[#0d1726]/90 p-2 pl-4 focus-within:border-cyan/60 shadow-[0_10px_40px_rgb(0_0_0/0.45)]"
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 focus-visible:outline-none text-[17px] leading-6 outline-none placeholder:text-ink-faint [field-sizing:content]"
            />
            <button
              type="button"
              onClick={onCore}
              aria-label={phase === "idle" ? t.mic : t.stop}
              className={cn(
                "press grid size-11 shrink-0 place-items-center rounded-full",
                phase === "idle" ? "text-ink hover:bg-white/10" : "bg-white/15 text-cyan",
              )}
            >
              {phase === "idle" ? <Mic className="size-5" /> : <Square className="size-4 fill-current" />}
            </button>
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label={t.send}
              className="press grid size-11 shrink-0 place-items-center rounded-full bg-cyan text-[#03202a] disabled:bg-white/10 disabled:text-ink-faint"
            >
              <ArrowUp className="size-5" />
            </button>
          </form>
        </div>
      </div>

      {/* ---- sheets ---- */}
      <Sheet open={sheet === "settings"} title={t.settings} closeLabel={t.close} onClose={() => setSheet(null)}>
        <Section title={t.voice}>
          <Choices>
            {(["jarvis", "friday"] as const).map((v) => (
              <Choice
                key={v}
                pressed={(settings.voice ?? "jarvis") === v}
                disabled={busy}
                onClick={() => {
                  update((d) => ({ ...d, settings: { ...d.settings, voice: v } }));
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
              <Choice key={v || "none"} pressed={(settings.title ?? "") === v} onClick={() => update((d) => ({ ...d, settings: { ...d.settings, title: v } }))}>
                {v === "mr" ? t.addressMr : v === "mrs" ? t.addressMrs : t.addressNone}
              </Choice>
            ))}
          </Choices>
        </Section>
        <div className="mt-6">
          <SignOutButton redirectUrl="/login">
            <button type="button" className="press flex min-h-12 items-center gap-2 rounded-full border border-line px-5 font-medium text-ink-soft hover:bg-white/10 hover:text-ink">
              <LogOut className="size-5" aria-hidden />
              {t.signOut}
            </button>
          </SignOutButton>
        </div>
        <p className="mt-6 text-sm text-ink-faint">
          <Link href="/privacy" className="underline">
            {t.privacy}
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline">
            {t.terms}
          </Link>
        </p>
      </Sheet>

      <Sheet open={sheet === "connections"} title={t.connections} closeLabel={t.close} onClose={() => setSheet(null)}>
        <p className="text-ink-soft">{t.alwaysOn}</p>
        <WebhookField
          label={t.discordWebhook}
          kind="discord"
          value={webhooks.discord ?? ""}
          t={t}
          onSave={(v) => update((d) => ({ ...d, settings: { ...d.settings, webhooks: { ...d.settings?.webhooks, discord: v || undefined } } }))}
        />
        <WebhookField
          label={t.slackWebhook}
          kind="slack"
          value={webhooks.slack ?? ""}
          t={t}
          onSave={(v) => update((d) => ({ ...d, settings: { ...d.settings, webhooks: { ...d.settings?.webhooks, slack: v || undefined } } }))}
        />
        <p className="mt-2 text-sm text-ink-faint">{t.webhookHelp}</p>
        <Section title="Gmail">
          <GmailConnect t={t} />
        </Section>
        <Section title="Telegram · Discord · Slack">
          <BotLinks t={t} />
        </Section>
      </Sheet>

      <Sheet open={sheet === "memory"} title={t.memory} closeLabel={t.close} onClose={() => setSheet(null)}>
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
                  <b className="font-semibold">
                    {new Date(r.at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    {r.repeatDaily ? " ↻" : ""}
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
                <>
                  <b className="font-semibold">“{r.trigger}”</b> → {r.steps}
                </>
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
                  <b className="font-semibold">{l.topic}</b> · {l.level} · #{l.step} · {l.score}
                </>
              ),
            }))}
            removeLabel={t.remove}
          />
        </Section>
      </Sheet>
    </div>
  );
}

/* ---- small building blocks ---- */

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="press grid size-11 place-items-center rounded-full text-ink-soft hover:bg-white/10 hover:text-ink">
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-cyan uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Choice({ pressed, disabled, onClick, children }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "press min-h-12 rounded-full border px-5 font-medium",
        pressed ? "border-cyan bg-cyan/15 text-ink" : "border-line text-ink-soft hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function List({
  items,
  empty,
  removeLabel,
}: {
  items: { key: string; body: React.ReactNode; remove?: () => void }[];
  empty: string;
  removeLabel: string;
}) {
  if (!items.length) return <p className="text-ink-faint">{empty}</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 px-4 py-2.5">
          <span className="flex-1">{it.body}</span>
          {it.remove && (
            <button onClick={it.remove} aria-label={removeLabel} className="press grid size-11 place-items-center rounded-full text-ink-soft hover:bg-white/10 hover:text-bad">
              <Trash2 className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WebhookField({
  label,
  kind,
  value,
  t,
  onSave,
}: {
  label: string;
  kind: "discord" | "slack";
  value: string;
  t: (typeof UI)["en"];
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  const bad = v.trim() !== "" && !isAllowedWebhook(kind, v.trim());
  return (
    <div className="mt-4">
      <label className="mb-1 block text-sm font-medium" htmlFor={`hook-${kind}`}>
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
          placeholder={kind === "discord" ? "https://discord.com/api/webhooks/…" : "https://hooks.slack.com/services/…"}
          aria-invalid={bad}
          className={cn(
            "min-h-12 flex-1 rounded-xl border bg-black/20 px-3 text-[16px] outline-none focus:border-cyan",
            bad ? "border-bad" : "border-line",
          )}
        />
        <button
          disabled={bad}
          onClick={() => {
            onSave(v.trim());
            setSaved(true);
          }}
          className="press min-h-12 rounded-xl border border-line px-4 font-medium hover:bg-white/10 disabled:opacity-40"
        >
          {saved ? "✓" : t.save}
        </button>
      </div>
      {bad && <p className="mt-1 text-sm text-bad">{t.invalidLink}</p>}
    </div>
  );
}
