# Aspire v3 design spec: "Skylight Halo"

Status: FINAL. This is the single source of truth for the v3 build. If a builder's brief disagrees with this file, this file wins. If this file is silent, follow `ui-ux-pro-max` defaults and the Hard rules in section 0.

Scope: `web/` (Next.js 16 App Router, React 19, TypeScript, Tailwind v4 `@theme`, lucide-react, motion/react, Clerk). No new npm dependencies.

---

## 0. Hard rules (non-negotiable, every builder)

1. **No emojis anywhere.** That covers UI strings, code labels, `ui-text.ts`, model output and TTS text. Icons come from `lucide-react`, or there is no icon. Dingbat and arrow glyphs used as icons (check marks, the "repeat" arrow) are also banned. See section 14.3 for the CI test and the output sanitiser.
2. **No secrets.** Keys live only in `web/.env.local` and in Vercel. Never print, log, commit or echo them into a client bundle. Every Google, Azure or Anthropic call goes through a server route.
3. **Every country and city.** Never hard-code Erdenet, Mongolia, MNT, tugrik, a Mongolian time zone or Mongolian scenery. The sky is abstract and has no landmarks. Units, time format and currency come from the locale and the location (section 12).
4. **Motion.** Animate transform and opacity only. UI springs are `{ type: "spring", bounce: 0, duration: 0.35 }`. Exits take 65% of the enter duration. Honour `prefers-reduced-motion` and the in-app Calm mode. Never animate `filter`, `height`, `width`, `top`, `left`, `background-position` or `stroke-dashoffset`.
5. **Transparency.** Honour `prefers-reduced-transparency`. There is no `backdrop-filter` over the live sky (section 3.3).
6. **Legibility.** Body text is at least 18px and no text is below 16px. Text contrast is at least 4.5:1 against the worst-case sky (white snow), and body text aims for 7:1. Non-text UI is at least 3:1.
7. **Touch.** Targets are at least 48x48px with at least 8px gaps. The primary mic/send button is 56px. Every icon-only button has an `aria-label`.
8. **Colour is never the only cue.** Every status pairs an icon, a word and a position with its colour.
9. **Persona.** Greetings are one or two short Jarvis sentences ("Good evening, sir. How is it going?"). Never list capabilities.

---

## 1. The decision

### 1.1 Scores

| Direction | Wow | Usability | Buildable | Total |
|---|---|---|---|---|
| D1 Skylight | 8.5 | 7.8 | 6.5 | 22.8 |
| D2 Halo Telemetry | 9.0 | 6.4 | 6.0 | 21.4 |
| D3 Skylight Bento | 7.0 | 8.6 | 7.5 | **23.1** |

### 1.2 Winner and grafts

**Winner: D3 Skylight Bento is the structural base.** It has the highest total, the best legibility for elderly users and the cheapest render. Its weakness is "a very good dashboard, not the most creative design", so two signatures are grafted on:

- **From D2:** the Halo, a data-only HUD around the existing contour orb.
  - The 24h daylight clock ring and the voice ring are drawn inside the orb canvas.
  - The orb takes weather and spectrum input.
  - Confirm and error states.
  - Corner ticks on the desktop telemetry rail.
  - Honest transit states.
  - The concrete clean-up list.
- **From D1:** the full-bleed live sky.
  - Sun and moon placed by the NOAA formula, client-side.
  - Rain splashes and snow settles on the halo and on the tile tops.
  - The sky-tinted edge glow.
  - The orb docks to the top bar via `layoutId`.
  - Hourly sky scrubbing, kept as phase P2 with tap and step controls.

**Rejected or limited, from the judges:**

- **Data only in thin rings.** Every ring value is also spelled out in a tile.
- **One button holding four abbreviated values.** The ambient bar is four separate buttons with full words.
- **Backdrop blur over a moving canvas.** Panels are solid at 88%.
- **Italic Jarvis line.** It is upright.
- **4px radius plus brackets on phone tiles.** Phone tiles use a 22px radius and no brackets.
- **Rotating clock ring.** The ring encodes time, so it never spins.

### 1.3 One-line concept

Your city's real sky fills the window. Jarvis is one orb hanging in it, ringed only by real data. Below sits a calm sill of four big, solid instruments. The sky is felt; the panels are read.

### 1.4 Phases

- **P0:** must ship for the demo.
- **P1:** ship if time allows; build the hooks now.
- **P2:** needs extra data. Stub the props now.

Each section marks its items.

---

## 2. Colour

### 2.1 `@theme` tokens (replace the token block in `web/app/globals.css`)

Ratios are measured on solid `#0B1220` and on the panel at 88% over pure white (the worst-case snow sky, which blends to about `#282E3B`). They were checked with the WCAG luminance formula on 2026-11-21.

| Tailwind token | Hex | Utility | Use | Solid | 88% over white |
|---|---|---|---|---|---|
| `--color-bg` | `#060B16` | `bg-bg` | page base under the sky; `theme-color` | n/a | n/a |
| `--color-panel` | `#0B1220` | `bg-panel` | every text surface; drawn as `rgb(11 18 32 / 0.88)` via `.panel` | n/a | n/a |
| `--color-panel-2` | `#121C2E` | `bg-panel-2` | user bubbles, inputs, rows inside a panel | n/a | n/a |
| `--color-panel-3` | `#1A2740` | `bg-panel-3` | pressed and selected fills | n/a | n/a |
| `--color-ink` | `#F2F6FC` | `text-ink` | primary text | 17.3:1 | 12.5:1 |
| `--color-ink-muted` | `#B6C2D6` | `text-ink-muted` | secondary text | 10.4:1 | 7.5:1 |
| `--color-ink-faint` | `#93A3BC` | `text-ink-faint` | labels, metadata only (never paragraphs) | 7.3:1 | 5.3:1 |
| `--color-accent` | `#5EE7FF` | `text-accent` `bg-accent` | orb, focus ring, primary CTA, live marker | 12.8:1 | 9.3:1 |
| `--color-on-accent` | `#0B1220` | `text-on-accent` | text and icons on accent, signal or danger fills | 12.8:1 on accent | n/a |
| `--color-accent-2` | `#8FB2FF` | `text-accent-2` | links in replies only | 8.9:1 | 6.4:1 |
| `--color-signal` | `#F5C26B` | `text-signal` | caution, confirm-needed, sunrise and sunset ticks | 11.4:1 | 8.3:1 |
| `--color-danger` | `#FF8A8A` | `text-danger` | errors, failed sends, severe weather | 8.3:1 | 6.0:1 |
| `--color-success` | `#5BE3A4` | `text-success` | Live label, sent, done | 11.6:1 | 8.4:1 |
| `--color-line` | `rgb(242 246 252 / 0.14)` | `border-line` | decorative hairlines | n/a | n/a |
| `--color-line-strong` | `rgb(242 246 252 / 0.28)` | `border-line-strong` | input borders, dividers that carry meaning | n/a | n/a |
| `--color-aqi-1` | `#5BE3A4` | `bg-aqi-1` | Good | 11.6:1 | 8.4:1 |
| `--color-aqi-2` | `#F5D76B` | `bg-aqi-2` | Moderate | 13.2:1 | 9.6:1 |
| `--color-aqi-3` | `#F5A66B` | `bg-aqi-3` | Unhealthy for sensitive groups | 9.4:1 | 6.8:1 |
| `--color-aqi-4` | `#FF8A8A` | `bg-aqi-4` | Unhealthy | 8.3:1 | 6.0:1 |
| `--color-aqi-5` | `#C99BFF` | `bg-aqi-5` | Very unhealthy | 8.6:1 | 6.2:1 |
| `--color-aqi-6` | `#E0457B` | `bg-aqi-6` | Hazardous: meter segments only (3.4:1 as non-text, never used for text) | 4.7:1 | 3.4:1 |
| `--color-traffic-free` | `#5BE3A4` | | strip cell | | |
| `--color-traffic-slow` | `#F5C26B` | | strip cell | | |
| `--color-traffic-jam` | `#FF8A8A` | | strip cell | | |
| `--color-traffic-heavy` | `#E0457B` | | strip cell (non-text only) | | |

The AQI ramp follows the US EPA order (green, yellow, orange, red, purple, maroon), lifted for a dark background.

**Rules:**

- **AQI and traffic colours only ever fill meter segments, strip cells and markers.** Text next to them is always `ink`.
- **No `#000` and no `#FFF` anywhere** (halation). `color-scheme: dark`.
- **One vivid accent per screen region.** Violet (`#8b7cff`) is deleted.

**Legacy aliases** (keep them during migration so untouched files still compile; remove in v3.1):

```css
--color-ink-soft: #B6C2D6;   /* = ink-muted */
--color-cyan: #5EE7FF;       /* = accent */
--color-amber: #F5C26B;      /* = signal */
--color-ok: #5BE3A4;         /* = success */
--color-bad: #FF8A8A;        /* = danger */
--color-violet: #8FB2FF;     /* retired, maps to accent-2 */
--color-glass: rgb(11 18 32 / 0.88);
--color-glass-strong: rgb(18 28 46 / 0.94);
```

### 2.2 Sky palette (TypeScript, not `@theme`)

The canvas reads these, so they live in `web/lib/sky-palette.ts` as `SKY_GRADIENTS: Record<SkyFamily, Record<SkyPhase, [top: string, horizon: string]>>`. SkyLayer also writes the current pair to `<html>` as `--sky-top` and `--sky-horizon`, and EdgeGlow and the sheet hairline read them there.

**Kind to family:**

| SkyKind | Family |
|---|---|
| clear, partly | clear (partly adds the cloud layer) |
| cloudy | cloudy |
| fog | fog |
| drizzle, rain, sleet, hail | rain |
| storm | storm |
| snow | snow |

**Gradients (top to horizon):**

