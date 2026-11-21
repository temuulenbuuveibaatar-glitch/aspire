"use client";

// Scene 001, Ask: the voice loop the way the app runs it. The orb sits at the centre of a gauge;
// it listens while the question is heard, thinks while a tool runs and speaks while the reply
// arrives. The exchange is example text and says so.
//
// Two things move it. Scrolling decides which part is on (askPhase): the question, the tool, the
// reply. And the button plays it from the start with the recorded answer (public/landing/audio):
// the question types, the tool line runs, then the reply is spoken while it is written, at the
// pace of the voice. Sound never starts by itself, and a clip that is missing or refused is just
// silence: the exchange runs all the same.
//
// Inside a part the text types at its own pace, so stopping the scroll never freezes a word half
// written. Every line is laid out at its full size from the start (the part not yet shown is
// invisible, not absent), so typing moves nothing. At rest the whole exchange is there.

import { Bus, Check, LoaderCircle, Play, Square } from "lucide-react";
import { useMotionValueEvent } from "motion/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { VoiceOrb, voiceOrbWord, type VoiceOrbState } from "@/components/ui/voice-orb";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { storyCopy } from "./copy";
import { GaugeRing } from "./Gauge";
import { askPhase, type AskPhase } from "./math";
import { ModeContext } from "./mode";
import { SceneArrive, SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneProgress } from "./scene";
import { clipSrc, useClip } from "./sound";
import { Tag } from "./Tag";

const ORB: Record<AskPhase, VoiceOrbState> = { idle: "idle", ask: "listening", think: "thinking", answer: "speaking", rest: "idle" };

/** Milliseconds per step: the question at a speaking pace, the reply as it streams in. */
const ASK_MS = 34;
const ANSWER_MS = 26;
/** How many characters the reply gains per step. */
const ANSWER_STEP = 2;
/** A played exchange: the pause after the question, and how long the tool line runs. */
const AFTER_ASK_MS = 260;
const THINK_MS = 720;
/** The reply stays "speaking" this long after its last word when there is no voice to wait for. */
const AFTER_ANSWER_MS = 500;
/** A voice that never reports its end is not waited for longer than this. */
const LONGEST_MS = 40_000;

/** A voice-like level for the orb's ring: this is a picture of the app, no microphone is open. */
function voiceLevel(): number {
  const t = performance.now() / 1000;
  const v = 0.3 + 0.34 * Math.sin(t * 9.1) * Math.sin(t * 2.3 + 1) + 0.2 * Math.sin(t * 17.3 + 0.4);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Text that appears a few characters at a time inside a box already sized for all of it. Screen readers get the whole line. */
function Typed({ text, ms, step }: { text: string; ms: number; step: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= text.length) return;
    const id = window.setTimeout(() => setShown((n) => n + step), ms);
    return () => window.clearTimeout(id);
  }, [shown, text, ms, step]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </>
  );
}

