"use client";

// A mono line that settles into place: its characters start as other characters of the same
// alphabet and lock in from left to right, in well under 600 ms. `as="type"` writes the line out
// instead, one character after another.
//
// The line itself is always there. The server's HTML, a page without JavaScript, reduced motion,
// Calm mode and phones get the finished text and nothing else. While the effect runs the finished
// text stays in the DOM for screen readers and the moving copy is hidden from them, so nobody ever
// hears, or copies, a half-settled line.

import { useEffect, useState } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";

/** The longest the effect ever runs. */
export const DECODE_MS = 560;
const PER_CHAR_MS = 24;
const LEAD_MS = 120;

const LATIN = "ABCDEFGHKLMNPRSTUVXYZ0123456789";
const CYRILLIC = "АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЯ";

/** How long a line of `chars` characters takes: longer lines settle faster per character, never past the cap. */
export function decodeMs(chars: number): number {
  return Math.min(DECODE_MS, LEAD_MS + Math.max(0, chars) * PER_CHAR_MS);
}

/** A stand-in for one character: a letter or digit of the same alphabet and case. Everything else (spaces, punctuation, Chinese) stays itself, so the line never changes width or wraps differently. */
function standIn(ch: string, n: number): string {
  if (/[a-z0-9]/i.test(ch)) {
    const pick = LATIN[n % LATIN.length] ?? ch;
    return ch === ch.toLowerCase() && ch !== ch.toUpperCase() ? pick.toLowerCase() : pick;
  }
  if (/[\u0400-\u04ff]/.test(ch)) {
    const pick = CYRILLIC[n % CYRILLIC.length] ?? ch;
    return ch === ch.toLowerCase() && ch !== ch.toUpperCase() ? pick.toLowerCase() : pick;
  }
  return ch;
}

/**
 * The line with its first `settled` characters in place and the rest standing in. `tick` changes
 * the stand-ins from frame to frame. Pure: the same three inputs always give the same string, and
 * `settled` at or past the end gives the text itself.
 */
export function decodeFrame(text: string, settled: number, tick: number): string {
  const chars = Array.from(text);
  if (settled >= chars.length) return text;
  const from = Math.max(0, Math.floor(settled));
  return chars.map((ch, i) => (i < from ? ch : standIn(ch, i * 7 + tick * 13 + ch.charCodeAt(0)))).join("");
}

interface DecodeProps {
  text: string;
  /** The effect runs each time this turns true (and when the text changes while it is). Default: once, when the line appears. */
  play?: boolean;
  /** "decode": every character is there from the start and settles. "type": the line is written out. */
  as?: "decode" | "type";
  className?: string;
}

export function Decode({ text, play = true, as = "decode", className }: DecodeProps) {
  const still = useStill();
  const wide = useMedia("(min-width: 48rem)");
  const on = play && wide && !still;
  // One run per text while `on`. The last frame drawn is kept with the run it belongs to, so a new
  // run starts from nothing in its very first render and never shows the finished line for a frame.
  const run = on ? text : null;
  const [frame, setFrame] = useState<{ run: string | null; settled: number; tick: number }>({ run: null, settled: Infinity, tick: 0 });

  useEffect(() => {
    if (run === null) return;
    const total = Array.from(run).length;
    const ms = decodeMs(total);
    const t0 = performance.now();
    let count = 0;
    let id = requestAnimationFrame(function step(now) {
      const p = (now - t0) / ms;
      if (p >= 1) {
        setFrame({ run, settled: Infinity, tick: 0 });
        return;
      }
      // Stand-ins change every third frame: fast enough to flicker, slow enough to be seen as letters.
      setFrame({ run, settled: Math.floor(p * total), tick: Math.floor(count++ / 3) });
      id = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, [run]);

  const settled = run === null ? Infinity : frame.run === run ? frame.settled : 0;
  const chars = Array.from(text);
  if (settled >= chars.length) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {as === "type" ? (
        // The part not yet written keeps its room, so nothing after the line moves.
        <span aria-hidden>
          {chars.slice(0, settled).join("")}
          <span className="st-unseen">{chars.slice(settled).join("")}</span>
        </span>
      ) : (
        <span aria-hidden>{decodeFrame(text, settled, frame.run === run ? frame.tick : 0)}</span>
      )}
    </span>
  );
}
