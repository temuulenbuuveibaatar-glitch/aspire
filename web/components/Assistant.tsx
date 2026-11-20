"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyActions, takeDue, useDevice } from "@/lib/device-store";
import { detectTextLanguage, LANG_NAMES, type Lang } from "@/lib/lang";
import type { ClientAction, Reminder } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";

type Phase = "idle" | "listening" | "thinking" | "speaking";
interface Turn {
  role: "user" | "assistant";
  text: string;
}
interface Step {
  tool: string;
  icon: string;
  label: string;
  ok: boolean;
}
type CallAction = Extract<ClientAction, { type: "call" }>;

// Voice activity detection: stop recording after this much silence.
const SILENCE_MS = 1300;
const MAX_RECORD_MS = 15_000;
const NO_SPEECH_MS = 7000;
const SPEECH_RMS = 0.035;

export default function Assistant() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<Lang>("mn");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [consented, setConsented] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [callAction, setCallAction] = useState<CallAction | null>(null);
  const [alarm, setAlarm] = useState<Reminder | null>(null);
  const [panel, setPanel] = useState(false);
  const { device, update } = useDevice();
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  const history = useRef<Turn[]>([]);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const lastAudioUrl = useRef<string | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const orb = useRef<HTMLButtonElement>(null);

  const t = UI[lang];

  // Show the privacy note until the person uses the assistant once.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      setConsented(localStorage.getItem("emee-consent") === "1");
    } catch {
      setConsented(false);
    }
  }, []);
  const acceptConsent = () => {
    setConsented(true);
    try {
      localStorage.setItem("emee-consent", "1");
    } catch {
      /* storage unavailable: show the note again next visit */
    }
  };

  const setLevel = (v: number) => orb.current?.style.setProperty("--level", v.toFixed(3));

  // ---- speaking -------------------------------------------------------------
  const playUrl = useCallback(async (url: string) => {
    const el = audioEl.current ?? (audioEl.current = new Audio());
    el.src = url;
    setPhase("speaking");
    try {
      await el.play();
      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onpause = () => resolve();
      });
    } finally {
      setPhase("idle");
    }
  }, []);

  const speak = useCallback(
    async (text: string, l: Lang) => {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: l }),
      }).catch(() => null);
      if (!res?.ok) {
        setNotice(UI[l].voiceOffline);
        setPhase("idle");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (lastAudioUrl.current) URL.revokeObjectURL(lastAudioUrl.current);
      lastAudioUrl.current = url;
      await playUrl(url);
    },
    [playUrl],
  );

  // ---- thinking -------------------------------------------------------------
  const askBrain = useCallback(
    async (text: string, l: Lang) => {
      setHeard(text);
      setReply("");
      setNotice("");
      setSteps([]);
      setCallAction(null);
      setLang(l);
      setPhase("thinking");
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: l, history: history.current, device: deviceRef.current }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as {
        reply?: string;
        error?: string;
        actions?: ClientAction[];
        steps?: Step[];
      } | null;
      if (!res?.ok || !data?.reply) {
        setNotice(data?.error === "brain_not_configured" ? UI[l].brainOffline : UI[l].error);
        setPhase("idle");
        return;
      }
      history.current = [...history.current, { role: "user" as const, text }, { role: "assistant" as const, text: data.reply }].slice(-12);
      setReply(data.reply);
      setSteps(data.steps ?? []);
      const actions = data.actions ?? [];
      if (actions.length) update((d) => applyActions(d, actions));
      setCallAction(actions.filter((a): a is CallAction => a.type === "call").at(-1) ?? null);
      if (lastAudioUrl.current) URL.revokeObjectURL(lastAudioUrl.current);
      lastAudioUrl.current = null;
      await speak(data.reply, l);
    },
    [speak, update],
  );

  // ---- reminders: checked every 15 s, spoken out loud when due ---------------
  useEffect(() => {
    const tick = () => {
      const { due, next } = takeDue(deviceRef.current, new Date());
      if (!due.length) return;
      update(() => next);
      const r = due[0];
      setAlarm(r);
      void speak(r.text, detectTextLanguage(r.text));
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [speak, update]);

  // ---- listening ------------------------------------------------------------
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
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
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
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > SPEECH_RMS) {
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
      setLevel(0);
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
        setTyping(data?.error === "voice_offline");
        setPhase("idle");
        return;
      }
      await askBrain(data.text, data.lang);
    };

    rec.start(250);
    setPhase("listening");
    raf = requestAnimationFrame(tick);
  }, [askBrain, lang]);

  const onOrb = () => {
    if (!consented) acceptConsent();
    if (phase === "idle") void listen();
    else if (phase === "listening") stopRecording.current?.();
    else if (phase === "speaking") audioEl.current?.pause();
  };

  const onRepeat = () => {
    if (phase !== "idle" || !reply) return;
    if (lastAudioUrl.current) void playUrl(lastAudioUrl.current);
    else void speak(reply, lang);
  };

  const onSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || phase !== "idle") return;
    setDraft("");
    if (!consented) acceptConsent();
    void askBrain(text, detectTextLanguage(text));
  };

  // Space / Enter on the page = the big button (for kiosks and keyboards).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        orb.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typing]);

  const label = { idle: t.idle, listening: t.listening, thinking: t.thinking, speaking: t.speaking }[phase];

  return (
    <main className="shell" lang={lang}>
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>ЭМЭЭ ТОВЧ</span>
        </div>
        <div className="lang-badge" title="Auto-detected language">
          <span aria-hidden>{LANG_NAMES[lang].flag}</span> {LANG_NAMES[lang].native}
        </div>
      </header>

      <section className="stage">
        <button
          ref={orb}
          className={`orb orb--${phase}`}
          onClick={onOrb}
          aria-label={label}
          disabled={phase === "thinking"}
        >
          <span className="ring ring-1" />
          <span className="ring ring-2" />
          <span className="ring ring-3" />
          <span className="core">
            <svg viewBox="0 0 24 24" aria-hidden className="mic">
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
            </svg>
          </span>
        </button>
        <p className="phase-label" aria-live="polite">
          {label}
        </p>
      </section>

      <section className="talk" aria-live="polite">
        {heard && (
          <p className="heard">
            <span className="who">{t.you}:</span> {heard}
          </p>
        )}
        {reply && <p className="reply">{reply}</p>}
        {steps.length > 0 && (
          <ul className="steps" aria-label="Tools used">
            {steps.map((s, i) => (
              <li key={i} className={s.ok ? "" : "step-failed"}>
                <span aria-hidden>{s.icon}</span> {s.label}
              </li>
            ))}
          </ul>
        )}
        {callAction && (
          <a className="call-button" href={`tel:${callAction.number}`}>
            <span aria-hidden>📞</span> {t.call}: {callAction.label}
          </a>
        )}
        {notice && <p className="notice">{notice}</p>}
      </section>

      {alarm && (
        <div className="alarm" role="alert">
          <p>
            <span aria-hidden>⏰</span> {alarm.text}
          </p>
          <button className="pill" onClick={() => setAlarm(null)}>
            {t.close}
          </button>
        </div>
      )}

      <footer className="controls">
        <button className="pill" onClick={onRepeat} disabled={!reply || phase !== "idle"}>
          <span aria-hidden>↻</span> {t.repeat}
        </button>
        <button className="pill" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>
          <span aria-hidden>⌨</span> {t.type}
        </button>
        <button className="pill" onClick={() => setPanel((v) => !v)} aria-expanded={panel}>
          <span aria-hidden>🧠</span> {t.memory}
        </button>
      </footer>

      {panel && (
        <section className="panel" aria-label={t.memory}>
          <h2>
            <span aria-hidden>🧠</span> {t.memory}
          </h2>
          {Object.keys(device.memory).length === 0 && <p className="muted">{t.nothingSaved}</p>}
          <ul>
            {Object.entries(device.memory).map(([k, v]) => (
              <li key={k}>
                <span>
                  <b>{k}:</b> {v}
                </span>
                <button className="pill pill--small" onClick={() => update((d) => applyActions(d, [{ type: "forget", key: k }]))}>
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
          <h2>
            <span aria-hidden>⏰</span> {t.reminders}
          </h2>
          {device.reminders.length === 0 && <p className="muted">{t.nothingSaved}</p>}
          <ul>
            {device.reminders.map((r) => (
              <li key={r.id}>
                <span>
                  <b>
                    {new Date(r.at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    {r.repeatDaily ? " ↻" : ""}
                  </b>{" "}
                  {r.text}
                </span>
                <button
                  className="pill pill--small"
                  onClick={() => update((d) => applyActions(d, [{ type: "cancel_reminder", id: r.id }]))}
                >
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!consented && <p className="consent">{t.consent}</p>}

      <nav className="legal-links">
        <Link href="/privacy">{t.privacy}</Link>
        <span aria-hidden>·</span>
        <Link href="/terms">{t.terms}</Link>
      </nav>

      {typing && (
        <form className="typebox" onSubmit={onSend}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
          />
          <button type="submit" className="pill pill--primary" disabled={!draft.trim() || phase !== "idle"}>
            {t.send}
          </button>
        </form>
      )}
    </main>
  );
}
