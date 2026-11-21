"use client";

// Scene 01, Ask: the voice loop the way the app runs it. The orb listens while the question is
// heard, thinks while a tool runs, speaks while the reply arrives, in the app's own bubble, tool
// line and reply panel (components/aspire/MessageList.tsx). The exchange is example text and says so.
//
// Scroll decides which part is on (askPhase): the question, the tool, the reply. Inside a part the
// text types at its own pace, the way it does in the app, so stopping the scroll never freezes a
// word half written. Every line is laid out at its full size from the start (the part not yet
// shown is invisible, not absent), so typing moves nothing. At rest the whole exchange is there.

import { Bus, Check, LoaderCircle } from "lucide-react";
import { useMotionValueEvent } from "motion/react";
import { useContext, useEffect, useState } from "react";
import { VoiceOrb, voiceOrbWord, type VoiceOrbState } from "@/components/ui/voice-orb";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { storyCopy } from "./copy";
import { askPhase, type AskPhase } from "./math";
import { ModeContext } from "./mode";
import { SceneArrive, SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneProgress } from "./scene";
import { Tag } from "./Tag";

const ORB: Record<AskPhase, VoiceOrbState> = { idle: "idle", ask: "listening", think: "thinking", answer: "speaking", rest: "idle" };

/** Milliseconds per step: the question at a speaking pace, the reply as it streams in. */
const ASK_MS = 34;
const ANSWER_MS = 26;

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
  // "rest" is the finished exchange: what the server renders and what a still page keeps.
  const [phase, setPhase] = useState<AskPhase>("rest");
  useMotionValueEvent(scene.pin, "change", (v) => setPhase(askPhase(v)));

  const orb: VoiceOrbState = mode.live ? ORB[phase] : "idle";
  const voiced = orb === "listening" || orb === "speaking";
  const asked = phase !== "idle";
  const replied = phase === "think" || phase === "answer" || phase === "rest";
  // Chinese says as much in a third of the characters: type it more slowly.
  const pace = lang === "zh" ? 2.4 : 1;

  return (
    <SceneFrame id="ask" scene={scene} tall={[1.9, 2.2]}>
      <SceneBar n={1} label={c.ask.label} scene={scene} />
      <div className="grid min-h-0 flex-1 content-center items-center gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          <SceneTitle id="ask" rows={c.ask.title} scene={scene} />
          <SceneLine scene={scene} className="mt-3 sm:mt-6">
            {c.ask.line}
          </SceneLine>
        </div>

        <SceneArrive scene={scene} className="st-talk">
          <div className="flex items-center gap-4 lg:flex-col lg:gap-3">
            <span className="st-orb">
              <span aria-hidden className="st-orb-glow" />
              <VoiceOrb aria-hidden state={orb} level={voiced ? voiceLevel : undefined} ring size={176} lang={lang} style={{ width: "var(--st-orb)", height: "var(--st-orb)" }} />
            </span>
            <p className="st-status v6-on-photo">{voiceOrbWord(orb, lang)}</p>
          </div>

          <div lang={HTML_LANG[lang]} className="flex min-w-0 flex-col gap-2.5 sm:gap-3">
            <p
              data-on={asked}
              className="st-pop ml-auto max-w-[85%] rounded-lg rounded-br-[6px] border border-line bg-panel-2 px-3.5 py-2.5 text-[1rem] leading-[1.45] text-ink [overflow-wrap:anywhere] sm:px-4 sm:py-3 sm:text-body"
            >
              {phase === "ask" ? <Typed key="q" text={c.ask.q} ms={ASK_MS * pace} step={1} /> : c.ask.q}
            </p>
            <div data-on={replied} className="st-pop panel p-3.5 sm:p-5">
              <p className="mb-2.5 flex min-h-7 items-center gap-2 border-b border-line pb-2.5 text-[0.9375rem] text-ink-muted sm:mb-3 sm:pb-3 sm:text-small">
                <Bus className="size-5 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.ask.step}</span>
                {phase === "think" ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : <Check className="size-4 shrink-0 text-success" aria-hidden />}
              </p>
              <p className="text-[1rem] leading-[1.45] text-ink [overflow-wrap:anywhere] sm:text-reply sm:leading-[1.5]">
                {phase === "answer" ? <Typed key="a" text={c.ask.a} ms={ANSWER_MS * pace} step={2} /> : phase === "think" ? <span className="invisible">{c.ask.a}</span> : c.ask.a}
              </p>
            </div>
            {/* The label belongs to the exchange: it is there whenever any of it is. */}
            <span data-on={asked} className="st-pop self-start">
              <Tag>{c.example}</Tag>
            </span>
          </div>
        </SceneArrive>
      </div>
    </SceneFrame>
  );
}