| Family / phase | night | dawn | golden | day | dusk |
|---|---|---|---|---|---|
| clear | `#050A18` to `#1B2A4A` | `#2B3A67` to `#F0A98A` | `#6A5ACD` to `#F29E6B` | `#3B82C4` to `#9CC9EE` | `#1E2450` to `#C7708A` |
| cloudy | `#0A0F1A` to `#222B3A` | `#3A4258` to `#9C8A8A` | `#6E6A86` to `#C9A08A` | `#6E8296` to `#B4C2CF` | `#2A2F45` to `#7A6878` |
| fog | `#10151E` to `#2C333D` | `#5A6070` to `#A8A6A8` | `#8F8A90` to `#D2BFAE` | `#8A96A3` to `#C3CBD3` | `#3E4350` to `#858792` |
| rain | `#070B12` to `#1A2330` | `#2A3340` to `#5E6672` | `#3A3A4A` to `#7A6A6A` | `#2E3A48` to `#5B6B7A` | `#1C2230` to `#3E4656` |
| storm | `#05070D` to `#161A26` | `#1A1F2B` to `#3A3550` | `#24202E` to `#4A3A48` | `#1A1F2B` to `#3A3550` | `#10131C` to `#2A2638` |
| snow | `#0E1626` to `#2E3D55` | `#6F7C99` to `#D9C9CF` | `#A9A3BC` to `#F1D5C2` | `#C9D6E3` to `#EEF3F8` | `#3D4763` to `#8E93AE` |

- The gradient runs vertically, with the top colour at 0% and the horizon colour at 100% of the viewport.
- On desktop, add a radial "sun bloom" or "moon glow" at the computed sky position (section 5.3).
- **AQI haze:** a full-screen layer of `#8A7A5A` at opacity `0.04 * (severity - 1)`, which reaches 0.20 at severity 6.
- Gradients never sit directly under text. Text is always on `.panel`.

---

## 3. Material

### 3.1 Panel (the only text surface)

```css
.panel {
  background: rgb(11 18 32 / 0.88);
  border: 1px solid var(--color-line);
  box-shadow:
    inset 0 1px 0 rgb(242 246 252 / 0.08),       /* 1px specular top edge (Liquid Weather Glass, toned down) */
    0 16px 40px -16px rgb(2 6 16 / 0.65);
  border-radius: var(--radius-lg);
}
.panel-2 { background: var(--color-panel-2); border: 1px solid var(--color-line); }
@media (prefers-reduced-transparency: reduce) {
  .panel { background: var(--color-panel); border-color: var(--color-line-strong); box-shadow: none; }
}
:root[data-calm="true"] .panel { background: var(--color-panel); }
```

- Redefine `.glass` as an alias of `.panel` so existing markup inherits it.
- No `backdrop-filter` anywhere over the sky. Blur over a moving canvas forces a recomposite every frame and fails the battery budget. The 0.88 alpha already gives 12.5:1 or better over white snow.

### 3.2 Radii (`@theme`)

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | `10px` | chips, line badges, segments |
| `--radius-md` | `16px` | buttons, inputs, rows |
| `--radius-lg` | `22px` | cards, tiles, message panels |
| `--radius-xl` | `28px` | sheets (top corners on phone; all corners on the desktop inset panel) |
| `rounded-full` | | orb button, mic button, pills |

### 3.3 Elevation and z-order (fixed stack)

| z | Layer |
|---|---|
| 0 | SkyLayer: gradient, bloom, stars, clouds, particles, fog, haze, lightning. `aria-hidden`, `pointer-events: none`, `position: fixed; inset: 0`. |
| 10 | Page content: orb halo, tiles, transcript. |
| 20 | Composer (fixed bottom). |
| 30 | Top bar (sticky). |
| 40 | EdgeGlow, a fixed 2px inset frame with `pointer-events: none`. |
| 50 | Sheet backdrop and Sheet. |
| 60 | Toasts and the alarm. |

### 3.4 Desktop corner ticks (D2 flourish, desktop rail only, P1)

- Rail tiles at 1024px and wider get four 10px L-shaped ticks, inset 8px inside the rounded tile.
- 1.5px stroke, `--color-line-strong`, `aria-hidden`.
- They are drawn by an `::before`/`::after` pair using two `linear-gradient` backgrounds, so they cost no extra DOM.
- They never replace the border, and phones never show them.

---

## 4. Typography

### 4.1 Fonts (`web/app/layout.tsx`)

```ts
import { Inter, Tektur, Noto_Sans_SC } from "next/font/google";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"], // latin-ext: place names worldwide (Lodz, Istanbul, Plzen...)
  axes: ["opsz"],
  display: "swap",
});
const brand = Tektur({
  variable: "--font-brand",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"], // cyrillic-ext carries Mongolian U+04E8/9, U+04AE/F
  axes: ["wdth"],
  display: "swap",
});
const cjk = Noto_Sans_SC({
  variable: "--font-cjk",
  weight: ["400", "700"],
  preload: false,
  display: "swap",
  adjustFontFallback: false,
});
```

- Orbitron is removed because it is Latin-only.
- Any future font must ship `cyrillic-ext` and contain U+04E8, U+04E9, U+04AE and U+04AF. Unbounded and Sofia Sans fail this check and are banned.
- Scripts outside these sets (Arabic, Devanagari, Thai and others in place names) fall back to the system font. That is acceptable.

**`@theme` font tokens:**

```css
--font-sans: var(--font-body), var(--font-cjk), "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
--font-display: var(--font-brand), var(--font-sans);
```

`html` gets `className={`${body.variable} ${brand.variable} ${cjk.variable}`}`.

**Usage rules:**

- **Inter:** all prose, replies, buttons and labels. Weight 450 for body, 500 for emphasis, 600 for headings, and never below 400.
- **Tektur (`font-display`):** the wordmark, numerals (temperature, AQI, minutes, delay) and short uppercase labels of three words or fewer. Never paragraphs. Use `font-variation-settings: "wdth" 88` for numerals.
- **Numbers:** every changing number is `tabular-nums`. Do not use Inter `cv` or `ss` features, or slashed zero (the Google build strips them).

### 4.2 Type scale (`@theme`; the root is 16px and the text-size control scales it, section 13.4)

| Token | Size | Line height | Weight | Font | Use |
|---|---|---|---|---|---|
| `--text-label` | 1rem (16) | 1.3 | 500 | Inter | uppercase meta labels, Latin and Cyrillic only, `tracking-[0.08em]` |
| `--text-small` | 1rem (16) | 1.45 | 450 | Inter | timestamps, sources, scale tags (the floor; nothing smaller) |
| `--text-body` | 1.125rem (18) | 1.55 | 450 | Inter | UI copy, tile words, list rows |
| `--text-reply` | 1.25rem (20) | 1.55 | 450 | Inter | assistant replies, max width 65ch |
| `--text-lead` | 1.375rem (22) | 1.4 | 500 | Inter | status word under the orb, sheet titles |
| `--text-greeting` | clamp(1.75rem, 1.2rem + 2.4vw, 2.25rem) (28-36) | 1.2 | 500 | Inter, opsz auto | the Jarvis line, upright, never italic |
| `--text-value-sm` | 1.25rem (20) | 1.1 | 500 | Tektur | ambient bar values |
| `--text-eta` | 2rem (32) | 1 | 500 | Tektur | departure countdown in rows |
| `--text-value` | 2.5rem (40) | 1 | 500 | Tektur | tile hero numbers |
| `--text-hero` | clamp(4.5rem, 3rem + 7vw, 7rem) (72-112) | 0.95 | 400 | Tektur | live-panel temperature |
| `--text-wordmark` | 1rem (16) | 1 | 700 | Tektur | "ASPIRE", `tracking-[0.28em]` (Latin only) |

In Tailwind v4, define each as `--text-body: 1.125rem; --text-body--line-height: 1.55;`, which generates `text-body` and the others.

**Global:**

- `body { font-size: var(--text-body); line-height: 1.55; }`. Remove the 17px and the 15px `.legal-updated` value, which becomes 16px.
- Headings get `text-wrap: balance` and paragraphs get `text-wrap: pretty`.
- `overflow-wrap: anywhere` on tiles, buttons and chips. `:lang(de), :lang(en) { hyphens: auto }`.

**Per-language rules:**

- `:lang(zh)`: `letter-spacing: 0; line-height: 1.75; text-transform: none; font-style: normal`, with weight capped at 700.
- `:lang(mn), :lang(ru)`: `line-height: 1.55`. Never letter-space long Cyrillic.
- `lang` is set on every message, caption and the greeting: `mn`, `ru`, `en`, `de` or `zh-Hans`.

---

## 5. The sky (`components/aspire/sky/`)

### 5.1 Inputs (`lib/sky-scene.ts`, a pure function with unit tests)

```ts
export type SkyFamily = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";
export type SkyPhase = "night" | "dawn" | "golden" | "day" | "dusk";
export interface SkyScene {
  kind: SkyKind; family: SkyFamily; phase: SkyPhase;
  intensity: number;           // 0..1 from Ambient.sky
  windKph: number;             // 0 if null
  windDirDeg: number | null;   // optional, P1 (Ambient.sky.windDirDeg); null => lean right
  cloudCover: number;          // 0..100; default by kind (clear 5, partly 40, cloudy 90, fog 100, rain 85, storm 95, snow 85)
  sunAltDeg: number | null;    // NOAA, null when no coords
  sunAzDeg: number | null;
  moonPhase: number;           // 0..1 (0 new, 0.5 full), from date (synodic 29.530588d, epoch 2000-01-06T18:14Z)
  moonAltDeg: number | null;   // P1; if null, draw the moon at fixed upper-right
  aqiSeverity: 1|2|3|4|5|6;
  sunriseMin: number | null;   // minutes after local midnight in Ambient.timeZone
  sunsetMin: number | null;
  nowMin: number;              // minutes after local midnight in Ambient.timeZone
}
export function sceneFrom(a: Ambient | null, now: Date): SkyScene;
```

**Sun and moon.** `lib/sun.ts` implements the NOAA solar position from `coords`, the date and `timeZone`. It returns altitude, azimuth, sunrise and sunset. There is no dependency.

**Phase from sun altitude:**

| Phase | Sun altitude |
|---|---|
| night | below -6 |
| dawn | -6 to 0, before solar noon |
| dusk | -6 to 0, after solar noon |
| golden | 0 to 10 |
| day | 10 and above |

**Phase without coordinates** (fallback from `isDay` and `localHour`):

| Phase | Condition |
|---|---|
| night | `!isDay` |
| dawn | `localHour` 5-6 and `isDay` |
| golden | `localHour` 7, or 17-18 and `isDay` |
| dusk | 19-20 and `isDay` |
| day | everything else |

