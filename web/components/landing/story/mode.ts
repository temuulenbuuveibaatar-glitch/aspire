"use client";

// How much the scroll story may move, decided once for all of its parts.
//
// The server, a browser without JavaScript, reduced motion, Calm mode, a short screen and enlarged
// text all get the same thing: every scene in normal flow, in its final, readable state. Only a
// hydrated page that passes every check pins its scenes and drives them from the scroll position.
// Each value is false on the server and during hydration (useSyncExternalStore), so the first
// client render matches the HTML and the upgrade happens in the render after it.

import { createContext, useMemo, useSyncExternalStore } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";

export interface StoryMode {
  /** JavaScript is running and motion is allowed (no reduced motion, no Calm mode). */
  moving: boolean;
  /** `moving`, on a screen tall enough for a full-screen stage, at the default text size: scenes pin. */
  live: boolean;
  /** 768 px and wider: longer pins. */
  wide: boolean;
  /** `moving` with a mouse on a wide screen: springs, blur, the deck cut and pointer effects. */
  rich: boolean;
  /** Columns of the card grid in scene 02; the same breakpoints as story.css. */
  cols: 2 | 3 | 6;
}

/** What the server renders, and what stays when nothing may move. */
export const STILL_MODE: StoryMode = { moving: false, live: false, wide: false, rich: false, cols: 2 };

export const ModeContext = createContext<StoryMode>(STILL_MODE);

const never = () => () => {};
const yes = () => true;
const no = () => false;

/** A pinned stage is one screen high: below this height its contents would be cut off, so nothing pins. */
const MIN_STAGE_PX = 620;

// The height is read once and kept. A phone's address bar sliding away makes the window taller
// without changing its width; following that would switch the whole story between its two layouts
// in the middle of a scroll. A new width (rotation, a resized window) or any resize with a mouse
// is a real change and is read again.
let roomy: boolean | null = null;
let seenWidth = 0;

function roomyNow(): boolean {
  if (roomy === null) {
    roomy = window.innerHeight >= MIN_STAGE_PX;
    seenWidth = window.innerWidth;
  }
  return roomy;
}

function subscribeRoomy(onChange: () => void): () => void {
  const onResize = () => {
    const mouse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    if (!mouse && window.innerWidth === seenWidth) return;
    seenWidth = window.innerWidth;
    const next = window.innerHeight >= MIN_STAGE_PX;
    if (next === roomy) return;
    roomy = next;
    onChange();
  };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

/** Text size A+ or A++ (the layout's inline script sets the attribute before the first paint). */
const bigText = () => document.documentElement.hasAttribute("data-text-size");

export function useStoryMode(): StoryMode {
  const hydrated = useSyncExternalStore(never, yes, no);
  const still = useStill();
  const tall = useSyncExternalStore(subscribeRoomy, roomyNow, no);
  const enlarged = useSyncExternalStore(never, bigText, no);
  // rem, like the breakpoints in story.css (40, 48 and 80rem) and Tailwind's sm, md and xl.
  const sm = useMedia("(min-width: 40rem)");
  const wide = useMedia("(min-width: 48rem)");
  const xl = useMedia("(min-width: 80rem)");
  const mouse = useMedia("(hover: hover) and (pointer: fine)");
  const moving = hydrated && !still;
  const live = moving && tall && !enlarged;
  const rich = moving && wide && mouse;
  const cols = xl ? 6 : sm ? 3 : 2;
  return useMemo(() => ({ moving, live, wide, rich, cols }), [moving, live, wide, rich, cols]);
}
