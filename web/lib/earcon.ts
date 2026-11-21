// Short tones for eyes-free voice use, so the mic state is heard rather than announced over it:
// 880 Hz = the mic is open, 440 Hz = the mic closed, 220 Hz twice = a problem (no mic, not heard).

/** One quiet sine tone of `ms` milliseconds, starting `delay` seconds from now. */
export function beep(ctx: BaseAudioContext, hz: number, ms = 90, delay = 0): void {
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = hz;
  gain.gain.value = 0.08;
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + ms / 1000);
}

/** `times` tones 150 ms apart; silent without a context or in Calm mode (`<html data-calm="true">`). */
export function earcon(ctx: BaseAudioContext | null | undefined, hz: number, times = 1): void {
  if (!ctx || (typeof document !== "undefined" && document.documentElement.dataset.calm === "true")) return;
  try {
    for (let i = 0; i < times; i++) beep(ctx, hz, 90, i * 0.15);
  } catch {
    /* a closed context: no tone */
  }
}
