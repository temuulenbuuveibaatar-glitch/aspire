// The Halo around the orb (spec 6.3): a static SVG overlay, every tick is real data.
//  - Clock ring (r = 0.47 of the box): 96 quarter-hour ticks, 4 major ticks, midnight at the
//    bottom and noon at the top, and an accent dot for "now" in the place's time zone. It never spins.
//  - Daylight arc on the clock ring from sunrise to sunset (lib/sun.ts), with signal-colour ticks at
//    both ends; a full ring on polar day, nothing on polar night or when the sun is unknown.
//  - Inner arc (the bottom 120 degrees, under the sphere, inside the voice ring): AQI severity as 6 EPA
//    segments, or the rain chance when rain is likely. The same facts are spelled out in the
//    ambient bar and the live panel, so the arc is decorative (aria-hidden).
// The voice ring (r = 0.40) is drawn by VoiceOrb itself in halo mode.

const INK = "var(--color-ink, #F2F6FC)";
const AQI_COLOURS = ["#5BE3A4", "#F5D76B", "#F5A66B", "#FF8A8A", "#C99BFF", "#E0457B"] as const;

function point(c: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

/** SVG arc from `from` to `to` degrees (0 = +x, clockwise, as SVG draws), going counter-clockwise. */
function arc(c: number, r: number, from: number, to: number): string {
  const [x1, y1] = point(c, r, from);
  const [x2, y2] = point(c, r, to);
  const large = Math.abs(from - to) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export interface OrbHaloProps {
  /** Halo box in px (sphere diameter x 1.42). */
  box: number;
  /** Minutes since local midnight in the place's time zone; null hides the marker. */
  minutes: number | null;
  /** AQI severity 1..6, or null when unknown. */
  aqiSeverity: number | null;
  /** Rain chance 0..100 when rain is likely (shown instead of AQI), else null. */
  rainChance: number | null;
  /** Sunrise and sunset in minutes since local midnight; null when unknown or none today. */
  sunriseMin?: number | null;
  sunsetMin?: number | null;
  /** "day": the sun never sets (full daylight ring); "night": it never rises (no arc). */
  polar?: "day" | "night" | null;
}

/** SVG degrees (0 = +x, clockwise) of a clock time: midnight at the bottom, noon at the top. */
const clockDeg = (min: number) => 90 + (min / 1440) * 360;

export function OrbHalo({ box, minutes, aqiSeverity, rainChance, sunriseMin = null, sunsetMin = null, polar = null }: OrbHaloProps) {
  const c = box / 2;
  const r = box * 0.47;
  const step = (2 * Math.PI * r) / 96;
  const angle = minutes == null ? 0 : (minutes / 1440) * 360;
  // Bottom 120 degrees (150 lower left to 30 lower right), between the sphere edge and the voice ring.
  const ra = box * 0.36;
  const hasSun = sunriseMin != null && sunsetMin != null;
  let riseDeg = hasSun ? clockDeg(sunriseMin) : 0;
  let setDeg = hasSun ? clockDeg(sunsetMin) : 0;
  if (hasSun && setDeg <= riseDeg) setDeg += 360;
  if (hasSun && setDeg - riseDeg >= 359.5) riseDeg = setDeg - 359.5;
  const seg = 120 / 6;
  const gapDeg = (2 / (2 * Math.PI * ra)) * 360; // a 2px gap

  return (
    <svg
      aria-hidden
      focusable="false"
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      overflow="visible"
      className="pointer-events-none absolute inset-0 overflow-visible"
      data-sky-surface="arc"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke={INK} strokeOpacity={0.45} strokeWidth={4} strokeDasharray={`1 ${step - 1}`} />
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1={c}
          y1={c + r - 3}
          x2={c}
          y2={c + r + 3}
          stroke={INK}
          strokeOpacity={0.8}
          strokeWidth={1.5}
          strokeLinecap="round"
          transform={`rotate(${deg} ${c} ${c})`}
        />
      ))}
      {polar === "day" ? (
        <circle cx={c} cy={c} r={r} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={1.5} />
      ) : hasSun ? (
        <g>
          <path d={arc(c, r, setDeg, riseDeg)} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={1.5} strokeLinecap="round" />
          {[riseDeg, setDeg].map((deg) => {
            const [x1, y1] = point(c, r - 3, deg);
            const [x2, y2] = point(c, r + 3, deg);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--color-signal, #F5C26B)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      ) : null}
      {minutes != null && (
        <g transform={`rotate(${angle.toFixed(2)} ${c} ${c})`}>
          <circle cx={c} cy={c + r} r={3} fill="var(--color-accent, #5EE7FF)" />
        </g>
      )}

      {rainChance != null ? (
        <g>
          <path d={arc(c, ra, 150, 30)} fill="none" stroke="rgb(170 200 255)" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />
          {rainChance > 0 && (
            <path
              d={arc(c, ra, 150, 150 - (120 * Math.min(100, rainChance)) / 100)}
              fill="none"
              stroke="rgb(170 200 255)"
              strokeOpacity={0.9}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
        </g>
      ) : aqiSeverity != null ? (
        <g>
          {AQI_COLOURS.map((fallback, i) => {
            const from = 150 - i * seg - gapDeg / 2;
            const to = 150 - (i + 1) * seg + gapDeg / 2;
            return (
              <path
                key={fallback}
                d={arc(c, ra, from, to)}
                fill="none"
                stroke={`var(--color-aqi-${i + 1}, ${fallback})`}
                strokeOpacity={i + 1 === aqiSeverity ? 1 : 0.25}
                strokeWidth={3}
              />
            );
          })}
          {(() => {
            const [mx, my] = point(c, ra, 150 - (aqiSeverity - 0.5) * seg);
            return <circle cx={mx} cy={my} r={4} fill="var(--color-panel, #0B1220)" stroke={INK} strokeWidth={2} />;
          })()}
        </g>
      ) : null}
    </svg>
  );
}

export default OrbHalo;
