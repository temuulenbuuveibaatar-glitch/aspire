"use client";

// Spec 6.5: a thin sky-tinted light around the window edge that follows the voice state.
// Opacity only (no layout, no blur animation). Under reduced transparency or Calm mode the glow
// becomes a solid 2px accent border, shown while listening only.
import type { VoiceOrbState, VoiceOrbTone } from "@/components/ui/voice-orb";

const OPACITY: Partial<Record<VoiceOrbState, number>> = {
  listening: 0.6,
  speaking: 0.35,
  thinking: 0.2,
  error: 0.6,
};

export function EdgeGlow({ state, tone = "default" }: { state: VoiceOrbState; tone?: VoiceOrbTone }) {
  const confirm = tone === "confirm" && (state === "idle" || state === "thinking");
  const opacity = confirm ? 0.5 : (OPACITY[state] ?? 0);
  const color = state === "error" ? "var(--color-danger)" : confirm ? "var(--color-signal)" : "var(--edge)";
  const soft =
    state === "error"
      ? "color-mix(in oklab, var(--color-danger) 45%, transparent)"
      : confirm
        ? "color-mix(in oklab, var(--color-signal) 45%, transparent)"
        : "var(--edge-soft)";
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 opaque:hidden"
        style={{
          boxShadow: `inset 0 0 0 2px ${color}, inset 0 0 24px 0 ${soft}`,
          opacity,
          transition: `opacity ${opacity ? 250 : 160}ms ease-out`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 hidden border-2 border-accent opaque:block"
        style={{ opacity: state === "listening" ? 1 : 0 }}
      />
    </>
  );
}

export default EdgeGlow;