**Polar cases.** In polar day and polar night (Tromso, Murmansk), sunrise and sunset are null. The clock ring then shows an all-day arc or no arc, and the phase comes from altitude only. Write a test for this.

**AQI severity.** `aqiSeverity` comes from `severity(air)` in `lib/aqi.ts`, mapping `AqiCategory` to 1-6 in the order good, moderate, sensitive, unhealthy, very_unhealthy, hazardous. It is 1 when `air` is null.

**Login and no location.** Use `kind: "clear"`, `cloudCover: 20`, the phase from the device clock, and no particles.

### 5.2 Layer stack, bottom to top

1. **Gradient.** A full-viewport `div` with a `linear-gradient(180deg, top, horizon)`.
   - Two stacked gradient divs crossfade by opacity over 1.2s, ease-in-out, when the family or phase changes.
   - The canvas is never remounted.
2. **Bloom.** A `radial-gradient` div, 60vmax across, moved by `transform: translate3d`. It shows only on desktop and only when its position falls in the top 60%.
   - **Sun:** `rgb(255 236 200 / 0.35)` by day and `rgb(255 170 120 / 0.40)` in golden.
   - **Moon glow:** `rgb(220 230 255 / 0.12)`.
3. **Stars and moon.** Night with clear, partly or cloudy below 70% cover only.
   - Draw 60 stars on a 390px-wide phone, up to 120 at 1440px, at 0.5-1.5px. Draw them once to an offscreen canvas and blit it.
   - 10% of stars twinkle on opacity between 0.35 and 1 with periods of 2-5s.
   - The moon is a 28px phone / 40px desktop disc in `#E9EEF8` with a terminator from `moonPhase`, drawn once per phase change.
4. **Clouds.** Three pre-blurred radial-gradient divs, oversized at 160% width.
   - Opacity is `cloudCover/100 * 0.55`, and the colour is the horizon colour lightened 8%.
   - They drift on `translateX` with CSS keyframes, 60s, 75s and 90s, alternating direction.
   - Partly = cover 40. Cloudy = 90.
5. **Particles.** One 2D `<canvas>`. See section 5.3.
6. **Fog.** Two luminance bands, as `linear-gradient` divs at 40vh tall in `rgb(220 226 234 / 0.18*intensity + 0.10)`, at 55% and 75% of the viewport height. They drift on translateX over 80s and 110s.
7. **Haze.** The AQI haze div from section 2.2.
8. **Lightning.** Storm only. See section 5.4.

### 5.3 Particle engine (`SkyCanvas.tsx`)

**Canvas.**

- DPR is `Math.min(devicePixelRatio, 1.5)` for the sky (thin streaks hide it). The orb keeps a cap of 2.
- Pooled objects live in a preallocated `Float32Array` (x, y, vx, vy, len, alpha, size, phase, layer), so a frame allocates nothing.
- One `requestAnimationFrame` loop.

**Budget.**

- `count = base[kind] * (0.4 + 0.6 * intensity) * areaScale * tier`
- `areaScale = clamp(vw*vh / (390*844), 0.6, 2.2)`
- `tier` is 0.5 when `navigator.hardwareConcurrency <= 4` or `navigator.connection?.saveData`, otherwise 1. The low tier also drops to 30fps and skips the fog drift.
- In conversation mode (section 7.2), multiply the count by 0.6.

**Base counts:**

| Kind | Base | Particle |
|---|---|---|
| drizzle | 60 | streaks, len 6-10px |
| rain | 180 | streaks, len 10-20px |
| storm | 320 | streaks, len 14-22px |
| snow | 120 | dots |
| sleet | 140 | 50% streaks (len 8-12) and 50% dots (r 1-1.5) |
| hail | 90 | pellets: r 1.5-2.5, alpha 0.5-0.7, fast (700 px/s), short bounce on landing (2 frames) |

**Depth layers** (layer is picked per particle, weighted 0.45, 0.35, 0.20 for far, mid and near):

| Layer | Rain speed | Snow speed | Alpha | Rain width / snow radius |
|---|---|---|---|---|
| far | 450-600 px/s | 25-35 px/s | 0.12 | 1px / 0.8-1.2px |
| mid | 650-850 | 40-55 | 0.22 | 1px / 1.4-2px |
| near | 900-1200 | 60-80 | 0.35 (cap) | 1.25px / 2.2-3px |

**Rain.**

- Slant is `theta = clamp(windKph / 60, 0, 1) * 25deg`, leaning right, or by the sign of the eastward wind component when `windDirDeg` is given.
- `vx = vy * tan(theta)`. Each streak is drawn as a `lineTo` along its velocity.
- Colour: night or storm `rgba(170, 200, 255, a)`; day, dawn, dusk and golden `rgba(225, 232, 245, a)`.
- Batch one `stroke()` per layer: three per frame.

**Snow.**

- `#EAF2FF` dots. Day scenes add a 1px shadow ring at `rgba(30, 40, 60, 0.25)` so flakes read on the white snow sky.
- `x += sin(t * f + phase) * amp * dt`, where `f` is 0.3-0.8Hz and `amp` is 6-24px, scaled up by `windKph / 30`.
- Wind drift: `vx = windKph * 1.2 px/s`.

**Recycling.** Particles that exit the bottom or a side respawn above the top edge at a random x, with a wind-compensated x range.

**Landing surfaces** (D1 and D3 signature, P0 for the orb halo, P1 for tiles):

- Any element with `data-sky-surface="arc"` (the halo) or `data-sky-surface="edge"` (tile tops) registers its rect through a ResizeObserver in the `SkySurfaces` context.
- Rects are re-read only on resize, scroll end or layout change, never per frame.
- **Arc surface:** the top 120 degrees of the circle, `y = cy - sqrt(r^2 - (x-cx)^2)`.
- **Rain** that crosses a surface line in the near or mid layer dies and spawns a splash: two 1px dots on a 6px parabola, alive 120ms.
- **Snow** that crosses settles. Each surface keeps at most 40 resting flakes, each fading out by opacity over 6-10s. On a 5% chance a flake "slides" off the arc along the tangent.
- Surfaces outside the viewport are ignored.

**Lifecycle.**

- Pause on `document.hidden` and when an IntersectionObserver on the canvas reports zero intersection.
- Resume with `dt` clamped to 50ms so nothing jumps.
- Sleep entirely (stop rAF) for clear, partly, cloudy and fog scenes with no twinkling stars. Those are static frames plus CSS drift.

**Kind change.** Fade the old particle set out and the new set in through a canvas `globalAlpha` crossfade over 1.2s.

### 5.4 Storm lightning (photosensitivity-safe)

- An overlay div in `#DCE6FF`. Opacity goes 0 to 0.10 over 120ms, holds 80ms, then decays to 0 over 400ms.
- The interval is random between 8 and 14s, never closer than 8s, and there is never more than one flash per window.
- At the same moment the orb gets one small `split` jitter (orb `split` form param +0.15 for 300ms). Skip this in Calm mode.
- **Reduced motion or Calm mode:** there is no flash at all. Instead, a static horizon glow band (`radial-gradient` at the bottom, `rgb(200 190 255 / 0.06)`) and the tile text "Thunderstorm" with the lucide `CloudLightning` icon.

### 5.5 Reduced motion and Calm mode

- The sky renders one static frame and no rAF runs at all:
  - the gradient
  - stars, with no twinkle
  - clouds and fog at fixed positions
  - 30% of the particle count frozen as streaks or dots at their seeded positions
- Crossfades between scenes take 150ms of opacity.
- The condition is always in text: the tile and an `sr-only` summary inside the sky container's sibling live text (see section 13.2).

### 5.6 Hourly sky scrubbing (P2, needs `Ambient.hours`)

- In the live panel's Sky section there is a strip of 24 hour buttons, each 56px wide and 48px tall, in a horizontal list that wraps to two rows on phones.
- It also has "Earlier" and "Later" step buttons (`ChevronLeft`, `ChevronRight`, 48px, aria-labels) and a native `<input type="range">` for keyboard and screen readers.
- Selecting an hour sets `previewScene` and the SkyLayer crossfades to that hour's kind and phase. The temperature and condition shown become that hour's, labelled "18:00 forecast".
- "Now" (48px) returns. Leaving the panel also returns.
- No drag-only interaction.

---

## 6. The orb and its Halo

### 6.1 `VoiceOrb` (extend `components/ui/voice-orb.tsx`, keep its form-parameter engine)

New props:

```ts
interface VoiceOrbProps {
  state?: VoiceOrbState;                 // idle | connecting | listening | thinking | speaking | interrupted | muted | error
  tone?: "default" | "confirm";          // confirm => amber steady ring (send-for-me cards awaiting Confirm)
  level?: Level;
  bands?: () => Float32Array | null;     // P0: 16..24 bins 0..1 from AnalyserNode.getByteFrequencyData (fftSize 256)
  weather?: { family: SkyFamily; windKph: number; aqiSeverity: number; storm: boolean } | null;
  halo?: { clock: HaloClock; inner: HaloInner } | null; // when set, the canvas grows to halo size and draws the voice ring
  size?: number;                         // orb sphere diameter; canvas = halo ? size * 1.42 : size
  reducedMotion?: boolean;
  label?: string;
}
```

- **DPR cap.** Change it from 3 to 2.
- **Spectrum bands.** Low bins add to the wave height of the lower contour lines and high bins to the upper lines. This applies only in listening and speaking.
- **Weather offsets** are small and additive:

| Input | Effect |
|---|---|
| rain family | `wave` +0.08 travelling downward |
| snow | `dots` set to 0.6 with slow drift |
| fog | `ink` -0.15, back face +0.1 |
| `windKph` | `turn` speed `+ min(windKph, 60) / 600` |
| storm | the split jitter from section 5.4 |
| `aqiSeverity` 3 or higher | back-face lines tinted `--color-aqi-{n}` at 0.35 alpha through a CSS variable read once per change |

- **Colour.** The orb is drawn in `currentColor`. The state sets the colour class:
  - `text-accent` for idle, listening, speaking and connecting
  - `text-ink` for thinking
  - `text-signal` for the confirm tone and muted
  - `text-danger` for error
- **Reduced transparency.** The back face is 0, ink is 1 and the minimum line alpha is 0.5.

