"use client";

// v4 layers 0-2 (docs/design/aspire-v4-hud.md section 2): the person's city photo graded by time
// and weather, a vignette and scrims for text contrast, then the live weather particles. The grade is
// CSS keyed on data-time / data-sky (app/globals.css, "Backdrop"). The photo credit (required by Google)
// sits bottom-left above it all.

import { useState } from "react";
import { Camera } from "lucide-react";
import type { AmbientSky } from "@/lib/ambient-types";
import { Sky, safeKind, skyFamily, stillSkyGradient } from "@/components/aspire/Sky";

interface BackdropPhoto {
  url: string;
  attribution: { name: string; uri: string };
}

interface BackdropProps {
  photo: BackdropPhoto | null;
  sky: AmbientSky;
  localHour: number | null;
  effects: boolean;
  /** Translated "Photo" for the credit (screen readers otherwise hear only the name). */
  label?: string;
}

/** Trust boundary: only https URLs reach an img src or a link (protocol-relative ones are upgraded). */
export function httpsUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const p = new URL(u.startsWith("//") ? `https:${u}` : u);
    return p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

/** The photo grade's light: night, the warm hours around sunrise and sunset, or plain day. */
export function timeOfDay(isDay: boolean, hour: number | null): "night" | "dusk" | "day" {
  if (!isDay) return "night";
  return hour != null && (hour <= 7 || hour >= 18) ? "dusk" : "day";
}

export function Backdrop({ photo, sky, localHour, effects, label }: BackdropProps) {
  // A sky no weather backs (known === false) is not a claim: show it neutral.
  const kind = sky.known === false ? "clear" : safeKind(sky.kind);
  const family = skyFamily(kind);
  const hour = typeof localHour === "number" && Number.isFinite(localHour) ? ((Math.floor(localHour) % 24) + 24) % 24 : null;
  const time = timeOfDay(sky.isDay !== false, hour);
  const src = httpsUrl(photo?.url);
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src && failed !== src ? src : null;
  const author = shown ? (photo?.attribution.name ?? "").trim().slice(0, 80) : "";
  const authorUri = shown ? httpsUrl(photo?.attribution.uri) : null;

  return (
    <>
      <div aria-hidden="true" className="backdrop pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh overflow-hidden bg-bg" data-time={time} data-sky={family}>
        <div className="absolute inset-0" style={{ background: stillSkyGradient(kind, time !== "night", hour) }} />
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element -- a remote, per-person photo; next/image adds nothing here
          <img
            key={shown}
            src={shown}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(shown)}
            className="backdrop-photo absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="backdrop-tint absolute inset-0" />
        <div className="backdrop-scrim absolute inset-0" />
        {/* Reduced motion or Calm mode: Sky draws one still frame, so the weather still shows. Sized to the
            largest viewport (h-lvh) so the phone's toolbar showing and hiding never resizes the canvas. */}
        {effects && <Sky overlay kind={kind} intensity={sky.intensity} isDay={time !== "night"} windKph={sky.windKph} localHour={hour} />}
      </div>
      {shown && (
        <p className="fixed bottom-[max(4px,env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-20 flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-sm bg-hud-glass px-2 text-small text-ink-muted">
          <Camera aria-hidden className="size-4 shrink-0" />
          {label && <span className="sr-only">{label}:</span>}
          {author &&
            (authorUri ? (
              <a href={authorUri} target="_blank" rel="noopener noreferrer" className="inline-block truncate py-3 leading-6 underline">
                {author}
              </a>
            ) : (
              <span className="truncate">{author}</span>
            ))}
          <span aria-hidden>·</span>
          <span className="shrink-0">Google Maps</span>
        </p>
      )}
    </>
  );
}
