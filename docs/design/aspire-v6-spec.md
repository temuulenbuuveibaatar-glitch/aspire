# Aspire v6 spec

Target: `docs/design/aspire-v6-reference.webp`. It works for any city in the world, in 5 UI languages (mn, zh, en, ru, de), and uses no emojis. It builds on the existing code: `Assistant.tsx` (state, voice, `MessageList`, `Composer`, `VoiceOrb`, `LiveMap`), `lib/ambient.ts` (`getAmbient`, Open-Meteo or Google weather and air, `wikiPhoto`, `erdenetPart`) and `lib/erdenet-transit.ts`.

## 1. UI

### Kept from the reference
- **Top nav:** logo, Overview / City map / Saved places, a "Search cities" button labelled with its Cmd+K shortcut, and settings.
- **Hero:** a city photo that follows the live weather, place picker, city name, tagline, large temperature, condition, feels-like, high and low, clock with date and time zone, a forecast strip and an "Open city map" button.
- **Three cards:** Nearby transit, Air quality and Tomorrow's sunrise (with an Auto scene toggle).
- **Right panel:** the agent, with orb, opener line, short chat, route card, source tags, model label, and an input with "+" and a mic.
- **Look:** a dark, green-tinted palette.

### Improvements, and why
1. **Freshness and source line on every card.** Examples: "Live · 30 s ago · Orkhon ТКХДТ", "Scheduled", "Open-Meteo · 4 min ago". The "All systems in sync" and "Example city data" footers are removed and replaced by a computed status (for example "3 of 4 sources live"). Why: trust. Citymapper and Transit mark real-time data, and the reference only claims it.
2. **Rain in the next hour.** A 60-minute bar chart (Open-Meteo `minutely_15`, or Google) under the condition, with a sentence such as "Rain eases in 10 min, dry by 10:40". It is hidden when the forecast is dry. Why: this is the leading feature in Apple Weather and CARROT, and it gives evidence for the agent's "Rain should ease by 10".
3. **Alert rail above the hero.** It covers severe weather, AQI over 150 and transit disruption. Each alert has a severity colour, chips for the affected lines, and dismiss or snooze. With no alerts, nothing renders, not even a placeholder. Why: Apple Weather and Watch Duty put alerts on the top layer.
4. **Transit card built around decisions.**
   - It shows "Leave in N min", which is the arrival time minus the walk time.
   - Each departure is marked live or scheduled; only live minutes get a pulsing dot.
   - A row of pinned stops.
   - "Get me home" appears when the user is more than 1 km from home.
   - A named empty state such as "Stops only in Tsetserleg (OpenStreetMap)". It never shows invented minutes.
5. **Personalisation.**
   - Home and work.
   - A commute chip such as "24 min, 3 min slower than usual".
   - Saved places become real objects (`stop | place | route`) that can be reordered by dragging or with the keyboard.
   - First run takes two steps: pick the city, then the home stop.
6. **Cmd+K command palette.** It finds cities, stops, routes and actions. A city list shows a mini scene and the local time for each city (Ulaanbaatar, Erdenet, Darkhan, Murun, Tsetserleg, and any others).
7. **Deeper forecast.**
   - A 24-hour strip that scrolls sideways; the chance of rain sets the icon opacity.
   - A "More" disclosure opens a 10-day list with min/max bars on a shared scale, and tiles for UV, wind, humidity, visibility and pressure.
8. **Air card.** A marker on the colour scale, the main pollutant, a 12-hour AQI sparkline, advice for sensitive groups, and "Nearest station 14 km" when the station is far away.
9. **Daylight card.** Sunrise and sunset, golden hour, and the change in daylight ("+2 min vs yesterday", from `lib/sun.ts`). The Auto scene toggle has a line explaining what it changes.
10. **Agent in the style of Perplexity and Arc.**
    - Each factual answer has source chips showing source and age.
    - Text streams in.
    - Up to 3 suggestion chips run actions and show their reason ("because rain ends 10:00").
    - Cards are typed (RouteCard with 2 options, BusCard with a countdown, PlaceCard with Save) and built from tool output.
    - Clicking a card opens the City map with the route or stop highlighted. "Ask about this" on any dashboard card sends that card's context to the agent.
11. **Every state designed.** Skeletons in each card's shape, offline (cached data with its timestamp), location denied (prompt to search for a city), no data, and an error with Retry. All copy is in 5 languages.
12. **Craft.** Tabular numbers, numbers that roll into place, locale-aware units and clocks (`Intl`), contrast of at least 4.5:1, and room for long German words.