### 6.2 State motion: every state has its own movement and a word

| State | Movement (orb canvas) | Voice ring | Status word (EN) | Colour |
|---|---|---|---|---|
| idle | breathes, scale 1.00 to 1.03 over 5s | segments still at minimum length | (none shown; sr-only "Ready") | accent |
| connecting | slow single rotation, 2s | segments fill clockwise once | CONNECTING | accent |
| listening | waves run inward, driven by mic level and bands | segment length follows bands (rise 60ms, fall 250ms) | LISTENING | accent |
| thinking | outline still, inner light band sweeps every 1.8s | one lit 40-degree arc circles once per 1.8s | THINKING | ink |
| speaking | waves push outward, driven by TTS level and bands | segments follow the TTS bands | SPEAKING | accent |
| confirm (tone) | still, steady | full ring steady at mid length | WAITING FOR YOUR CONFIRMATION | signal |
| interrupted | squash, 300ms, then idle | collapse | (none; the message shows "Interrupted") | ink-muted |
| muted | dotted lines | hidden | MICROPHONE OFF | signal |
| error | one sideways settle (translateX 6px to 0, 400ms, no repeat) | hidden | SOMETHING WENT WRONG | danger |

**The status word.**

- It sits under the orb at `text-lead`, weight 600, `tracking-[0.08em]`, uppercase for Latin and Cyrillic and never uppercased for Chinese.
- It is localised, in `lib/ui-text.ts`, for mn, ru, en, de and zh.
- The same text is written to the single status live region (section 13.2).

**Reduced motion.** Each state is a still frame with a distinct shape: idle a solid sphere, listening a ring with a gap at the bottom, thinking a double ring, speaking three concentric rings, error a split sphere. States change with a 150ms opacity crossfade.

### 6.3 Halo (D2 signature, made honest and cheap)

**Geometry.**

| | Halo box | Sphere |
|---|---|---|
| Phone | 248px | 176px |
| Desktop at 1024px and wider | 340px | 240px |

**Clock ring** (outer; the static SVG `OrbHalo.tsx` overlaid on the canvas; P0):

- The radius is 0.47 of the box, centred. Midnight sits at the bottom and noon at the top, so daylight is up.
- **96 ticks.** One every 15 minutes, made with `stroke-dasharray` on a `<circle>`. Stroke is 1px in `--color-ink` at 0.45 alpha.
- **Major ticks.** Every 6 hours, as four 6px radial lines at 1.5px in ink at 0.8.
- **Daylight arc** (P0 via NOAA). An arc from sunrise to sunset at 1.5px in ink at 0.7. Sunrise and sunset each get a 6px tick in `--color-signal`.
- **Now marker.** A 6px `--color-accent` dot at `angle = nowMin / 1440 * 360`. It is rotated via `transform: rotate()` on a `<g>`, updated once a minute with no animation (a 150ms opacity blink is allowed), and it never spins.
- Meaningful strokes are at least 3:1 against the panel-dark sky. Ticks are decorative because the same facts are in text.

**Voice ring** (middle; drawn in the orb canvas, not SVG; P0):

- The radius is 0.40 of the box.
- 48 radial segments. Base length 3px, maximum 12px, 1.5px wide, round caps.
- Length follows `bands` (two segments per bin, mirrored left and right).
- Drawn in the same rAF as the orb, so it adds no React renders and no SVG transforms.

**Inner arc** (bottom 120 degrees under the sphere, SVG, P0):

- It shows **AQI severity** as 6 segments in `--color-aqi-1..6` with a 2px gap.
- The current segment is full alpha. The others are at 0.25.
- An ink ring marker sits at the current segment.
- **When rain is likely** (`days[0].precipChance >= 40`, or the current kind is in the rain family), it shows rain chance instead: one arc filled to that percentage in `rgba(170, 200, 255, 0.9)`.
- The words are always in the Air and Sky tiles, so the arc is never the only cue.

**Landing surface.** The halo element carries `data-sky-surface="arc"` on its clock ring radius.

**Hit area.** The halo is one `<button>` (the "core"). It is at least the sphere diameter plus 16px.

| State | `aria-label` |
|---|---|
| idle | "Start listening" |
| listening | "Stop listening" |
| speaking | "Stop speaking" |

### 6.4 Dock (orb moves into the top bar, D1)

- When the first message exists, the core animates to the top bar: a 40px sphere with no halo, inside a 48px button. It uses motion `layoutId="aspire-core"` (spring, bounce 0, duration 0.45) and moves on transform only.
- "New conversation" undocks it again.
- **Reduced motion:** a crossfade instead of the layout move.

### 6.5 Edge glow (D1 and D2, Siri-style but with a job, P1)

- `EdgeGlow.tsx`: a fixed 2px inset frame. It uses `box-shadow: inset 0 0 0 2px var(--edge), inset 0 0 24px 0 var(--edge-soft)` on a full-screen `pointer-events-none` div, and only its opacity changes.
- **Hue:** `--edge` is a mix of 70% `--sky-horizon` and 30% `--color-accent`. When AQI severity is 4 or higher, the outer 1px uses `--color-aqi-{n}`.
- **Opacity by state:**

| State | Opacity |
|---|---|
| idle | 0 |
| listening | 0.6 |
| speaking | 0.35 |
| thinking | 0.2 |
| confirm | 0.5 |
| error | 0.5, using `--color-danger` |

- Fade over 250ms in and 160ms out.
- **Reduced transparency:** a solid 2px `--color-accent` border while listening, and nothing otherwise. **Calm mode:** off.

---

## 7. Layouts

Breakpoints are the Tailwind defaults: phone below 768px, tablet 768-1023, desktop 1024 and up, wide 1280 and up. Spacing uses an 8px grid (Tailwind `--spacing: 0.25rem`, so use even steps).

| Width | Gutter |
|---|---|
| phone | 16px |
| tablet | 24px |
| desktop | 32px |

Safe areas: use `env(safe-area-inset-*)` for the top bar and the composer.

### 7.1 Phone, empty state (no conversation yet), 375 x 667 worst case

```
+-------------------------------------------+
| [o] ASPIRE   [MapPin Erdenet]   [Sun][=]  |  top bar 56 (48px buttons). [o] = dot until docked
|                                           |
|        . live sky (full bleed) .          |
|              .-''''''-.                   |  halo 248 (clock ring, voice ring)
|            /   ORB 176  \                 |  rain splashes / snow settles on the top arc
|            \            /                 |
|              '-.AQI.-'                    |  inner arc (AQI or rain chance)
|   +-----------------------------------+   |
|   | Good evening, sir. How is it      |   |  greeting panel: text-greeting, 1-2 lines
|   | going?                 LISTENING  |   |  status word (only when not idle)
|   +-----------------------------------+   |
| +------------------+ +------------------+ |  tile sill, 2 x 2, gap 8
| | SKY NOW   [Snow] | | AIR      [Leaf]  | |  each tile 104-112 tall, data-sky-surface="edge"
| | -12 deg          | | 52               | |  value: text-value Tektur
| | Light snow       | | Moderate [######]| |  word: text-body 500
| +------------------+ +------------------+ |
| +------------------+ +------------------+ |
| | ROAD    [Car]    | | BUS 12   [Bus]   | |
| | +6 min           | | 4 min            | |
| | to the centre    | | Central Square   | |
| +------------------+ +------------------+ |
|  (scroll) 3 context starter chips         |
| +---------------------------------------+ |
| | Type or tap the mic...      ( MIC 56 )| |  composer, fixed bottom, panel
| +---------------------------------------+ |
+-------------------------------------------+
```

**Height budget at 667:**

| Element | Height |
|---|---|
| Top bar | 56 + safe area |
| Halo | 248 |
| Greeting | 88 |
| Tiles | 2 x 108 + 8 = 224 |
| Composer | 80 |

That totals 696, which is 29px over. The halo therefore shrinks to 216 (sphere 152) when `innerHeight < 720`, giving 664. The starter chips scroll below.

**Phone top bar.**

- The wordmark.
- The place chip: a button showing `MapPin` and the place name, max 14ch with ellipsis. It opens the live panel at Sky and its `aria-label` gives the full place name.
- `Sunrise` (morning briefing, 48px).
- `Menu` (48px), which opens the Control sheet: Memory, Connections, Settings, Text size, Calm mode, and New conversation when one exists.

The five separate icons from v2 do not fit at 343px.

### 7.2 Phone, conversation state

```
+-------------------------------------------+
| (o) ASPIRE  [Erdenet]   SPEAKING  [Sun][=]|  docked 40px orb in 48px button; status word
| +-------++-------++--------++----------+  |  ambient bar: 4 buttons, each >= 64 tall
| |Snow   ||Air    ||Road    ||Bus 12    |  |  line 1: icon + word (16px)
| |-12 deg||52     ||+6 min  ||4 min     |  |  line 2: value (text-value-sm, Tektur)
| +-------++-------++--------++----------+  |
|                                           |
|                     +------------------+  |  user bubble: panel-2, right, max 85%
|                     | Will it snow at 6|  |
|                     +------------------+  |
| +---------------------------------------+ |
| | [CloudSnow] Weather   [Check]         | |  tool ledger (16px rows)
| | Yes, sir. Light snow from about six,  | |  reply: text-reply 20px, panel
| | minus fourteen by nine.               | |
| | [Volume2][Copy][RotateCw]             | |  48px actions
| +---------------------------------------+ |
|  [Hourly] [Air quality] [Tomorrow]        |  follow-up chips (wrap)
| +---------------------------------------+ |
| | Type or tap the mic...      ( MIC 56 )| |
| +---------------------------------------+ |
+-------------------------------------------+
```

- The 2x2 tiles collapse into the ambient bar with a shared `layoutId` per tile (`tile-sky`, `tile-air`, `tile-road`, `tile-bus`).
- The ambient bar is `sticky` under the top bar. It has 4 equal columns with an 8px gap, and each button is at least 64px tall.
- At A++ text size, or when any label overflows, it becomes 2 x 2.
- The sky stays full-bleed at 0.6x particle density. It shows through the gutters and gaps only.

### 7.3 Tablet (768-1023)

- A phone layout centred at max 640px.
- The tiles sit in one row of 4 (each about 150px wide) instead of 2x2.
- The halo is 280px.

