# Aspire v4: Jarvis HUD

Replaces v3 "Skylight Halo". Lean: no new dependencies, each new file under about 400 lines. No emojis anywhere.

## 1. Concept

The person's own place, seen through Jarvis's visor. A real photo of their city fills the screen, the live weather falls over it, and a sparse HUD reads out only here-and-now facts: one readout per corner, the centre left clear for the orb. Jarvis speaks like a British butler: brief, dry, exact.

## 2. Layers (back to front)

| z | Layer | Source |
|---|-------|--------|
| 0 | City photo, `object-cover`, graded by `data-time` | `/api/place-photo` (Places New searchText, then `/media?maxWidthPx=1600&skipHttpRedirect=true`, returns `{photoUri, author, authorUri}`; cache 1 h server-side). Fallback: `stillSkyGradient()` from Sky.tsx |
| 1 | Grade: vignette `radial-gradient(transparent 40%, rgb(0 0 0/.55))`, top scrim `rgb(0 0 0/.7)` to 0 over 28vh, bottom scrim `rgb(0 0 0/.75)` to 0 over 40vh | CSS on `.backdrop::before/::after` |
| 2 | Weather particles | `Sky` with new prop `overlay`: renders only the canvas precipitation (no gradient, clouds, stars, moon, landing surfaces). Already pauses on `document.hidden` and freezes under reduced motion |
| 3 | HUD frame: readouts, orb, chat, composer, map, media | `.hud` panels |

Photo grade, driven by two attributes on `<html>` set once from the weather call (`SkyKind` to family as in Sky.tsx `FAMILY`):

- `data-time="night"`: `filter: brightness(.55) saturate(.7) hue-rotate(-10deg)` plus `#0a1630` at .35, `mix-blend-mode: multiply`
- `data-time="dusk"`: `#ff9a5a` at .25, `soft-light`
- `data-sky="cloud|fog"`: `saturate(.6) contrast(.9)`
- `data-sky="snow"`: `brightness(1.05) saturate(.7)`, bottom scrim raised to .85
- `data-sky="rain|storm"`: `brightness(.8) saturate(.8)`

Credit bottom-left on the scrim: "Photo: {author}" linked to `authorUri`, then "Google Maps". Always shown when the photo is shown.

## 3. Tokens (`app/globals.css` `@theme`)

Keep all existing tokens (`--color-ink`, `--color-ink-muted`, `--color-accent #5ee7ff`, `--color-signal`, `--color-danger`, `--color-success`, `--color-aqi-1..6`, `--color-traffic-*`, radii, easings). Add only:

```
--color-hud: #7fe3ff;              /* lines, brackets, reticle, bus chevrons. Never body text */
--color-hud-glass: rgb(4 8 16 / 0.72);   /* the one panel material */
--color-hud-line: rgb(127 227 255 / 0.35);
--font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
```

Contrast, worst case (pure white snow pixel behind the panel, effective backdrop `#474747`): `--color-ink` 8.6:1, `--color-ink-muted` 5.0:1, `--color-accent` 6.3:1. At .55 alpha white text drops to 4.4:1, so .72 is the floor. `--color-hud` on the photo is non-text (3:1 rule) only.

One utility, used by every panel (readout, map frame, media, calendar, chat):

```
.hud { background: var(--color-hud-glass); backdrop-filter: blur(12px);
  clip-path: polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%);
  background-image: 4 linear-gradients in --color-hud, 16px x 1.5px corner brackets (TL, TR, BL);
  border: 1px solid var(--color-hud-line); }
.hud-grid { dot grid radial-gradient(currentColor .8px, transparent 1px) 0 0/16px 16px at 8% }
```

Never nest a `.hud` inside a `.hud`. `opaque` variant: glass becomes solid `#0b1220`.

## 4. Type

- Body and chat: Inter, 18px (`text-body`), weight 450 or more, white on glass.
- Labels: 16px uppercase, `tracking-[0.12em]`, `--color-ink-muted`.
- Values: `--font-mono` with `tabular-nums`, 20 to 40px (`text-value-sm`, `text-eta`, `text-value`).
- Clock: Tektur (`--font-display`), `text-value`.
- Nothing under 16px. Respect `data-text-size`.

## 5. Phone (375px)

```
+-------------------------------------+
| [14:32  SAT 21 NOV]   [-17 C  SNOW] |  hud readouts, 16px gutter
| [ERDENET . GPS    v]  [AQI 42 GOOD] |  place label opens city picker
| [NEXT 15:00 Dentist             >]  |  calendar: one row, tap expands
|                                     |
|            ( photo clear )          |
|              .-----.                |
|             ( ORB  )  reticle       |
|              '-----'                |
|        [ Fetching buses ... ]       |  status pill, aria-live
| +---------------------------------+ |
| | chat: last 2 turns, swipe up    | |  one .hud, max 34vh, scrolls
| +---------------------------------+ |
| [BUS 4  3 MIN][TAXI 6 MIN][MAP  >]  |  transport strip
| [ Ask Jarvis...          ] [ MIC ]  |  composer, 56px
+-------------------------------------+
```

- Map on phone: the MAP chip opens a full-screen map (motion `layoutId` from the chip). Close button 48px top-left, map controls column right.
- Media card (YouTube 16:9 or Spotify 152px) docks above the transport strip, replacing the chat panel while open. Close and minimise buttons 48px; minimised is a one-line bar with the waveform.

## 6. Desktop (1024px and wider)

