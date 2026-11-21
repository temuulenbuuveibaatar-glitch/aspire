"use client";

// The scroll story of the opening page: five scenes that each pin to the screen and play as you
// scroll, then (rendered by Landing after it) the city marquee and the feature index.
//
//   01 Ask               the orb listens, a question types itself, the answer arrives
//   02 The city, live    six product cards are dealt onto a pile and fan out into a row
//   03 Real weather      the page's own sky turns clear, rain, snow, then back to the visitor's
//   04 Five languages    one question, in Mongolian, Chinese, English, Russian and German
//   05 It does the work  the jobs Aspire takes on fly in and settle into a grid
//
// The parts live in ./story: the strings (copy.ts), the numbers behind the motion (math.ts), what
// may move (mode.ts), the pinned frame every scene shares (scene.tsx) and the styles (story.css).
//
// The server's HTML is every scene in normal flow, in its final, readable state: nothing waits for
// a script or an observer to be seen. A hydrated page that may move (no reduced motion, no Calm
// mode, a tall enough screen) then pins the scenes and drives them from the scroll position, with
// transform, opacity, filter and nothing else.
//
// For Landing: the story must not sit inside an element with overflow hidden, auto or scroll
// (overflow-x: clip is fine), or its stages stop sticking.

import "./story/story.css";
import { useMemo } from "react";
import type { LandingWeather } from "@/lib/landing-weather";
import type { Lang } from "@/lib/lang";
import { FeatureList } from "./story/FeatureIndex";
import { CityMarquee } from "./story/Marquee";
import { usableReading } from "./story/math";
import { ModeContext, useStoryMode } from "./story/mode";
import { SceneAsk } from "./story/SceneAsk";
import { SceneCity } from "./story/SceneCity";
import { SceneLanguages } from "./story/SceneLanguages";
import { SceneWeather } from "./story/SceneWeather";
import { SceneWork } from "./story/SceneWork";

/**
 * The five pinned scenes. `weather` is the visitor's reading, not awaited: the two places that show
 * it (the weather card of scene 02, the last step of scene 03) read it inside their own Suspense
 * boundaries, and show an example or nothing until it arrives and when there is none.
 */
export function Story({ lang, weather }: { lang: Lang; weather?: Promise<LandingWeather | null> }) {
  const mode = useStoryMode();
  // One checked promise for both places. A rejected one counts as no reading.
  const reading = useMemo(() => weather?.then(usableReading, () => null), [weather]);
  return (
    <ModeContext.Provider value={mode}>
      <div className="st-story" data-story={mode.live ? "live" : "still"}>
        <SceneAsk lang={lang} />
        <SceneCity lang={lang} reading={reading} />
        <SceneWeather lang={lang} reading={reading} />
        <SceneLanguages lang={lang} />
        <SceneWork lang={lang} />
      </div>
    </ModeContext.Provider>
  );
}

/** Cities with a public street camera source, in huge outlined type that moves with the scroll. */
export function Marquee({ lang }: { lang: Lang }) {
  return <CityMarquee lang={lang} />;
}

/** What Aspire does, as eight large numbered rows; with a mouse a small picture follows the pointer. */
export function FeatureIndex({ lang }: { lang: Lang }) {
  return <FeatureList lang={lang} />;
}