### 7.4 Desktop 1024-1279: centre and one telemetry rail

```
+----------------------------------------------------------------------------------+
| ASPIRE   [MapPin Erdenet, Mongolia]       [Sunrise Briefing][Brain Memory]        |
|                                           [Cable Connections][Settings]           |
|                                                                                  |
|                 .-''''''''-.                              +--------------------+ |
|               /             \                             | SKY NOW    [Snow]  | |
|              |   ORB 240     |                            | -12 deg  Light snow| |
|               \             /                             | Feels -18          | |
|                 '-.._AQI_..-'      (halo 340)             +--------------------+ |
|                                                           | AIR        [Leaf]  | |
|        Good evening, sir. How is it going?                | 52 Moderate [####] | |
|                                                           +--------------------+ |
|        [transcript column, max 720px, panels]             | ROAD      [Car]    | |
|                                                           | +6 min to centre   | |
|                                                           +--------------------+ |
|                                                           | BUS 12    [Bus]    | |
|        +--------------------------------------------+     | 4 min Central Sq.  | |
|        | Type or tap the mic...          ( MIC 56 ) |     +--------------------+ |
|        +--------------------------------------------+       rail 340, ticks     |
+----------------------------------------------------------------------------------+
```

- Grid: `grid-cols-[minmax(0,1fr)_340px]` with a 32px gap. The centre column's content max width is 720px.
- Top bar icons carry visible text labels on desktop.
- Rail tiles are about 112px tall, have corner ticks (section 3.4), and are `sticky top-[88px]`.
- In conversation state the halo docks to the top bar exactly as on phone. The rail stays and is the desktop's ambient bar.

### 7.5 Desktop 1280 and up: edge telemetry around a clear centre

```
+------------------------------------------------------------------------------------------+
| ASPIRE  [Erdenet, Mongolia]                         [Briefing][Memory][Connections][Set] |
| +-----------------+                                                 +-----------------+  |
| | SKY NOW         |                 .-''''''''-.                    | AIR             |  |
| | -12 deg         |               /    ORB 240   \                  | 52  Moderate    |  |
| | Light snow      |               \   halo 340   /                  | [###### meter]  |  |
| | 3-day range bars|                 '-..______..-'                  | PM2.5           |  |
| +-----------------+       Good evening, sir. How is it going?       +-----------------+  |
|                                                                     | ROAD  +6 min    |  |
|                          [ transcript column 720 ]                  +-----------------+  |
|                                                                     | BUS 12  4 min   |  |
|                          [ composer 720 ]                           +-----------------+  |
+------------------------------------------------------------------------------------------+
```

- Grid: `grid-cols-[300px_minmax(0,720px)_300px] justify-between`.
- The left rail holds Sky now plus a mini 3-day list. The right rail holds Air, Road and Bus.
- The urgent tile always goes to the top of its rail and gets a 2px `--color-signal` left rule plus the word "Now".

### 7.6 Urgency reorder (all sizes, P0, `lib/urgency.ts`)

The rank is computed whenever Ambient updates. The first matching rule wins and its tile moves first:

1. AQI severity 4 or higher puts **Air** first, adding an advice line.
2. Rain or snow now, or `days[0].precipChance >= 60` within 2h, puts **Sky** first. (Within-2h precision is P2 and needs `hours`; P0 uses "precipitating now".)
3. A bus due within 10 minutes (`min(stops[].lines[].minutes) <= 10`) puts **Bus** first.
4. Traffic `heavy` or `delayMin >= 10` puts **Road** first.
5. Otherwise the order is Sky, Air, Road, Bus.

**Phone 2x2:**

- The urgent tile spans both columns: 112px tall with its value and words side by side.
- The remaining three take one row of 3 at 104px if the width allows (at least 360px), otherwise they wrap.
- The reorder animates with `layout` (spring, bounce 0) and crossfades under reduced motion.

**Voice-routed promotion** (D3, P1): when the intent router runs a weather, air, traffic or transit tool, that tile becomes the urgent tile for 20s via the same layout animation.

---

## 8. Tiles and ambient bar (`components/aspire/live/`)

Each tile is a `<button>` that opens the live panel at its section.

**Tile structure (phone grid and desktop rail):**

- `.panel`, `rounded-lg` (22px), padding 16px, `min-h-[104px]` (urgent 112px), `data-sky-surface="edge"`.
- Line 1: the uppercase `text-label` in `ink-faint`, with a 24px lucide icon on the right (`aria-hidden`).
- Line 2: the value in `text-value` Tektur, `tabular-nums`, `ink`.
- Line 3: the word in `text-body` weight 500, `ink`, plus at most one secondary line in `text-small` `ink-muted`.
- `aria-label` is one full sentence (examples below). Children are `aria-hidden` to avoid double reading.

| Tile | Label | Value | Word / secondary | Icon | aria-label example |
|---|---|---|---|---|---|
| Sky now | SKY NOW | `-12 deg` (unit per locale, section 12) | condition text ("Light snow"); secondary "Feels -18" | condition icon (map below) | "Weather: light snow, minus 12 degrees, feels like minus 18." |
| Air | AIR | `52` | band word ("Moderate") + 6-segment meter; secondary scale tag "US AQI" | band icon | "Air quality moderate, 52 on the US scale, main pollutant PM2.5." |
| Road | ROAD | `+6 min` (or "Clear") | level word ("Moderate traffic"); secondary `towards` ("to the city centre") | CarFront / Gauge / TrafficCone | "Traffic moderate, about 6 minutes extra to the city centre." |
| Bus | BUS + line badge | `4 min` | stop name; secondary "5 min walk", plus Live or Scheduled as icon and word | Bus | "Bus 12 in 4 minutes from Central Square, scheduled time, 5 minute walk." |

**Condition icons** (lucide only; day and night variants):

| Kind | Icon |
|---|---|
| clear | `Sun` / `Moon` |
| partly | `CloudSun` / `CloudMoon` |
| cloudy | `Cloud` |
| fog | `CloudFog` |
| drizzle | `CloudDrizzle` |
| rain | `CloudRain` |
| storm | `CloudLightning` |
| snow | `CloudSnow` |
| sleet | `CloudHail` |
| hail | `CloudHail` |
| wind label | `Wind` |

**AQI band icons:**

| Severity | Icon |
|---|---|
| 1 | `Leaf` |
| 2 | `Wind` |
| 3 | `TriangleAlert` |
| 4 | `ShieldAlert` |
| 5 | `ShieldAlert` |
| 6 | `OctagonAlert` |

**AQI meter** (`AqiMeter.tsx`):

- 6 flat segments, each `flex-1`, 8px tall with `rounded-sm` and a 3px gap.
- Inactive segments are at 0.25 opacity and the current one at 1.
- The marker is a 14px ring (2px `--color-ink` stroke, panel fill) centred on the current segment. It moves by `translateX` with a spring (bounce 0) and snaps under reduced motion.
- `role="meter"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="500"` and `aria-valuetext` set to the sentence.
- No text ever sits on a segment.

**Traffic strip** (`TrafficStrip.tsx`):

- 4 cells (free, slow, jam, heavy), each 24x8px.
- The current level and the ones below it are filled. Each has a distinct pattern for colour-blind users:

| Level | Pattern |
|---|---|
| free | solid |
| slow | long dash (repeating-linear-gradient 6px on, 3px off) |
| jam | short dash (3 on, 3 off) |
| heavy | short dash, 12px tall |

- The level map is light to free, moderate to slow, and heavy to jam. Heavy also counts when `ratio >= 1.8`.

**Line badge** (`LineBadge.tsx`):

- `min-w-[44px] h-8 rounded-sm px-2`, Tektur 18px weight 600.
- The fill is the agency colour (`line.color`), falling back to `--color-panel-3`.
- The text is `line.textColor` if its contrast is at least 4.5:1. Otherwise it is whichever of `#0B1220` or `#F2F6FC` scores higher (computed at render, `lib/contrast.ts`).
- If there is no short name, show a lucide `Bus`, `TramFront` or `TrainFront` icon with an `aria-label`.

**Ambient bar** (conversation state, phone and tablet). The same four tiles render in `variant="bar"`:

- 64px tall.
- Line 1: a 20px icon plus the word (16px), e.g. "Snow", "Air", "Road", "Bus 12".
- Line 2: the value at `text-value-sm`, with full words: "+6 min", never "+6m".
- Same `aria-label`s, same `layoutId`s.

**Loading and empty.**

- **Loading:** a skeleton tile with a static panel and a `ink-faint` 40% block. There is no shimmer when motion is reduced. Otherwise one scan sweep plays per load (section 11).
- **No data for a module:** the tile still renders with the word "Not available here" and stays tappable, opening an explanation.

**Bus tile without arrival data:** value "240 m", word "Nearest stop", secondary "3 min walk". Tapping it opens the panel, which has a Directions button.

---

## 9. Live panel (`LivePanel.tsx`, in `Sheet`)

- One sheet with four sections in this order: Sky, Air, Road, Transit. The urgency order does not apply inside the panel.
- Opening it from a tile scrolls to that section and moves focus to its heading (`tabIndex=-1`).
- A segmented control at the top (4 buttons, 48px, `aria-pressed`) jumps between sections.
- The panel title is the place name, e.g. "Erdenet, Mongolia".
- A footer gives the source and time, in `text-small` and `ink-faint`: "Weather: Google. Air: Open-Meteo. Updated 18:42."

### Sky

- **Hero line:** `text-hero` temperature with the condition word (`text-lead`) and icon. Secondary: feels-like, humidity, wind (`Wind` icon with "14 km/h").
- **3-day range bars:** 48px rows. Each row shows:
  - the day name, localised short weekday, with "Today" for the first
  - the condition icon
  - `precipChance` as text ("40%") with a `Droplets` icon when 20 or more
  - min, a bar and max
- **The bars** sit on one shared scale across the 3 days. The track is `panel-2` and the fill is a cold-to-warm gradient (`#8FB2FF` to `#F5C26B`). Today's row has a 10px ink dot at the current temperature.
- **Hourly scrub:** P2, section 5.6.

### Air