```
+----------------------------------------------------------------------------+
| [14:32 SAT 21 NOV]  [ERDENET . GPS v]          [-17 C SNOW] [AQI 42] [gear] |
| [CALENDAR  09:00 Standup | 15:00 Dentist | + ]                             |
|                                                                            |
| +-------------------+                                  +-----------------+ |
| | chat (scroll)     |            .-----.               | LIVE MAP        | |
| |                   |           ( ORB  )               | traffic, stops, | |
| |                   |            '-----'               | buses       [ ] | |
| |                   |      [ status pill ]             | Orkhon credit   | |
| +-------------------+                                  +-----------------+ |
| [ media card 480x270 ]                                 [BUS 4 3m][TAXI 6m]|
|                 [ Ask Jarvis...                        ] [ MIC ]           |
| Photo: A. Bat . Google Maps                                                |
+----------------------------------------------------------------------------+
```

Grid: `grid-cols-[minmax(320px,1fr)_minmax(0,1.2fr)_minmax(360px,1fr)]`, max width 1440. The map panel is 360 to 420px tall with a full-screen toggle (`[ ]`). Full-screen map keeps the composer and orb visible as a bottom dock so voice still works.

## 7. Map

- Maps JS through Google's inline bootstrap, injected only when `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` exists. Use `Promise.all` for `importLibrary("maps")` and `("marker")`. No mapId; dark JSON `styles`; `disableDefaultUI`.
- `window.gm_authFailure` and a missing key both swap the map for a text list of the nearest stops and ETAs.
- Layers: `TrafficLayer` always. `TransitLayer` outside Erdenet only.
- Erdenet (`/api/transit`, which proxies dedtuv.erdenet.mn `static` with a 6 h cache and `vehicles` with a 10 s cache, User-Agent `Aspire/1.0 (+https://aspire-mn.vercel.app)`, never `nats-creds`):
  - Coordinate order verified from the samples: stations are GeoJSON `[lng, lat]`; `routePaths.coords` are `[lat, lng]`.
  - Each route path is a Polyline in its feed `color`.
  - Each of the 192 stations is a 10px `Circle` at its exact coordinates, with no rounding.
  - Buses are heading-rotated chevrons (legacy `Marker` with an SVG path symbol) in `--color-hud`. They glide 1 s between polls and jump when the person prefers reduced motion.
  - Tap a stop to open a sheet with the stop name, the next buses and their ETAs. The sheet closes on Escape and traps focus. ETA comes from the site's public endpoint if one exists; otherwise it is estimated from distance along the path divided by the bus speed, labelled "approx."
  - Credit "Орхон ТКХДТ" in the map frame's bottom-right readout.
- Controls column (48px round, aria-labelled): zoom in, zoom out, my location (re-centres and refreshes the precise position), full screen.
- "You are here" is a pulsing dot. The pulse is a single keyframe and is static under the `still` variant.
- Taxi readout: no public taxi position feed is known. Show the Routes API drive time to the person's next calendar place or home; tap offers the city's taxi numbers from config. Hide the readout when neither exists.

## 8. Location UX

1. First open: a `.hud` sheet titled "Where are you?" with two choices, "Use my precise location" (calls `getCurrentPosition` from the tap) and "Choose my city" (Places autocomplete via the server). No silent IP guess before the person answers.
2. Stop rounding to 2 decimals (`roundedPosition`, about 1 km). The map and nearest stop use full precision on the device; the server gets 4 decimals (about 11 m).
3. The place label always states the source: "ERDENET . GPS", "ERDENET . SET", or "ULAANBAATAR . APPROX." (network only, shown in `--color-signal`). Tap the label to change it.
4. Settings has "My city" (persisted to the profile) and "Use GPS" switches. Weather, photo, air, traffic and transit all key off this one location.

## 9. Orb, status, voice

- The v3 halo (OrbHalo, EdgeGlow) is replaced by a reticle of about 20 lines: one SVG with two `stroke-dasharray` arcs in `--color-hud`. It rotates only while listening, its scale follows the existing adaptive mic level, and under the `still` variant it changes opacity only.
- The status pill (`aria-live="polite"`) is the only progress and confirmation surface, for messages like "Fetching buses", "Event added" and "Voice: Jarvis (ElevenLabs)". Confirmations hide after 2.5 s.
- A speaking waveform strip (existing AnalyserNode) sits under the orb and is reused in the minimised media bar.
- Keep the `listen()` mic fix in Assistant.tsx unchanged.

## 10. Motion

- Springs only, `{ type: "spring", bounce: 0, duration: 0.35 }`; layout morphs use 0.45. `MotionConfig reducedMotion="user"`.
- Animate only transform and opacity, except the map, which Google animates itself.
- Under `still`: no particles (a static grade instead), no reticle spin, no bus glide, no pulse, no scan line.

## 11. Accessibility

- All text is 16px or larger, on `.hud` glass at the .72 floor.
- Touch targets are 48px or larger; the mic and send buttons are 56px.
- Icon buttons have `aria-label` in the current language.
- Values persist on screen and never appear on hover only.
- Stops are one tab stop, and the arrow keys move along the route.
- Media iframes carry a `title`; YouTube uses youtube-nocookie with `playsinline=1` and starts from a tap.
- Every visible string is in `lib/ui-text.ts` for mn, zh, en, ru and de.

## 12. Build map (lean)

- New files:
  - `components/hud/Backdrop.tsx` (photo, grade and credit)
  - `components/hud/Readouts.tsx` (corner readouts, calendar row and transport strip)
  - `components/hud/MapView.tsx` (Maps JS and the Erdenet overlay)
  - `components/hud/MediaCard.tsx`
  - `components/hud/Reticle.tsx`
- Changed files: `Sky.tsx` gets the `overlay` prop and loses the landing surfaces (dead code in v4).
- Deleted files: `AmbientBar.tsx`, `LivePanel.tsx`, `OrbHalo.tsx` and `EdgeGlow.tsx`. Assistant.tsx sheds their wiring.