### Desktop layout (1280 px and wider)
```
+-------------------------------------------------------------------------+
| a aspire     [Overview] City map  Saved places   [Search cities  Cmd K] [=]|
+-----------------------------------------------------+-------------------+
| ALERT RAIL (only when an alert exists)               | AGENT  [expand]   |
+-----------------------------------------------------+   ( orb )         |
| HERO  place v  . weather-synced scene        07:42  |  opener line      |
|  London                                  TUE 14 APR |  [chip][chip]     |
|  12 deg  Light rain  Feels 10  H14 L9               |  user bubble      |
|  [||||||....] Rain eases in 10 min      [Open map ->]|  agent reply      |
|  Now 08 09 10 11 12 ...  (scrolls)       [More]     |  [RouteCard 2 opt]|
+-----------------+-----------------+-----------------+  src: Weather 2m  |
| TRANSIT         | AIR             | DAYLIGHT        |  model label      |
| Leave in 4 min  | 24 Good  PM2.5  | 06:06 / 19:48   |  [+ Ask...  mic ^]|
| 24 * 3 min LIVE | ==|=======      | +2 min          |                   |
| 159  8 min SCHED| spark  advice   | Auto scene [o]  |                   |
| src . age       | src . age       | src             |                   |
+-----------------+-----------------+-----------------+-------------------+
| status: 3/4 sources live . Europe/London UTC+1 . Data credits            |
+-------------------------------------------------------------------------+
```
Grid: `minmax(0,1fr) 360px` with a 20 px gap. The hero is 440 px tall and the cards are 240 px tall.

### Phone layout (under 768 px)
```
+---------------------------+
| a aspire     [search] [=] |
| ALERT (if any)            |
| HERO (photo, 320 px)      |
|  London 12 deg Light rain |
|  rain bar + sentence      |
|  hourly strip (scrolls)   |
| [Commute 24 min +3]       |
| TRANSIT card              |
| AIR card                  |
| DAYLIGHT card             |
| tab bar: Overview Map Saved|
+---------------------------+
| ( orb ) Ask...       mic  |  <- agent bottom sheet (peek 72 px,
+---------------------------+     drag to 50% or full height)
```
Side gutter is 16 px, with no horizontal page scroll. The hourly strip is the only element that scrolls sideways.

### Tokens
| Token | Hex | Use |
|---|---|---|
| `--bg` | #0b1311 | page |
| `--surface` | #121c19 | cards |
| `--surface-2` | #1a2622 | raised, chat bubble |
| `--surface-3` | #24332e | chips, inputs |
| `--line` | #2a3a35 | 1 px borders |
| `--ink` | #eef3f0 | primary text |
| `--ink-muted` | #b9c7c1 | secondary text (8:1 on surface) |
| `--ink-faint` | #98aaa3 | small meta text (at least 5.5:1 on surface-2) |
| `--accent` | #a8e6c4 | primary button, orb |
| `--on-accent` | #0b1311 | text on accent |
| `--live` | #5be3a4 | live dot, real-time minutes |
| `--sched` | #c9d3cf | scheduled minutes (no dot) |
| `--warn` | #f5c26b | moderate alert |
| `--danger` | #ff8a8a | severe alert |
| AQI scale | #5be3a4 #e8d36a #f5a35b #ff7a7a #c58bd8 #b0607a | good to hazardous |

- **Radius:** 12, 20 and 28 px.
- **Shadow:** `inset 0 1px 0 rgb(238 243 240/.06), 0 16px 40px -16px rgb(0 0 0/.6)`.
- **Hero text:** sits on a gradient scrim of `rgb(11 19 17/.0 to .78)`, which keeps contrast at 4.5:1 or better.
- **Code change:** these tokens replace the blue-cyan values in `globals.css`.

**Type.** Inter Variable (with `opsz`) loaded through `next/font`. Fallbacks: Noto Sans SC for zh, Noto Sans for the Cyrillic used in mn and ru, then system-ui. Sizes:

| Element | Size and weight |
|---|---|
| Temperature | 96/300 |
| City | 56/500 |
| Clock | 40/300 |
| Card title | 15/600 |
| Body | 14/400 |
| Meta | 12/500 |

- Do not set any text smaller than 12 px.
- Times and temperatures use `font-variant-numeric: tabular-nums`.
- German uses `hyphens: auto` with `lang=de`.
- Chips use `text-overflow: ellipsis`, and the full text goes in a `title`.

