"use client";
// The voice loop for the main screen: record with silence detection (mobile-safe: the
// AudioContext is created inside the tap, with an adaptive speech threshold), send to /api/listen,
// speak replies from /api/speak, and expose the live level and spectrum for the orb.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/lang";
import type { VoiceStyle } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { earcon } from "@/lib/earcon";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";
/** How a speak ended: it played, the browser blocked it (no tap yet), or it failed (no voice, bad audio). */
export type SpeakResult = "played" | "blocked" | "failed";

// Voice activity detection: stop recording after this much silence.
const SILENCE_MS = 1300;
/** The mic-open tone plays as recording starts: ignore that long before counting speech. */
const CUE_MS = 200;
const MAX_RECORD_MS = 15_000;
const NO_SPEECH_MS = 7000;
const SPEECH_RMS = 0.035;
/** Points the shared <audio> element at a source (outside the hook: the element is a ref's value). */
function load(el: HTMLAudioElement, src: string): void {
  el.src = src;
}

/** A 0-sample WAV, played once inside the tap to unlock the element on iOS. */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** 24 voice bands (0..1, about 0-4 kHz) from an analyser, for the orb's ring. */
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

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

export interface VoiceHandlers {
  lang: Lang;
  /** The saved voice when a call does not name one. */
  voice: () => VoiceStyle;
  /** A transcript arrived (the language is detected server-side). */
  onHeard: (text: string, lang: Lang) => Promise<void>;
  onNotice: (text: string) => void;
  onError: () => void;
  /** The speech engine that answered (X-Voice-Engine), with the voice used. */
  onEngine?: (engine: string, voice: VoiceStyle, lang: Lang) => void;
}

