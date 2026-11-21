"use client";

// The background of the opening page: the visitor's own sky (their weather and time of day), drawn
// by the app's Sky component, under a scrim so the text keeps its contrast in every sky.
import { use } from "react";
import { Sky } from "@/components/aspire/Sky";
import type { LandingWeather } from "@/lib/landing-weather";

export function LandingSky({ weather }: { weather: Promise<LandingWeather | null> }) {
  const w = use(weather);
  if (!w) return null;
  return (
    <>
      <Sky kind={w.sky.kind} intensity={w.sky.intensity} isDay={w.sky.isDay} windKph={w.sky.windKph} localHour={w.localHour} cloudCover={w.sky.cloudCover} />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-bg/60" />
    </>
  );
}