### Components and props
- `TopNav { view, onView, onSearch }`
- `CommandPalette { open, onClose, cities, stops, routes, actions }`
- `AlertRail { alerts: Alert[] /* {id, kind:'weather'|'air'|'transit', severity:1-3, title, lines?, until} */, onDismiss, onSnooze }`
- `Hero { place, sky, weather, photo, timeZone, now, nowcast?: {minutes:number[], sentence}, hourly, onOpenMap, provenance }`
- `NowcastBar { minutes:number[] /* mm/h per 5 or 15 min */, sentence }`
- `HourlyStrip { hours:{t, kind, tempC, precip}[], locale }`
- `ForecastMore { days: AmbientDay[] /* extend to 10 */, details:{uv, windKph, humidity, visKm, hPa} }`
- `TransitCard { coverage: Coverage, departures: Departure[], walkMin, pinned: SavedStop[], away:boolean, onGetHome, onAsk }`
- `Departure { route, color, headsign, minutes, realtime:boolean, crowding?, source, at }`
- `AirCard { aqi, category, pollutant?, pm25?, hourly?:number[], stationKm?, provenance, onAsk }`
- `DaylightCard { sunrise, sunset, goldenHour, deltaMin, autoScene, onAutoScene }`
- `CommuteChip { minutes, deltaMin, provenance }`
- `SavedPlaces { items:{id, type:'stop'|'place'|'route', label, ref}[], onReorder, onRemove }`
- `Provenance { source, ageS, kind:'live'|'scheduled'|'estimated'|'static'|'none', href? }`, rendered as `ProvenanceChip` with a hover or focus preview.
- `CardState { state:'loading'|'ready'|'empty'|'offline'|'denied'|'error', onRetry? }` wraps every card.
- `AgentPanel { messages, orbState, partialTranscript, suggestions:{label, reason, action}[], expanded, onExpand }`
- `RouteCard { options:[Option, Option], onPick, onShowOnMap }`, `BusCard { departure }`, `PlaceCard { place, onSave }`. Cards are built from tool results, never from model text.

Orb states, which extend `VoiceOrbState`: `idle | listening(level) | thinking | tool(label) | speaking(level)`. The tool label reads, for example, "Checking buses..." and is translated into all 5 languages.

### Motion
- **Cards:** enter with a 40 ms stagger, 200 ms, `cubic-bezier(.2,.8,.2,1)`.
- **Numbers:** roll into place over 240 ms.
- **Live dot:** pulses at 1.6 s.
- **Scene layers:** rain, snow, fog and glare come from `sky.kind` and `intensity`. The photo has a 6 px pointer parallax.
- **Map handoff:** "Open city map" morphs into the map using a View Transition on the hero shape.
- **Agent sheet:** uses a spring with stiffness 400 and damping 40.
- **Reduced motion:** with `prefers-reduced-motion`, all of the above becomes a 120 ms fade. Numbers swap without rolling and the parallax stops. `MotionConfig reducedMotion="user"` is already in place.

### Accessibility
- Landmarks: `nav`, `main`, `aside[aria-label=agent]`.
- The alert rail is `role=region` with `aria-live=polite`; a severe alert uses `assertive`.
- Live minutes are announced at most once a minute.
- The rain bar and sparkline each have a text alternative, which is the sentence.
- The palette is a combobox and traps focus. Drag-to-reorder also works with Alt plus the arrow keys.
- Focus ring is 2 px in `--accent` with a 2 px offset. Hit targets are at least 44 px.
- Colour is never the only signal: live departures say "Live" in text, and AQI shows its category word.
- `lang` is set on `<html>` and on mixed-language chips.

## 2. Transit plan

### Provider chain
Add `web/lib/transit/registry.ts`, which resolves `(lat, lng)` to an ordered list of providers. Every provider returns the same `{ coverage, stops, departures, vehicles?, provenance }`. The first provider with data wins, and `coverage` is one of `live | scheduled | static | none`.