export function useVoice(handlers: VoiceHandlers) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const level = useRef(0);
  const bands = useRef<(() => Float32Array) | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const out = useRef<{ ctx: AudioContext; analyser: AnalyserNode; bands: () => Float32Array } | null>(null);
  const lastAudio = useRef<{ url: string; text: string } | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const cancelRecording = useRef<(() => void) | null>(null);
  /** The last play was blocked: the next tap on the orb plays it instead of opening the mic. */
  const pendingReplay = useRef(false);

  // ---- speaking ----
  /**
   * Call synchronously at the start of every tap that can lead to speech, before any await: iOS
   * Safari only lets an <audio> element play, and an AudioContext run, when first started inside a
   * gesture. Later plays on the same element and context are then allowed.
   */
  const unlock = useCallback(() => {
    const el = audioEl.current ?? (audioEl.current = new Audio());
    if (!out.current) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
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
    if (!el.src) {
      load(el, SILENT_WAV);
      el.play().catch(() => {});
    }
  }, []);

  /**
   * Plays the reply (on the element unlocked in the tap) and feeds its loudness to the orb.
   * Resolves "played" only when playback actually started (play() resolved).
   */
  const playUrl = useCallback(async (url: string): Promise<SpeakResult> => {
    const el = audioEl.current ?? (audioEl.current = new Audio());
    let result: SpeakResult = "failed";
    void out.current?.ctx.resume();
    load(el, url);
    setPhase("speaking");
    let raf = 0;
    const buf = new Float32Array(512);
    const meter = () => {
      if (out.current) level.current = Math.min(1, rms(out.current.analyser, buf) * 5);
      raf = requestAnimationFrame(meter);
    };
    try {
      await el.play();
      result = "played";
      pendingReplay.current = false;
      bands.current = out.current?.bands ?? null;
      raf = requestAnimationFrame(meter);
      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onpause = () => resolve();
      });
    } catch (e) {
      // Autoplay blocked (no tap yet): say so, since an eyes-free user cannot see the answer. The next
      // tap on the orb plays it (core below).
      if ((e as DOMException | null)?.name === "NotAllowedError") {
        result = "blocked";
        pendingReplay.current = true;
        h.current.onNotice(UI[h.current.lang].tapToHear);
      }
    } finally {
      cancelAnimationFrame(raf);
      level.current = 0;
      bands.current = null;
      setPhase("idle");
    }
    return result;
  }, []);

  /** Speaks `text`; resolves "played" only when the audio actually started playing. */
  const speak = useCallback(
    async (text: string, l: Lang, voice?: VoiceStyle): Promise<SpeakResult> => {
      const v = voice ?? h.current.voice();
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: l, voice: v }),
      }).catch(() => null);
      if (!res?.ok) {
        h.current.onNotice(UI[l].voiceOffline);
        setPhase("idle");
        return "failed";
      }
      const engine = res.headers.get("X-Voice-Engine");
      if (engine) h.current.onEngine?.(engine, v, l);
      const url = URL.createObjectURL(await res.blob());
      if (lastAudio.current) URL.revokeObjectURL(lastAudio.current.url);
      lastAudio.current = { url, text };
      return playUrl(url);
    },
    [playUrl],
  );

  // ---- listening ----
  const listen = useCallback(async () => {
    const t = UI[h.current.lang];
    // Tones on the reply context (unlocked in the tap), so they outlive the mic's own context.
    const cue = (hz: number, times = 1) => earcon(out.current?.ctx, hz, times);
    h.current.onNotice("");
    // Create and resume the AudioContext synchronously inside the tap: phones (iOS Safari above
    // all) start a context made after an await "suspended", so the meter reads pure silence.
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      cue(220, 2);
      h.current.onNotice(t.noMic);
      h.current.onError();
      return;
    }
    const ctx = new AC();
    void ctx.resume();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      void ctx.close();
      cue(220, 2);
      h.current.onNotice(t.noMic);
      h.current.onError();
      return;
    }
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    bands.current = makeBands(analyser);
    let rec: MediaRecorder;
    try {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
      bands.current = null;
      cue(220, 2);
      h.current.onNotice(t.noMic);
      h.current.onError();
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const started = performance.now();
    let spoke = false;
    let lastVoice = started;
    let raf = 0;
    let cancelled = false;
    let aborted = false;
    // Phone mics with auto gain sit far below a fixed threshold: speech = 3x the room's noise floor.
    let floor = 0.004;
    let peak = 0;
    const finish = (cancel = false) => {
      cancelled = cancel;
      if (rec.state !== "inactive") rec.stop();
    };
    // A tap while listening means "I'm done": always send what was recorded.
    stopRecording.current = () => {
      spoke = true;
      finish(false);
    };
    // Escape: drop the recording without sending it.
    cancelRecording.current = () => {
      aborted = true;
      finish(true);
    };

    const tick = () => {
      const r = rms(analyser, buf);
      peak = Math.max(peak, r);
      level.current = Math.min(1, r * 8);
      const now = performance.now();
      if (!spoke) floor = floor * 0.95 + Math.min(r, 0.05) * 0.05;
      if (now - started > CUE_MS && r > Math.max(0.012, Math.min(SPEECH_RMS, floor * 3))) {
        spoke = true;
        lastVoice = now;
      }
      if ((spoke && now - lastVoice > SILENCE_MS) || now - started > MAX_RECORD_MS) return finish(false);
      if (!spoke && now - started > NO_SPEECH_MS) {
        // A meter that never moved is broken (suspended audio), not silence: let the server decide.
        if (peak < 0.0005) spoke = true;
        return finish(!spoke);
      }
      raf = requestAnimationFrame(tick);
    };

    rec.onstop = async () => {
      cancelAnimationFrame(raf);
      stopRecording.current = null;
      cancelRecording.current = null;
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
      level.current = 0;
      bands.current = null;
      if (aborted) {
        cue(440); // the mic closed; nothing sent, nothing to announce
        setPhase("idle");
        return;
      }
      if (cancelled || !spoke) {
        cue(220, 2);
        h.current.onNotice(t.notHeard);
        setPhase("idle");
        return;
      }
      cue(440);
      setPhase("thinking");
      const form = new FormData();
      const type = rec.mimeType || chunks[0]?.type || "audio/webm";
      form.append("audio", new Blob(chunks, { type }), type.includes("mp4") ? "speech.m4a" : "speech.webm");
      form.append("hint", h.current.lang); // the language in use: settles Mongolian vs Russian
      const res = await fetch("/api/listen", { method: "POST", body: form }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { text?: string; lang?: Lang; error?: string } | null;
      if (!res?.ok || !data?.text || !data.lang) {
        cue(220, 2);
        h.current.onNotice(data?.error === "voice_offline" ? t.voiceInputOffline : t.notHeard);
        setPhase("idle");
        h.current.onError();
        return;
      }
      await h.current.onHeard(data.text, data.lang);
    };

    rec.start(250);
    cue(880);
    setPhase("listening");
    raf = requestAnimationFrame(tick);
  }, []);

  /**
   * The mic button: listen when idle (or play a reply the browser blocked), finish recording while
   * listening, stop speaking.
   */
  const core = useCallback(() => {
    if (phase !== "listening") unlock();
    if (phase === "idle" && pendingReplay.current && lastAudio.current) {
      pendingReplay.current = false;
      void playUrl(lastAudio.current.url);
    } else if (phase === "idle") void listen();
    else if (phase === "listening") stopRecording.current?.();
    else if (phase === "speaking") audioEl.current?.pause();
  }, [phase, listen, unlock, playUrl]);

  /** Escape: drop the recording unsent, or stop speaking. */
  const cancel = useCallback(() => {
    if (phase === "listening") cancelRecording.current?.();
    else if (phase === "speaking") audioEl.current?.pause();
  }, [phase]);

  /** Hear a reply again (from memory when it was the last one spoken). */
  const replay = useCallback(
    (text: string, l: Lang) => {
      if (phase !== "idle") return;
      unlock();
      if (lastAudio.current?.text === text) void playUrl(lastAudio.current.url);
      else void speak(text, l);
    },
    [phase, playUrl, speak, unlock],
  );

  // Leaving the page: close the audio graph, stop the mic, free the last reply.
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
    },
    [],
  );

  return { phase, setPhase, level: () => level.current, bands: () => bands.current?.() ?? null, speak, core, cancel, replay, unlock };
}
