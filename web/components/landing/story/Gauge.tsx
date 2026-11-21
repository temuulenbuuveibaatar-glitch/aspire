// The gauge the story's instruments are drawn with: a hairline circle, a ring of tick marks, four
// longer marks on the axes, a small cross at the centre, and (for a dial) an arc in the accent that
// starts at twelve o'clock and runs clockwise as far as the figure goes.
//
// Decoration only: every figure a gauge stands for is printed as text beside it. Both drawings fill
// the box they are put in (story.css .st-gauge); how far the arc goes is read from --st-fill on any
// ancestor, so one arc can be static (a still page) or follow a scroll (a pinned one).

import { cn } from "@/lib/utils";

const ART = { viewBox: "-100 -100 200 200", fill: "none", "aria-hidden": true, focusable: false } as const;

/** The circle, its 120 ticks (every tenth one longer), the four axis marks and the centre cross. */
export function GaugeRing({ className }: { className?: string }) {
  return (
    <svg {...ART} className={cn("st-gauge-ring", className)} stroke="currentColor">
      <circle r="98.5" strokeOpacity="0.26" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {/* Ticks are dashes of a wide stroke: the dash is the tick's width, the stroke its length. */}
      <circle r="94" strokeOpacity="0.4" strokeWidth="3" pathLength="360" strokeDasharray="0.34 2.66" strokeDashoffset="0.17" />
      <circle r="92.75" strokeOpacity="0.62" strokeWidth="5.5" pathLength="360" strokeDasharray="0.34 29.66" strokeDashoffset="0.17" />
      <path d="M0 -98.5V-82M0 98.5V82M-98.5 0H-82M98.5 0H82" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d="M-4.5 0H4.5M0 -4.5V4.5" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The arc for a figure and the pointer at its end. */
export function GaugeArc({ className }: { className?: string }) {
  return (
    <svg {...ART} className={cn("st-gauge-arc", className)}>
      {/* Turned so the arc starts at the top; pathLength 1 lets --st-fill be the share drawn. */}
      <circle className="st-arc" r="98.5" pathLength="1" transform="rotate(-90)" />
      <path className="st-arc-end" d="M0 -98.5V-78" />
    </svg>
  );
}
