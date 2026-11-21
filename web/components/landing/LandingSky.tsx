"use client";

// The background of the opening page: the visitor's own sky (their weather and time of day), drawn
// by the app's Sky component, under a scrim so the text keeps its contrast in every sky. Both sit at
// z-0 (a negative z-index would be painted under the body background); the page content is z-10.
import { use } from "react";
import { Sky } from "@/components/aspire/Sky";
import type { LandingWeather } from "@/lib/landing-weather";

export function LandingSky({ weather }: { weather: Promise<LandingWeather | null> }) {
  const w = use(weather);
  if (!w) return null;
  return (
    <>
      {/* maxDpr 0.5: a quarter of the pixels (a full-size canvas at 60 fps made the page stutter). Desaturated
          and dimmed so dusk and dawn stay in the brand's dark green range instead of bright pink and purple. */}
      <Sky kind={w.sky.kind} intensity={w.sky.intensity} isDay={w.sky.isDay} windKph={w.sky.windKph} localHour={w.localHour} cloudCover={w.sky.cloudCover} className="z-0 saturate-[0.3] brightness-[0.8]" maxDpr={0.5} />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-bg/55" />
    </>
  );
}
