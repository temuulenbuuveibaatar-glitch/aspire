// v4 layer 3 shell (docs/design/aspire-v4-hud.md sections 3-6): the Jarvis frame. Corner brackets on
// the viewport (.hud-frame::before), thin decorative rings behind the centre, and the readouts rail:
// a two-column grid on top on phones, a sticky column on the left from 1024px. Values use the mono
// face with tabular numerals. All strings arrive translated from the caller.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HudReadout {
  id: string;
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
  onClick?: () => void;
  /** Read after the value by screen readers: what the button does ("Open the live map"). */
  hint?: string;
}

export interface HudFrameProps {
  children: ReactNode;
  readouts: HudReadout[];
  clock: string;
}

// Tone colours the icon only (non-text, 3:1); the value stays ink so it keeps 4.5:1 on the glass.
const TONE = { ok: "text-success", warn: "text-signal", bad: "text-danger" } as const;

function Readout({ icon, label, value, tone, onClick, hint }: HudReadout) {
  const body = (
    <>
      <span aria-hidden className={cn("shrink-0 [&_svg]:size-5", tone ? TONE[tone] : "text-hud")}>
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-label uppercase tracking-[0.12em] text-ink-muted">{label}</span>
        <span className="block font-mono text-value-sm tabular-nums text-ink">{value}</span>
        {hint && <span className="sr-only">, {hint}</span>}
      </span>
    </>
  );
  const cls = "hud flex min-h-12 w-full items-center gap-3 px-3 py-2";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "press cursor-pointer")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function HudFrame({ children, readouts, clock }: HudFrameProps) {
  return (
    <div className="hud-frame relative isolate min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        fill="none"
        className="pointer-events-none stroke-hud-line fixed left-1/2 top-1/2 -z-10 size-[min(86vmin,680px)] -translate-x-1/2 -translate-y-1/2"
      >
        <circle cx="100" cy="100" r="99" strokeWidth="0.4" />
        <circle cx="100" cy="100" r="82" strokeWidth="0.6" strokeDasharray="1 5" />
        <circle cx="100" cy="100" r="64" strokeWidth="0.4" strokeDasharray="70 30 20 30" />
        <path d="M100 0v10M100 190v10M0 100h10M190 100h10" strokeWidth="0.6" />
      </svg>

      <header className="px-4 pt-[max(16px,env(safe-area-inset-top))] lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 lg:flex-col">
          <time className="numeral text-value text-ink">{clock}</time>
        </div>
        {readouts.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2 lg:mt-6 lg:grid-cols-1">
            {readouts.map((r) => (
              <li key={r.id} className="min-w-0">
                <Readout {...r} />
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="relative min-w-0">{children}</div>
    </div>
  );
}
