"use client";

// Scene 02, The city, live: the centre piece. Aspire's six product cards are dealt onto a pile one
// by one as the stage arrives, the deck is cut once, and then the pile fans out as you scroll: into
// a row of six on a wide screen, three by two on a tablet, two by three on a phone.
//
// Each card sits in its own grid cell from the start; the pile is only a transform on the cell
// (math.ts stackPose), in percent of the cell itself, so no card is ever measured. At rest every
// transform is "none": the grid is the page a visitor without motion, or without JavaScript, reads.

import { motion, useTransform } from "motion/react";
import { Suspense, useContext, type ReactNode } from "react";
import { textFor } from "@/components/v6/text";
import type { Lang } from "@/lib/lang";
import { ExampleCard, type ReadingPromise, WeatherCard } from "./cards";
import { CARD_IDS, storyCopy } from "./copy";
import { poseCss, stackPose, stackRank, stackSetup, type StackSetup } from "./math";
import { ModeContext } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, type SceneProgress, useSceneProgress } from "./scene";

/** One grid cell and the card in it. Its transform, opacity and place in the pile follow the scroll; at rest it is simply in its cell. */
function Cell({ slot, scene, setup, children }: { slot: number; scene: SceneProgress; setup: StackSetup; children: ReactNode }) {
  const transform = useTransform([scene.enter, scene.pin], ([enter, pin]: number[]) => poseCss(stackPose(slot, enter ?? 1, pin ?? 1, setup)));
  const opacity = useTransform([scene.enter, scene.pin], ([enter, pin]: number[]) => stackPose(slot, enter ?? 1, pin ?? 1, setup).opacity);
  const zIndex = useTransform(scene.pin, (pin) => stackRank(slot, pin, setup));
  return (
    <motion.li className="st-cell" style={{ transform, opacity, zIndex }}>
      {children}
    </motion.li>
  );
}

export function SceneCity({ lang, reading }: { lang: Lang; reading: ReadingPromise }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  const v = textFor(lang);
  const setup = stackSetup(mode.cols, mode.rich);
  return (
    <SceneFrame id="city" scene={scene} tall={[2.2, 2.6]}>
      <SceneBar n={2} label={c.city.label} scene={scene} />
      <div className="grid gap-x-10 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
        <SceneTitle id="city" rows={c.city.title} scene={scene} />
        <SceneLine scene={scene} className="md:pb-2">
          {c.city.line}
          {/* What the dashed mark on a card means. Decoration: each card carries the word itself. */}
          <span aria-hidden className="st-key flex">
            {c.example}
            <span className="st-key-mark" />
          </span>
        </SceneLine>
      </div>
      <ul className="st-cards">
        {CARD_IDS.map((id, slot) => (
          <Cell key={id} slot={slot} scene={scene} setup={setup}>
            {id === "weather" ? (
              // Its own boundary: the five example cards never wait for the reading. Until it
              // arrives the example card stands in, in the same box, so nothing moves when it does.
              <Suspense fallback={<WeatherCard c={c} v={v} reading={undefined} />}>
                <WeatherCard c={c} v={v} reading={reading} />
              </Suspense>
            ) : (
              <ExampleCard id={id} lang={lang} />
            )}
          </Cell>
        ))}
      </ul>
    </SceneFrame>
  );
}