| Order | Provider | Where | Endpoint | Cache | Label |
|---|---|---|---|---|---|
| 1 | Erdenet live (`erdenet-transit.ts`, exists) | within 30 km of Erdenet | `GET https://dedtuv.erdenet.mn/api/transit/static`, `/vehicles` | static 6 h, vehicles 10 s; hide vehicles not updated in the last 10 min | Live · Orkhon ТКХДТ |
| 2 | UB PTD static (new `transit/ub-ptd.ts`) | within 30 km of Ulaanbaatar | `POST https://api.ptd.ub.gov.mn/api/v1/transport/route/listDetails`, body `{}` | 24 h; on error, serve the last good copy | Routes and stops · UB PTD, no live data |
| 3 | Transitous (new `transit/transitous.ts`) | worldwide where it has coverage | `https://api.transitous.org/api/v5/stoptimes?center=lat,lon&n=5`, `/v5/plan`, `/v1/map/stops`, `/v1/map/trips`, `/v1/geocode` | stoptimes 30 s, map/stops 24 h, plan 5 min (keyed by rounded endpoints) | `realTime` true: Live; false: Scheduled |
| 4 | Google Routes TRANSIT (existing `maps.ts` key) | when billing is enabled and Transitous has no route | `POST https://routes.googleapis.com/directions/v2:computeRoutes`, `travelMode:TRANSIT`, field mask `routes.legs.steps.transitDetails,routes.duration,routes.polyline` | 5 min | Scheduled · Google |
| 5 | OSM Overpass (new `transit/osm.ts`) | everywhere else, including Darkhan, Murun and Tsetserleg | `POST https://overpass-api.de/api/interpreter` with `node["highway"="bus_stop"](bbox)` and `rel["route"="bus"](bbox)`; mirrors overpass.kumi.systems and overpass.private.coffee | 24 h; never queried per user request; back off on 429 or 5xx | Stops only · OpenStreetMap |
| 6 | none | | | | No transit data for this city |

**UB PTD notes.**
- Convert lat and lng to numbers, drop stops at 0,0 and remove duplicate stops; this leaves about 1,071 stops and 108 routes.
- Do not draw route lines from the stop order, because the stops are not in travel order.
- Never show minutes for UB.

**Mongolia today:** only Erdenet has live buses. Ulaanbaatar has scheduled routes and stops. Darkhan (29 stops), Murun (8) and Tsetserleg (1) get OSM stops only. The registry has a slot for a UB live adapter, to fill once official access exists.

**Live map.**
- Erdenet keeps polling `/api/transit?live=1` every 10 s.
- In Transitous cities, `/v1/map/trips` is called with the visible bbox and a 120 s window, and vehicles are animated along the decoded polylines.
- Vehicles are drawn only when `coverage=live`.

**Routes.** The `/api/transit` route gains `?lat&lng` (which uses the registry) and `?plan=from,to`. The existing rate limits stay; add a server-side daily counter that keeps Transitous `/plan` calls under 700 a day.

**Labels.**
- **Live:** shows a green pulsing dot and the age, for example "Live · 20 s ago".
- **Scheduled:** no dot, grey minutes, and the label "Scheduled".
- **Estimated:** the agent's own calculation from positions, as in Erdenet `arrivals`. It has a dashed underline and the label "Estimated".
- **Static:** shows no minutes.
- **No data:** a named empty state.

The agent must tell the user when data is missing and say which label applies.

**Attribution** (footer of the map and transit card, in all 5 languages):
- "Transit data: Transitous and sources", linking to https://transitous.org/sources/
- "(c) OpenStreetMap contributors (ODbL)"
- "Orkhon ТКХДТ" for Erdenet
- "UB PTD" for Ulaanbaatar
- Google's attribution whenever a Google result is shown

**Transitous requests** go only through the server proxy, with a `User-Agent: Aspire/6 (+contact URL)`.

## 3. What the owner must provide
1. **Contact URL or email for the Transitous User-Agent** (`NEXT_PUBLIC_CONTACT_EMAIL` or `NEXT_PUBLIC_REPO_URL`). You also need to accept Transitous's terms: open-source, non-commercial use, about 720 `/plan` calls a day, and AI-built apps are not listed on their site. If Aspire becomes commercial, plan to move to Google Routes or a self-hosted MOTIS server.
2. **`GOOGLE_MAPS_API_KEY` with billing enabled** and the Routes API turned on (10,000 free calls a month, then about $5 per 1,000), plus a `MAPS_DAILY_LIMIT` cap.
3. **Optional:** a free MobilityData account and refresh token (`MOBILITYDB_REFRESH_TOKEN`) to find GTFS and GTFS-RT feeds by country.
4. **Ulaanbaatar live buses:** written permission or an official feed from the UB Public Transport Department (ptd.ub.gov.mn) or Ulaanbaatar Smart Card Co. Until then, UB stays labelled "no live data".
5. **Darkhan, Khuvsgul (Murun) and Arkhangai (Tsetserleg):** contacts at the aimag transport offices if any GPS feed exists. Otherwise these cities stay at "stops only".
6. **Decisions:**
   - Whether the agent's name is "Hermes", as in the reference.
   - City photos: Wikimedia (as now) or a licensed set.
   - Whether to send push notifications for departure reminders, which needs VAPID keys.