- Value at `text-value` with the band word and `AqiMeter` at full width (12px segments), plus the scale tag ("US AQI" or "UAQI, higher is better" when normalised).
- The dominant pollutant: "Main pollutant: PM2.5 (18 ug/m3)".
- One Jarvis advice line at `text-reply`, chosen from the severity. It uses the Google `healthRecommendations.elderly` when present, shortened to one sentence. Examples:
  - severity 1-2: "The air is clean, sir. A good time for a walk."
  - severity 4: "The air is unhealthy this evening, sir. I would keep the windows closed."

### Road

- The headline: "+6 min to the city centre" at `text-value`, or "Clear, no delay".
- `TrafficStrip` and the level word with its icon.
- A Directions button (48px, opens Google Maps driving to the probe destination).

### Transit

- A "Nearby stops" list sorted by walking time, with at most 4 stops.
- **Each stop:** the name (`text-body`, 600), then "240 m, 3 min walk" (`ink-muted`), then up to 3 departure rows, then a Directions button (48px, `Footprints` icon plus text, opens Google Maps walking).
- **Departure row** (`DepartureRow.tsx`): min height 56px.
  - Left: `LineBadge` and the headsign ("to Central Square", 16px).
  - Right: the countdown at `text-eta` with `tabular-nums` and an opacity crossfade on change. Under 1 minute it reads "Now"; over 60 it reads as the clock time "14:32".
  - Below the countdown, the status:

| Status | Icon | Word | Colour |
|---|---|---|---|
| live | `Radio` | "Live" | `text-success` |
| scheduled | `Clock` | "Scheduled" | `ink-muted` |
| delayed | `TriangleAlert` | "Delayed 3 min" | `text-signal` |

  - Status always shows as icon plus word. There is no pulsing.
  - The last departure of the day gets the tag "Last".
- **Empty state when there are no lines** (common worldwide; design this first): "Live times are not available here. The nearest stop is a 3 minute walk." followed by a Directions button.
- **No stops within 1 km:** "No stops close by. I can plan a route if you tell me where you are going."

---

## 10. Chat, messages, tool chips, composer, suggestions

### 10.1 Thread (`components/aspire/chat/Thread.tsx`)

- The `<ol>` has no `aria-live` (remove it). Each `<li>` carries `lang`.
- **User message:** right-aligned, max 85%, `panel-2`, `rounded-lg` with a 6px bottom-right corner, `text-body` `ink`.
- **Assistant message:** full width, `.panel`, padding 20px, `text-reply`, max 65ch. Links are `text-accent-2` and underlined.
- **Actions row** (always visible on touch; on desktop also shown on hover and focus-visible): `Volume2` replay, `Copy`, and `RotateCw` retry. Each is 48px with an aria-label. The v2 `size-9` button is gone.
- **Tool ledger** (replaces the 12px step chips): a vertical list of 16px rows, each with a lucide icon for the tool, then the label, then a status icon:

| Status | Icon |
|---|---|
| pending | `LoaderCircle`, static under reduced motion |
| done | `Check` in `text-success` |
| failed | `X` in `text-danger` |

  There is no strikethrough.

| Tool | Icon |
|---|---|
| weather | `CloudSun` |
| air | `Wind` |
| maps | `Navigation` |
| transit | `Bus` |
| gmail | `Mail` |
| reminders | `Bell` |
| send | `Send` |
| research | `Search` |
| calendar | `CalendarDays` |

- **Sources:** `text-small` (16px) links in a wrap list, 48px tall tap rows on phone.
- **Thinking row:** a placeholder panel with a static 1px accent hairline that sweeps once per 1.8s by `translateX` (static under reduced motion), plus one Jarvis line in `ink-muted`: "One moment, sir." `animate-pulse` is removed.
- **Interrupted reply:** text at `ink-muted` with a small "Interrupted" label. Barge-in is P1: tapping the core while speaking stops TTS and starts listening.
- **Follow the stream:** auto-scroll only when the user is within 80px of the bottom. Otherwise show a 48px "Jump to latest" pill (`ArrowDown`, aria-label) above the composer.
- **Entry motion:** opacity 0 to 1 and y 8 to 0, spring 0.35. Remove `filter: blur(4px)`.
- **Karaoke word highlight:** P2. It needs word boundaries from `/api/speak`.

### 10.2 Result cards

Weather, directions, transit, briefing and send-for-me cards use `.panel` with the same type scale.

- **Weather card:** a 64px temperature, the condition, and 48px day rows with range bars.
- **Transit card:** one headline answer at 28px ("Bus 12 in 4 min, from Central Square"), identical to the sentence Jarvis speaks, then the rail.
  - The rail: a dashed neutral line for walking and a solid line in the line colour for riding.
  - "8 stops" is a collapsible 48px button.
  - Walking legs carry a weather note when relevant, e.g. `CloudSnow` "4 min walk, light snow".
- **Send-for-me card:** shows a draft, then Confirm and Cancel buttons (56px and 48px). While pending, the orb tone is confirm (amber).
  - The send-for-me flow (draft, confirm, sent) stays in one card or sheet and morphs its content with `AnimatePresence mode="popLayout"`. It never opens a second modal.
  - The "sent" state shows `Check` with the word "Sent".
  - `WebhookField`'s check-mark glyph becomes lucide `Check`, and the reminders repeat glyph becomes lucide `Repeat`.

### 10.3 Composer (`Composer.tsx`, fixed bottom)

- `.panel` with `rounded-xl`. Padding is 8px 8px 8px 16px, plus `pb-[max(8px,env(safe-area-inset-bottom))]` on the outer wrapper. Max width: the content column.
- A `textarea` at `text-body` with 1 to 4 rows. Placeholder "Type or tap the mic" in `ink-faint`.
- **One 56px primary button** that morphs. The icon crossfades by opacity plus scale 0.9 to 1 (spring, bounce 0):

| Composer state | Icon | Fill | aria-label |
|---|---|---|---|
| empty draft | `Mic` | `bg-accent text-on-accent` | "Start listening" |
| text present | `ArrowUp` | accent | "Send" |
| listening or speaking | `Square` | `bg-panel-3 text-accent` | "Stop" |

- One secondary 48px button, `Keyboard` or `Paperclip`: P1 and optional. No Search, Think or Canvas pills.
- **While listening**, the textarea is read-only and shows the interim transcript (`text-body`, `ink-muted`). It also shows:
  - a 2-letter language tag in text ("MN", "ZH", "EN", "RU", "DE"), not a flag
  - an mm:ss timer in `tabular-nums`
  - a 24px tall canvas waveform driven by the real AnalyserNode level
  - under reduced motion, a static level bar instead

### 10.4 Suggestions (`lib/suggestions.ts`, `Suggestions.tsx`)

- **Starters (empty state):** 3 on phone and 4 on desktop, built by `buildSuggestions(ctx)` from the weather, AQI, local hour, nearest stop, briefing availability and locale currency.
  - Examples: "Will it rain at 6?", "Read my morning briefing", "Next bus from Central Square", "Is it safe to run outside?", "100 dollars in euros" (the currency pair comes from the locale).
  - The Mongolia-only tugrik starter is deleted.
- **Follow-ups:** 2 or 3 chips under the latest reply, keyed to the tool that ran. They clear when one is tapped or a new turn starts.
- **Chips:** `min-h-14` (56px), `text-body`, `.panel-2`, `rounded-full`, a 20px lucide icon plus text. They wrap and are never placed in a horizontal scroll strip.
- **Motion:** stagger 50ms, once only.
- **Voice parity** (P1): when the live transcript matches a chip label, that chip plays one opacity pulse.
- `Wand2` becomes `Send` for messaging.

---

## 11. Motion spec

| Item | Spec | Reduced motion and Calm mode |
|---|---|---|
| UI spring | `{type:"spring", bounce:0, duration:0.35}`; exits 0.23 | 150ms opacity |
| Press | scale 0.97 within 100ms (the `.press` class, 140ms ease-out-strong) | colour change only |
| Sheet open | translateY 100% to snap, spring 0.38; side panel translateX | 150ms opacity |
| Message enter | opacity 0 to 1, y 8 to 0, 0.35 | opacity only |
| Tile entrance | once per session, y 8 to 0, stagger 50ms | none |
| Tile reorder and promotion | `layout`, spring 0.4 | instant |
| Orb dock | `layoutId`, spring 0.45 | crossfade 150ms |
| Number change | opacity plus translateY 6px roll, 180ms | instant |
| AQI marker | translateX spring 0.35 | instant |
| New data sweep | one 1px accent line, translateY 0 to 100% of the card, 700ms ease-out, then fades | none |
| Sky kind or phase change | 1.2s opacity crossfade | 150ms |
| Clouds and fog drift | translateX, 60-110s loops | frozen |
| Lightning | as in section 5.4 | none, static horizon band |
| Orb idle breath | 5s per cycle (no faster than 1 per 1.5s anywhere) | still frame |
| Edge glow | opacity 250ms in, 160ms out | off |
| Greeting | one shimmer: opacity 0.6 to 1 across the line by mask translateX, 600ms, on first load only | none |

**Budget:** at most 2 moving DOM elements per view at once, plus the two canvases. Every animation can be interrupted and none blocks input. Nothing loops except the sky, the orb and the cloud and fog drift.

---

## 12. Every country, every city

- **Location:** `Ambient.place` and `coords` come from the device (opt-in) or the network. Never default to Erdenet. With no location, show "Location off" with a 48px "Use my location" button.
- **Units** come from `navigator.language` and the region (`Intl.Locale(...).region`). The US, Liberia and Myanmar use F, mph and miles; everyone else uses C, km/h and km. Settings can override.
- **Time:** `Intl.DateTimeFormat(lang, { timeZone: Ambient.timeZone, hour: "numeric", minute: "2-digit" })`. That gives a 12h or 24h clock per locale, in the place's time zone.
- **Numbers:** `Intl.NumberFormat`. Write minus signs as U+2212 in display, and as words in TTS.
- **AQI scale:** use the local index when Google returns one, otherwise UAQI. Normalise everything to severity 1-6 and always show the scale name.
- **Transit:** every string assumes no live feed until proven otherwise (section 9).
- **The sky** is abstract and procedural: no landmarks, mountains, palms or flags.

---

## 13. Accessibility rules

### 13.1 Targets and focus

