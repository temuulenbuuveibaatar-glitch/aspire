"use client";

// Scene 004, Five languages: one question, asked in Mongolian, Chinese, English, Russian and
// German. While the stage is pinned the five lines share one place and trade it with a blur
// crossfade as you scroll, each in its own script and marked with its own language.
//
// The five codes are buttons. A press scrolls the page to that language and plays the question as
// it is spoken there (public/landing/audio; a missing clip is silence, never an error). Without
// motion the same five lines are a list, and each code still plays its line. The question is the
// one scene 001 asks (copy.ts `ask.q`).

import { Volume2 } from "lucide-react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { useContext, useState } from "react";
import { HTML_LANG, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import { STORY_COPY, storyCopy } from "./copy";
import { fadeStops, fadeValues, LANG_STARTS, stepAt, stepTarget } from "./math";
import { ModeContext } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneJump, useSceneProgress } from "./scene";
import { clipSrc, useClip } from "./sound";

const FADE = 0.03;

/** One language's line in the shared place: in from below with a blur, out upward by less. */
function Say({ pin, i, x, rich }: { pin: MotionValue<number>; i: number; x: Lang; rich: boolean }) {
  const at = fadeStops(LANG_STARTS, i, FADE);
  const opacity = useTransform(pin, at, fadeValues(LANG_STARTS, i, 0, 1, 0));
  const y = useTransform(pin, at, fadeValues(LANG_STARTS, i, "34%", "0%", "-14%"));
  const blur = useTransform(pin, at, fadeValues(LANG_STARTS, i, 8, 0, 6));
  const filter = useTransform(blur, (b) => (rich && b > 0.05 ? `blur(${b.toFixed(1)}px)` : "none"));
  return (
    <motion.p lang={HTML_LANG[x]} className="st-say v6-on-photo" style={{ opacity, y, filter }}>
      {STORY_COPY[x].ask.q}
    </motion.p>
  );
}

/**
 * "MN Монгол": a press goes to that language and says its line. Lit while its line is on, or
 * sounding. The page's bar already shows the five codes, so the button shows the name alone and
 * keeps the code for screen readers (story.css): no code is on the screen twice.
 */
function Code({ i, x, on, sounding, onPress }: { i: number; x: Lang; on: boolean; sounding: boolean; onPress: (i: number, x: Lang) => void }) {
  return (
    <li>
      <button type="button" className="st-code press readout" aria-current={on ? "true" : undefined} data-sounding={sounding || undefined} onClick={() => onPress(i, x)}>
        <span className="st-code-id">{LANG_NAMES[x].code}</span>{" "}
        <span lang={HTML_LANG[x]} className="st-code-name">
          {LANG_NAMES[x].native}
        </span>
        <Volume2 aria-hidden className="st-code-icon" />
      </button>
    </li>
  );
}

/** Live: the five codes above the one place the five lines share. */
function Morph({ pin, rich, sounding, say }: { pin: MotionValue<number>; rich: boolean; sounding: string | null; say: (x: Lang) => void }) {
  const jump = useSceneJump();
  // Which language is on: read where the pin stands now, then kept up by the scroll.
  const [on, setOn] = useState(() => stepAt(LANG_STARTS, pin.get()));
  useMotionValueEvent(pin, "change", (p) => setOn(stepAt(LANG_STARTS, p)));
  const press = (i: number, x: Lang) => {
    jump(stepTarget(LANG_STARTS, i));
    say(x);
  };
  return (
    <div className="st-morph">
      <ul className="st-codes">
        {LANGS.map((x, i) => (
          <Code key={x} i={i} x={x} on={on === i} sounding={sounding === clipSrc("question", x)} onPress={press} />
        ))}
      </ul>
      <div className="st-says st-box">
        {LANGS.map((x, i) => (
          <Say key={x} pin={pin} i={i} x={x} rich={rich} />
        ))}
      </div>
    </div>
  );
}

export function SceneLanguages({ lang }: { lang: Lang }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  const clip = useClip();
  const say = (x: Lang) => clip.play(clipSrc("question", x));
  return (
    <SceneFrame id="languages" scene={scene} tall={[2, 2.5]}>
      <SceneBar n={4} label={c.languages.label} scene={scene} />
      <div className="st-head">
        <SceneTitle id="languages" rows={c.languages.title} scene={scene} />
        <SceneLine scene={scene}>{c.languages.line}</SceneLine>
      </div>

      <div className="st-fill">
        {mode.live ? (
          <Morph pin={scene.pin} rich={mode.rich} sounding={clip.sounding} say={say} />
        ) : (
          <ul className="st-lines">
            {LANGS.map((x) => (
              <li key={x} className="st-lines-row">
                {mode.ready ? (
                  // Where script runs, the code is the button that says its line.
                  <button type="button" className="st-code st-lines-code press readout" data-sounding={clip.sounding === clipSrc("question", x) || undefined} onClick={() => say(x)}>
                    <span className="st-code-id">{LANG_NAMES[x].code}</span>{" "}
                    <span lang={HTML_LANG[x]} className="st-code-name">
                      {LANG_NAMES[x].native}
                    </span>
                    <Volume2 aria-hidden className="st-code-icon" />
                  </button>
                ) : (
                  <span className="st-lines-code readout">
                    <span className="st-code-id">{LANG_NAMES[x].code}</span>{" "}
                    <span lang={HTML_LANG[x]} className="st-code-name">
                      {LANG_NAMES[x].native}
                    </span>
                  </span>
                )}{" "}
                <span lang={HTML_LANG[x]} className="v6-on-photo min-w-0 [overflow-wrap:anywhere]">
                  {STORY_COPY[x].ask.q}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SceneFrame>
  );
}
