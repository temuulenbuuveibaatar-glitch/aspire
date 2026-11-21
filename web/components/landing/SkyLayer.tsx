"use client";

// The one sky behind the whole opening page: the app's own Sky (the gradient for the weather and the
// hour, clouds, rain, snow, fog, stars), drawn at a quarter of the pixels, then redrawn in the
// brand's greens and put under a scrim (landing.css .lp-sky), so text stays readable on every sky
// and a dusk never turns the page pink. A fixed layer at z-index 0 under the content at 10: never a negative
// z-index, which the body's own background would paint over.
//
// `base` is the visitor's reading (null: none, the page keeps its plain dark look). While the scroll
// story asks for another sky (sky-store.ts) that one is drawn instead: by night, in full, and at
// the screen's own resolution up to 1x, so every drop and flake is sharp.
// Sky starts its canvas after hydration, pauses it while the tab is hidden and draws nothing that
// moves under reduced motion or Calm mode.

import { useMemo, useState } from "react";
import { Sky } from "@/components/aspire/Sky";
import { demoScene, type LandingScene, PAGE_SKY_EASE } from "./scene";
import { useSkyOverride } from "./sky-store";

export function SkyLayer({ base }: { base: LandingScene | null }) {
  const override = useSkyOverride();
  const scene = useMemo(() => (override ? demoScene(override, base) : base), [override, base]);
  // A sky that ends (the story's scene left, and there is no reading) stays mounted to fade out.
  const [last, setLast] = useState(scene);
  if (scene && scene !== last) setLast(scene);
  const shown = scene ?? last;
  if (!shown) return null;
  return (
    <div aria-hidden className="lp-sky" data-tone={shown.tone} data-fall={shown.falls || undefined} data-off={scene ? undefined : ""} data-demo={override ? "" : undefined}>
      <div className="lp-sky-art">
        <Sky
          className="absolute z-0"
          maxDpr={override ? 1 : 0.5}
          kind={shown.kind}
          // A sky the story is showing off is drawn in full; the visitor's own stays quieter behind the text.
          intensity={shown.intensity * (override ? 1 : PAGE_SKY_EASE)}
          isDay={shown.isDay}
          windKph={shown.windKph}
          cloudCover={shown.cloudCover}
          localHour={shown.hour}
        />
      </div>
      <div className="lp-scrim" />
    </div>
  );
}