- All interactive elements are at least 48x48px with 8px gaps. The primary mic is 56px. The orb core is at least the sphere plus 16px.
- Raise every `size-9`, `size-10` and `size-11` to `size-12`. The Sheet close button is `size-12`.
- `:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 3px; }`. On accent fills, use the `--color-ink` outline.
- A skip link ("Skip to conversation") is the first focusable element.
- Tab order follows the visual order (top bar, core, greeting, tiles, thread, composer).

### 13.2 Live regions (exactly two)

1. **Status region:** `role="status"`, polite. It carries the state word ("Listening", "Thinking", "Speaking", "Waiting for your confirmation") and, on Ambient updates, a single condition sentence at most once per 10 minutes ("Light snow, minus 12, air quality moderate").
2. **Reply region:** an `sr-only` `<div aria-live="polite">` that receives only the newest finished assistant reply text. Cards and sources are never re-announced.

### 13.3 Sheets

- `role="dialog"`, `aria-modal`, labelled by the title.
- A focus trap (Tab cycles inside the sheet) and `inert` on the app root while open.
- Escape closes it and focus returns to the opener.

### 13.4 User controls (Settings and the Control sheet; persisted to `localStorage` and the user profile)

- **Text size:** A, A+ and A++ set `html { font-size: 100% | 112.5% | 125% }`. All sizes are in rem. The layout must work at A++ plus 200% browser zoom at 375px, wrapping and never truncating except the place chip, which shows its full name in the aria-label and in the panel.
- **Calm mode:** sets `data-calm="true"` on `<html>`, which applies the full reduced-motion and reduced-transparency path: static sky, still orb, no lightning, no edge glow, opaque panels. It defaults to the OS setting.
- **Form of address:** "sir" (default), "madam" or the user's first name. The greeting and replies use it.
- **Units:** auto, metric or imperial.

### 13.5 Content

- Weather, AQI, traffic and transit always carry text plus an icon. The canvas carries no information on its own.
- Errors are spoken and shown with the cause and the fix ("I could not reach the weather service, sir. Shall I try again?") and a 56px Retry button.
- Toasts do not take focus and stay at least 6s.

### 13.6 Contrast and motion tests (CI, `web/lib/__tests__/`)

- **`contrast.test.ts`:**
  - Blends every text token over `#FFFFFF` at panel alpha 0.88 and asserts at least 4.5:1, and `ink` and `ink-muted` at least 7:1.
  - Asserts non-text tokens (`aqi-*`, `traffic-*`) are at least 3:1 under the same blend.
  - Asserts `on-accent` on accent, signal and danger is at least 4.5:1.
- **`sky-scene.test.ts`:** phases for Erdenet, Lagos, Oslo, Tromso in June and December, Sydney and Quito; moon phase on known dates; the fallback with no coords.

---

## 14. Persona, greeting and no-emoji enforcement

### 14.1 Greeting (`lib/greeting.ts`; P0)

The greeting is `greeting(lang, address, now, ambient, firstOfSession)`.

**Part of day, in the place's time zone:**

| Hours | Part |
|---|---|
| 05-11 | morning |
| 12-17 | afternoon |
| 18-04 | evening |

Never use "Good night", which is a farewell.

**The rule:**

1. Sentence 1 is always the time-of-day greeting with the form of address.
2. Sentence 2 depends on the case:
   - **First open of the session and nothing notable:** "How is it going?"
   - **Something notable** (precipitation now, AQI severity 4 or higher, a bus within 10 minutes, heavy traffic): exactly one fact.
     - "Light snow, minus twelve."
     - "The air is unhealthy this evening."
     - "Your bus leaves in four minutes."
   - **Later opens:** sentence 1 only.

The greeting never lists capabilities, never uses exclamation marks and never uses emojis. It is shown and spoken identically.

**Templates** (`ui-text.ts`; builders may refine the wording but not the structure):

| Lang | Template (evening) |
|---|---|
| en | "Good evening, sir. How is it going?" |
| mn | "Оройн мэнд, эрхэм ээ. Сайн байна уу?" |
| ru | "Добрый вечер, сэр. Как ваши дела?" |
| de | "Guten Abend, Sir. Wie geht es Ihnen?" |
| zh | "晚上好，先生。今天过得怎么样？" |

**Display:** the greeting panel on the empty state, at `text-greeting`, weight 500, upright. It is spoken on first open only if the user has enabled voice greeting. The default is to speak after the first tap, because autoplay is blocked.

**Model prompt (`lib/brain`):**

- Add the persona rules: polite, composed, concise; address the user by the chosen form; one short greeting.
- Never list capabilities. Never use emojis, emoticons or decorative Unicode symbols. Use plain words.

### 14.2 Speech text

TTS input passes through the same sanitiser.

- Numbers with minus signs become words ("minus twelve").
- Units are spoken in full ("degrees", "minutes").

### 14.3 No-emoji enforcement

**`lib/no-emoji.ts`:**

- Exports `stripPictographs(s)`, which removes `\p{Extended_Pictographic}`, the variation selector U+FE0F, zero-width-joiner (U+200D) sequences and the ranges U+2190-21FF, U+2300-23FF, U+2600-27BF and U+2B00-2BFF.
- It is applied to model output before display and before TTS.
- Typographic punctuation (the middle dot, en and em dashes, curly quotes, the U+2212 minus) is allowed.

**`no-emoji.test.ts`:**

- Scans `web/app`, `web/components` and `web/lib` (`.ts`, `.tsx`, `.css`) for the same pattern and fails on any hit outside `no-emoji.ts` and the test itself.
- The current offenders are the check mark in `WebhookField` and the repeat arrow in reminders.

---

## 15. Sheets (`components/aspire/Sheet.tsx` upgrade, P0)

- **Props:**

```ts
{ open: boolean; title: string; closeLabel: string; onClose: () => void; snapPoints?: number[] /* default [0.6, 0.92] */; initialSnap?: number; children: React.ReactNode }
```

  The live panel uses `[0.3, 0.6, 0.92]` with `initialSnap: 1`.
- **Phone:** a bottom sheet with `rounded-t-xl`. Snap points are fractions of the viewport height.
  - The sheet uses `drag="y"` with `dragListener={false}`. Dragging starts from the grabber and header via `useDragControls`, or from the content only when `scrollTop === 0` and the pointer moves down.
  - **On release:**
    - Project the resting point: `projected = y + velocity.y * 0.2`.
    - Snap to the nearest point with spring `{bounce:0, duration:0.38}`.
    - Dismiss when the drag passes 35% of the sheet height below the lowest snap, or when the velocity exceeds 600.
- **Grabber:** a real `<button>`, 48px tall and full header width, with a 40x5 visual bar. `aria-label="Resize panel"` and `aria-valuetext` gives the current snap ("Half height").
  - Enter and ArrowUp step up, ArrowDown steps down.
  - The new size is announced through the status region.
- **Backdrop:** `bg-bg` with opacity `useTransform(y, [snapTop, closed], [0.55, 0])`. Behind the sheet, the content scales 1 to 0.97 (transform only).
- **Top hairline:** a 1px `linear-gradient(90deg, transparent, var(--sky-horizon), transparent)` at 0.6 opacity. It is solid `--color-line-strong` under reduced transparency.
- **Desktop at 1024px and wider:** an inset side panel, 12px from the top, right and bottom edges, 440px wide, `rounded-xl` on all corners, sliding in on translateX. It has no snap points.
- **Header:** the title at `text-lead`, weight 600, and a close button `size-12` with an `X` icon and the aria-label.

---

## 16. Login page (`components/LoginForm.tsx`, P0)

```
+-------------------------------------------+
|        (live sky: phase from clock,        |
|         clear, no particles, stars at      |
|         night)                             |
|              .-''''-.                      |
|             ( ORB 160 )   idle, halo clock |
|              '-....-'     ring only        |
|                ASPIRE                      |  Tektur wordmark 28px, tracking 0.28em
|     Your voice assistant, in any city.     |  text-lead, ink-muted (localised)
|  +-------------------------------------+   |
|  | [Clock] You were signed out...      |   |  expired notice, panel, role=status
|  +-------------------------------------+   |
|  +-------------------------------------+   |
|  |        Clerk <SignIn> card           |   |  panel styling via appearance
|  +-------------------------------------+   |
|        Privacy  .  Terms  (16px, 48px)     |
+-------------------------------------------+
```

- **Sky:** SkyLayer with `sceneFrom(null, new Date())`. There is no location request on the login page.
- **The orb** shows the halo clock ring (sunrise and sunset unknown, so no daylight arc, only ticks and the now marker).
- **Clerk appearance variables:**

| Variable | Value |
|---|---|
| `colorBackground` | `#0B1220` |
| `colorPrimary` | `#5EE7FF` |
| `colorPrimaryForeground` | `#0B1220` |
| `colorForeground` | `#F2F6FC` |
| `colorMutedForeground` | `#B6C2D6` |
| `colorNeutral` | `#F2F6FC` |
| `colorInput` | `#121C2E` |
| `colorInputForeground` | `#F2F6FC` |
| `colorDanger` | `#FF8A8A` |
| `colorSuccess` | `#5BE3A4` |
| `borderRadius` | `16px` |
| `fontSize` | `1.125rem` |

  Elements: the card gets `panel` and buttons get `min-h-12`.
- **Links:** Privacy and Terms links have 48px tall tap areas and are `text-small` (16px, up from the 14px `text-sm`).
- **Viewport:** `themeColor: "#060B16"`.
- **Metadata:** the description no longer mentions Erdenet only: "Aspire, a Jarvis-style voice assistant for any city. Ask out loud in Mongolian, Chinese, English, Russian or German."

---

## 17. Data contract additions (`lib/ambient-types.ts`; all additions optional, so P0 UI must work without them)

```ts
export interface AmbientSky { /* existing */ windDirDeg?: number | null; }          // P1
export interface AmbientLine {
  route: string; minutes: number;
  live?: boolean;                 // P0: false/undefined => "Scheduled"
  delayMin?: number | null;       // P1
  headsign?: string | null;       // P1
  color?: string | null;          // P1: Routes API transitLine.color
  textColor?: string | null;      // P1: transitLine.textColor
  last?: boolean;                 // P1
}
export interface AmbientStop { /* existing */ lines?: AmbientLine[]; }
export interface AmbientAir { /* existing */ scale?: "US_AQI" | "UAQI" | string; advice?: string | null; } // P1
export interface AmbientHour { time: string; tempC: number; kind: SkyKind; isDay: boolean; precipChance: number | null; } // P2
export interface Ambient { /* existing */ hours?: AmbientHour[]; }                   // P2
```