export function SceneAsk({ lang }: { lang: Lang }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  const clip = useClip();
  // Chinese says as much in a third of the characters: type it more slowly.
  const pace = lang === "zh" ? 2.4 : 1;

  // What the scroll position says. "rest" is the finished exchange: what the server renders and
  // what a still page keeps.
  const [scrolled, setScrolled] = useState<AskPhase>("rest");
  // What a press of the button says: it overrides the scroll until the page is scrolled on.
  const [played, setPlayed] = useState<AskPhase | null>(null);
  // Milliseconds per step for the reply being played: the voice's own pace once its length is known.
  const [replyMs, setReplyMs] = useState(ANSWER_MS * pace);
  const timers = useRef<number[]>([]);
  const at = useRef<{ scrolled: AskPhase; played: AskPhase | null }>({ scrolled: "rest", played: null });

  const setRun = useCallback((next: AskPhase | null) => {
    at.current.played = next;
    setPlayed(next);
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  useMotionValueEvent(scene.pin, "change", (v) => {
    const next = askPhase(v);
    if (next === at.current.scrolled) return;
    at.current.scrolled = next;
    setScrolled(next);
    // A finished run hands the scene back to the scroll as soon as the scroll has something new to say.
    if (at.current.played === "rest") setRun(null);
  });
  useEffect(() => clearTimers, [clearTimers]);

  const running = played !== null && played !== "rest";
  const phase: AskPhase = played ?? (mode.live ? scrolled : "rest");

  const finish = useCallback(() => {
    clearTimers();
    if (at.current.played !== null) setRun("rest");
  }, [clearTimers, setRun]);

  const stop = () => {
    clip.stop();
    finish();
  };

  const play = () => {
    clearTimers();
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const steps = Math.ceil(c.ask.a.length / ANSWER_STEP);
    const typingMs = steps * ANSWER_MS * pace;
    // Told once, when the voice has finished, was stopped, or could not sound at all.
    let silent = false;
    const src = clipSrc("answer", lang);
    const onEnd = (heard: boolean) => {
      if (heard) finish();
      else silent = true;
    };
    const say = (voice: { start: () => void; seconds: () => number | null }) => {
      const seconds = silent ? null : voice.seconds();
      setReplyMs(seconds ? Math.max(12, Math.min(140, (seconds * 1000) / steps)) : ANSWER_MS * pace);
      setRun("answer");
      voice.start();
      // A voice ends the run itself when it has finished (onEnd). Without one the last word does:
      // once the words have had their time, a voice that is not sounding is no longer waited for.
      later(() => {
        if (silent || !clip.heard()) finish();
      }, Math.max(typingMs, (seconds ?? 0) * 1000) + AFTER_ANSWER_MS);
      later(finish, LONGEST_MS);
    };
    if (!mode.moving) {
      // Nothing may move: the exchange is already there in full, so the voice starts at once.
      say(clip.play(src, onEnd));
      return;
    }
    // Readied inside this press, so the browser lets it sound when its turn comes.
    const voice = clip.ready(src, onEnd);
    const askMs = c.ask.q.length * ASK_MS * pace + AFTER_ASK_MS;
    setRun("ask");
    later(() => setRun("think"), askMs);
    later(() => say(voice), askMs + THINK_MS);
  };

  const orb: VoiceOrbState = mode.live || played !== null ? ORB[phase] : "idle";
  const voiced = orb === "listening" || orb === "speaking";
  const asked = phase !== "idle";
  const replied = phase === "think" || phase === "answer" || phase === "rest";
  const typing = mode.moving;

  return (
    <SceneFrame id="ask" scene={scene} tall={[1.9, 2.2]}>
      <SceneBar n={1} label={c.ask.label} scene={scene} />
      <div className="st-head">
        <SceneTitle id="ask" rows={c.ask.title} scene={scene} />
        <SceneLine scene={scene}>{c.ask.line}</SceneLine>
      </div>

      <SceneArrive scene={scene} className="st-talk">
        <div className="st-talk-core">
          <span className="st-gauge st-orb">
            <GaugeRing />
            <span aria-hidden className="st-orb-glow" />
            <VoiceOrb aria-hidden state={orb} level={voiced ? voiceLevel : undefined} ring size={176} lang={lang} style={{ width: "var(--st-orb)", height: "var(--st-orb)" }} />
          </span>
          <div className="st-talk-ctl">
            <p className="st-status readout v6-on-photo">{voiceOrbWord(orb, lang)}</p>
            {/* Only where a press can do something: a page without script has no dead button. */}
            {mode.ready && (
              <button type="button" className="st-btn press readout" onClick={running ? stop : play}>
                {running ? <Square aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />}
                {running ? c.ask.stop : c.ask.play}
              </button>
            )}
          </div>
        </div>

        <p lang={HTML_LANG[lang]} data-on={asked} className="st-pop st-box st-talk-q">
          {typing && phase === "ask" ? <Typed key="q" text={c.ask.q} ms={ASK_MS * pace} step={1} /> : c.ask.q}
        </p>

        <div lang={HTML_LANG[lang]} className="st-talk-a">
          <div data-on={replied} className="st-pop st-box">
            <p className="st-talk-step readout">
              <Bus className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.ask.step}</span>
              {phase === "think" ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : <Check className="size-4 shrink-0 text-accent" aria-hidden />}
            </p>
            <p className="st-talk-reply">
              {typing && phase === "answer" ? (
                <Typed key="a" text={c.ask.a} ms={played ? replyMs : ANSWER_MS * pace} step={ANSWER_STEP} />
              ) : phase === "think" ? (
                <span className="invisible">{c.ask.a}</span>
              ) : (
                c.ask.a
              )}
            </p>
          </div>
          {/* The label belongs to the exchange: it is there whenever any of it is. */}
          <span data-on={asked} className="st-pop self-start">
            <Tag>{c.example}</Tag>
          </span>
        </div>
      </SceneArrive>
    </SceneFrame>
  );
}
