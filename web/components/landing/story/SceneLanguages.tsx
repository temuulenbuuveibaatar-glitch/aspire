"use client";

// Scene 04, Five languages: one question, asked in Mongolian, Chinese, English, Russian and German.
// While the stage is pinned the five lines share one place and trade it with a blur crossfade as
// you scroll, each in its own script and marked with its own language. Without motion the same
// five lines are a list. The question is the one scene 01 asks (copy.ts `ask.q`).

import { motion, useTransform, type MotionValue } from "motion/react";
import { useContext } from "react";
import { HTML_LANG, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import { STORY_COPY, storyCopy } from "./copy";
import { fadeStops, fadeValues, LANG_STARTS } from "./math";
import { ModeContext } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneProgress } from "./scene";

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

/** "MN Монгол": lit while its line is on. */
function Code({ pin, i, x }: { pin: MotionValue<number>; i: number; x: Lang }) {
  const opacity = useTransform(pin, fadeStops(LANG_STARTS, i, FADE), fadeValues(LANG_STARTS, i, 0.4, 1, 0.4));
  return (
    <motion.li className="st-code v6-on-photo" style={{ opacity }}>
      <span className="numeral text-accent">{LANG_NAMES[x].code}</span>
      <span lang={HTML_LANG[x]} className="st-code-name">
        {LANG_NAMES[x].native}
      </span>
    </motion.li>
  );
}

export function SceneLanguages({ lang }: { lang: Lang }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  return (
    <SceneFrame id="languages" scene={scene} tall={[2, 2.5]}>
      <SceneBar n={4} label={c.languages.label} scene={scene} />
      <div className="grid min-h-0 flex-1 content-between gap-6">
        <div className="min-w-0">
          <SceneTitle id="languages" rows={c.languages.title} scene={scene} />
          <SceneLine scene={scene} className="mt-3 max-w-[42rem] sm:mt-6">
            {c.languages.line}
          </SceneLine>
        </div>

        {mode.live ? (
          <div className="flex flex-col gap-3 sm:gap-5">
            {/* The names are decoration here: every line below carries its own language. */}
            <ul className="st-codes" aria-hidden>
              {LANGS.map((x, i) => (
                <Code key={x} pin={scene.pin} i={i} x={x} />
              ))}
            </ul>
            <div className="st-says">
              {LANGS.map((x, i) => (
                <Say key={x} pin={scene.pin} i={i} x={x} rich={mode.rich} />
              ))}
            </div>
          </div>
        ) : (
          <ul className="st-lines">
            {LANGS.map((x) => (
              <li key={x} className="st-lines-row">
                <span className="numeral st-lines-code" title={LANG_NAMES[x].native}>
                  {LANG_NAMES[x].code}
                </span>{" "}
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
