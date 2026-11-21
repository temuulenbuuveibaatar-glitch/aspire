// What the scenes and the feature grid share about a reading and a camera: the promise a scene
// waits on, the name to show for its place, and the one camera frame the page draws.

import { Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoryCopy } from "./copy";
import type { Reading } from "./math";

/** The visitor's reading, already checked (math.ts usableReading); undefined when the page was given none. */
export type ReadingPromise = Promise<Reading | null> | undefined;

/** The name to show for a reading's place: the visitor's city as given, or Erdenet in the page language. */
export const placeName = (r: Reading, c: StoryCopy): string => (r.local && r.place ? r.place : c.erdenet);

/** One camera frame: a road drawn in lines inside the HUD's corner brackets. Never a photograph. */
export function CameraFrame({ flip = false, className }: { flip?: boolean; className?: string }) {
  return (
    <div className={cn("st-cam relative min-h-12 overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-2", className)}>
      <svg viewBox="0 0 80 60" className="absolute inset-0 size-full" fill="none" preserveAspectRatio="xMidYMid slice">
        <path d="M0 34 H80" stroke="var(--color-line-strong)" />
        <path d={flip ? "M10 60 L36 34 H48 L80 52 V60 Z" : "M0 60 V52 L34 34 H44 L70 60 Z"} fill="var(--color-surface-3)" />
        <path d={flip ? "M40 60 L42 36" : "M38 60 L39 36"} stroke="var(--color-ink-faint)" strokeDasharray="4 4" />
        <path d={flip ? "M4 34 V22 H14 V34 M18 34 V16 H30 V34" : "M50 34 V18 H62 V34 M66 34 V24 H76 V34"} stroke="var(--color-line-strong)" />
      </svg>
      <Video className="absolute top-2.5 left-2.5 size-4 text-accent" />
    </div>
  );
}