- Sunrise, sunset, sun position and moon phase are computed client-side (`lib/sun.ts`). The API does not need to change for them.
- `GET /api/ambient` (server only, keys from env):
  - Google Weather, then Open-Meteo.
  - Google Air Quality with `LOCAL_AQI`, `HEALTH_RECOMMENDATIONS` and `DOMINANT_POLLUTANT_CONCENTRATION`, then Open-Meteo `us_aqi`.
  - Routes traffic probe.
  - Places (New) nearby `bus_station` and `transit_station`.
  - Response: `Cache-Control: private, max-age=300`.
- The client hook `useAmbient()` refetches every 5 minutes while visible.

---

## 18. Build ownership (11 builders, no shared files except via the contracts above)

| # | Builder | Owns (create or edit) | Exposes |
|---|---|---|---|
| 1 | Tokens, fonts, prefs | `app/globals.css`, `app/layout.tsx`, `lib/prefs.ts`, `lib/contrast.ts`, `lib/__tests__/contrast.test.ts`, `lib/no-emoji.ts`, `lib/__tests__/no-emoji.test.ts` | `.panel`, tokens, `useMotionPolicy()` (`{reduced, calm, reducedTransparency}`), `useTextSize()`, `useUnits()`, `contrastRatio()`, `pickTextOn(bg)`, `stripPictographs()` |
| 2 | Sky model | `lib/sun.ts`, `lib/sky-palette.ts`, `lib/sky-scene.ts`, `lib/aqi.ts`, tests | `sceneFrom()`, `severity()`, `SKY_GRADIENTS`, sun and moon functions |
| 3 | Sky renderer | `components/aspire/sky/SkyLayer.tsx`, `SkyCanvas.tsx`, `SkySurfaces.tsx`, `Lightning.tsx` | `<SkyLayer scene density="full|conversation" previewScene? />`, `<SkySurfacesProvider>`, `useSkySurface(ref, "arc"|"edge")` |
| 4 | Orb and halo | `components/ui/voice-orb.tsx`, `components/aspire/OrbHalo.tsx`, `components/aspire/EdgeGlow.tsx`, `lib/audio-bands.ts` | `<VoiceOrb .../>` (section 6.1), `<OrbHalo scene state tone size />` (wraps VoiceOrb plus the SVG rings and registers the arc surface), `<EdgeGlow state tone />`, `createBands(analyser)` |
| 5 | Ambient data | `app/api/ambient/route.ts`, `lib/ambient.ts`, `lib/use-ambient.ts`, `lib/ambient-types.ts` additions, `lib/maps.ts` field mask (line color and textColor) | `useAmbient()` returning `{ data, status, refresh }` |
| 6 | Tiles and bar | `components/aspire/live/Tile.tsx`, `LiveTiles.tsx`, `AqiMeter.tsx`, `TrafficStrip.tsx`, `LineBadge.tsx`, `lib/urgency.ts` | `<LiveTiles ambient variant="grid|bar|rail" urgentOverride? onOpen(section) />` |
| 7 | Live panel | `components/aspire/live/LivePanel.tsx`, `DepartureRow.tsx`, `RangeBars.tsx`, `HourScrub.tsx` (P2 stub) | `<LivePanel open section ambient onClose onPreviewScene? />` |
| 8 | Sheet | `components/aspire/Sheet.tsx` | the API in section 15 (backwards compatible with current callers) |
| 9 | Thread and cards | `components/aspire/chat/Thread.tsx`, `Message.tsx`, `ToolLedger.tsx`, `ReplyRegion.tsx`, edits to `ActionCard.tsx`, `BriefingCard.tsx`, `BotLinks.tsx` (glyph fixes, sizes) | `<Thread messages onReplay onRetry onCopy />`, `<ReplyRegion text />` |
| 10 | Composer and suggestions | `components/aspire/chat/Composer.tsx`, `Suggestions.tsx`, `lib/suggestions.ts` | `<Composer phase draft onDraft onSubmit onMic level lang interim />`, `<Suggestions items onPick variant="starter|followup" />` |
| 11 | Shell, persona, login | `components/Assistant.tsx` (layout, wiring, dock, top bar, Control sheet, status region), `lib/greeting.ts`, `lib/ui-text.ts`, `lib/brain/*` persona prompt, `components/LoginForm.tsx` | integrates everything; the only builder editing `Assistant.tsx` |

**Integration rules:**

- Builders 2 to 10 build against the props above and must not edit `Assistant.tsx`.
- Builder 11 must not re-style components it does not own. It files fixes back to their owners.
- Strings for new UI go to `ui-text.ts`, owned by builder 11. Other builders add a typed key and send the 5-language text to builder 11. Until it lands, they use English fallbacks behind `t.key ?? "English"`.

---

## 19. Inspirations used, and how Aspire beats them

| Source | Taken | Aspire improvement |
|---|---|---|
| 21st.dev Voice Orb, aadixc0de/chatcn (44790) | contour-line sphere; numeric form parameters per state; level getter; still frames | spectrum bands per contour, weather offsets, a data-only Halo, confirm and error states with words, DPR capped at 2, accessible 48px+ core |
| 21st.dev ASCII Voice Orb (39011) and AI Orb (38324) | inward vs outward ripples; state-to-animation map; reduced-motion still frame | distinct still shapes per state plus a localised status word in a live region |
| 21st.dev Weather Widget, vijayksingh (35168/35169) | one engine for every condition; sun arc; moon phase; range bars | driven by live Google Weather (Open-Meteo fallback) for any coordinates; the sun is placed by NOAA, not by clock; the whole screen is the sky |
| 21st.dev Rain (5105), Rain and lightning hero (5168), Snow Flakes (5106) | pooled canvas particles; depth layers; splash; pointer-events none | count from intensity, slant from wind, particles land on the orb and tiles, photosensitivity-safe lightning, no audio (it would hurt the microphone), paused when hidden |
| 21st.dev Aurora Background, Aceternity (1120) and Aurora Veil (28428) | corner-light mask; slow, low-saturation colour | colour now carries phase, condition and AQI haze; transform and opacity only (no `background-position` repaint); no WebGL |
| 21st.dev Weather Card (45533) | chat-native weather card hierarchy | scaled for elderly users (64px temperature, 48px rows, rain chance as text) |
| 21st.dev Bento Mini UI (46737) and Bento Grid (622, 1197) | uneven spans; a one-shot entrance story | tile size means urgency; voice-routed promotion via `layoutId`; snow settles on the tile tops |
| 21st.dev Usage Meter (40321) and uibrik Progress (46712) | marker on a meter; number roll; spring smoothing | segmented AQI meter in the EPA order with icon, word, position and scale name; `role="meter"` |
| 21st.dev Magnetic Drawer (19360), coss Drawer (11442), Animated Drawer (25376) | velocity-projected snap; inset desktop variant; content morph in one sheet | keyboard-operable 48px grabber with announced sizes, focus trap plus `inert`, sky-tinted hairline |
| 21st.dev AI Prompt Box (2321), AI Composer (46504), Waveform (45626) | box keeps its shape across states; mic morphs to send | real AnalyserNode waveform, interim transcript in the pill, language tag in text, a 56px single primary button |
| 21st.dev Voice Session (45630), Message Thread (31661), AI Message (23819) | captions as transcript; barge-in; follow-the-stream scroll; reply actions | 20px replies, tool ledger rows with Check and X icons, one reply-only live region, actions visible on touch |
| 21st.dev Suggestions (46435), AI Suggestions (23830), Prompt Suggestion (1747) | starter vs follow-up tiers; chips clear after use; highlight mode | context-built from live weather, AQI, stop and locale; voice-match highlight; no Mongolia-only starters |
| 21st.dev Departures Board (29827) and Metro Map Gallery (43148) | list plus route sync; rail with line colours; arrow-key navigation | honest Live and Scheduled labels, empty states for cities without feeds, contrast-corrected agency badges, weather on walking legs |
| Apple Weather, CARROT, Mercury | sky as data; urgency reorder; persona type separate from data type | the persona line is spoken and shown identically, upright, and the sky also drives the orb and edge glow |
| Siri iOS 18 / Gemini Live / Alexa+ | edge light; movement per state; short gestures | the edge light encodes sky hue and AQI; every state also has a word |
| Territory Studio and FUI (Coleran, Noessel) | thin rings, ticks, tabular numerals, edge telemetry | no fuigetry: every tick is real data (24h clock, daylight, voice, AQI or rain), and every value is also spelled out in a tile |

**Why it is better than any of them:**

- It is the only design where the background, the orb, the edge light and the landing particles are all driven by the same live data for the user's own coordinates, in any city on Earth.
- It stays at 12.5:1 text contrast over a white snow sky, uses 48px targets and a 20px reply text, and has a one-tap Calm mode. The most atmospheric screen is also the most legible one.

---

## 20. Definition of done (P0 checklist)

- [ ] Tokens, fonts and `.panel` landed; contrast and no-emoji tests pass; violet and Orbitron removed.
- [ ] SkyLayer renders every SkyKind x phase; particles follow intensity and wind; storm is safe; static under reduced motion and Calm mode; pauses when hidden.
- [ ] Orb has bands and weather inputs; the Halo clock, voice ring and inner arc work; rain splashes and snow settles on the halo; the orb docks into the top bar.
- [ ] Four tiles plus the ambient bar, with urgency reorder, full-sentence labels and honest transit states.
- [ ] Live panel with Sky, Air, Road and Transit; Sheet has snap points, the grabber and a focus trap.
- [ ] Thread: no blur, a single reply live region, the tool ledger, 48px actions. The composer has the 56px morphing button.
- [ ] One-sentence greeting in 5 languages; capability list removed; model and TTS output sanitised.
- [ ] Works at 375x667, at A++ with 200% zoom, at 1024 and at 1440; no Erdenet hard-coding; units and time follow the locale.
- [ ] No secrets in client bundles or the repo; no new dependencies.
