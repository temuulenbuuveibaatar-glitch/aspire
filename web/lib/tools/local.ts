// Tools for buses, time, and the person's own device (reminders, memory). Calls live in connect.ts.
// Buses: in Erdenet, the city's live open feed (Orkhon ТКХДТ): real stops, live buses, estimated
// arrivals. Elsewhere, Google Maps transit, then Transitous (open data, worldwide; each time marked
// live or scheduled). Every answer says its `source`. Live answers carry each
// bus's data age (ageS); stale buses never get an estimate; a dead feed is reported, never guessed around.
// Clock times use the person's own time zone (ctx.timeZone), never a fixed offset.
import { arrivals, CREDIT, findStations, findVehicles, getStatic, isErdenet, liveVehicles, moving, nearestStations, type Station, trip } from "@/lib/erdenet-transit";
import { isGoogleMapsUrl } from "@/lib/links";
import { directionsUrl, type LatLng, mapsConfigured, type TransitOption, transitOptions } from "@/lib/maps";
import { departuresNear, findPlace, planTrip, TRANSITOUS_CREDIT, TRANSITOUS_SOURCES } from "@/lib/transitous";
import { clockIn, dayIn, validTimeZone, zonedTime, zoneOr } from "./time";
import { bool, str, type Tool, type ToolContext } from "./types";

const ERDENET_NAME = /erdenet|эрдэнэт|额尔登特/i;
const ERDENET_ZONE = "Asia/Ulaanbaatar";

/**
 * Is the person in Erdenet? true or false when we know where they are, null when we do not.
 * The device location wins, then the network city, then the network position.
 */
function inErdenet(ctx: ToolContext): boolean | null {
  const at = ctx.device.location;
  if (at) return isErdenet(at.lat, at.lng);
  if (ctx.city) return ERDENET_NAME.test(ctx.city);
  return ctx.approxLocation ? isErdenet(ctx.approxLocation.lat, ctx.approxLocation.lng) : null;
}

/** Mongolian zones: with no place known, a Mongolian clock is the only hint that allows Erdenet's feed. */
const MONGOLIAN_ZONE = /^Asia\/(Ulaanbaatar|Ulan_Bator|Choibalsan|Hovd)$/;

/**
 * Erdenet's live feed: "first" when the person is in Erdenet or names it (before Google), "after"
 * when only a Mongolian clock is known (after Google, which also knows Ulaanbaatar), else "never".
 */
function erdenetOrder(ctx: ToolContext, ...said: string[]): "first" | "after" | "never" {
  const known = said.some((s) => ERDENET_NAME.test(s)) || inErdenet(ctx);
  if (known !== null) return known ? "first" : "never";
  return MONGOLIAN_ZONE.test(validTimeZone(ctx.timeZone) ?? "") ? "after" : "never";
}

type Step<T> = () => Promise<T | null>;

/**
 * Live first (Erdenet), else Google first; outside Erdenet Transitous after Google. null results fall
 * through; a failing source is reported (Erdenet's feed in Erdenet, Transitous elsewhere), never guessed around.
 */
async function liveOrGoogle<T>(order: ReturnType<typeof erdenetOrder>, live: Step<T>, google: Step<T>, open: Step<T>, none: T): Promise<T> {
  const steps = order === "first" ? [live, google] : order === "after" ? [google, live] : [google, open];
  let down: object | null = null;
  for (const step of steps) {
    const r = await step().catch(() => ((down = order === "first" ? FEED_DOWN : step === open ? OPEN_DOWN : down), null));
    if (r) return r;
  }
  return (down ?? none) as T;
}

/** Why a stop has no arrivals: no bus coming, or no bus reporting at all (then nothing can be estimated). */
const emptyReason = async () =>
  (await liveVehicles()).some((v) => !v.stale)
    ? "No live bus was found on a route to this stop (judged from live positions)."
    : "No bus has reported its position in the last minute, so there is no live estimate. Say so; do not guess.";

const notHere = (ctx: ToolContext) => ({
  error:
    inErdenet(ctx) === false
      ? "No bus times found: Google and Transitous have none for this stop or place (with no stop named, the device location is needed). Say so; do not guess. Ask which stop, or use get_directions with mode 'transit', or find_places 'bus stop' for nearby stops."
      : "Location unknown: ask which city they are in (or suggest 'Use my location'), then use get_directions with mode 'transit'.",
});
const FEED_DOWN = {
  liveDataUnavailable: true,
  error: "Live bus data unavailable: Erdenet's bus feed is not answering. Say exactly that; do not guess arrival times or bus positions. Suggest trying again in a minute.",
};
const OPEN_DOWN = {
  liveDataUnavailable: true,
  error: "Bus times unavailable: the open transit data service (Transitous) is not answering right now. Say exactly that; do not guess. Suggest get_directions with mode 'transit' or trying again later.",
};

/** The person's city is added to a place name Google should find. */
function placeFor(query: string, ctx: ToolContext): string {
  const city = ctx.city?.trim();
  return city && !query.toLowerCase().includes(city.toLowerCase()) ? `${query}, ${city}` : query;
}

/** Google transit options, or [] (no key, no transit here, quota or error). */
async function googleTransit(from: string, to: string, ctx: ToolContext): Promise<TransitOption[]> {
  if (!mapsConfigured() || !from || !to) return [];
  return transitOptions({ from: placeFor(from, ctx), to: placeFor(to, ctx), now: ctx.now, lang: ctx.lang ?? "en", timeZone: ctx.timeZone }).catch(() => []);
}

const OPEN = { source: "transitous", credit: TRANSITOUS_CREDIT, creditUrl: TRANSITOUS_SOURCES } as const;

/** Where the person is for Transitous: the device, else the network's city-level position. */
const anchor = (ctx: ToolContext): LatLng | null => ctx.device.location ?? ctx.approxLocation ?? null;

/** A named place for Transitous near the person (the city added when no position is known). */
const openPlace = (query: string, ctx: ToolContext) => {
  const near = anchor(ctx);
  return near || ctx.city ? findPlace(near ? query : placeFor(query, ctx), near) : Promise.resolve(null);
};

/** Transitous options between two named places; empty `from` = the device position. */
async function openTrip(from: string, to: string, ctx: ToolContext) {
  const [a, b] = await Promise.all([from ? openPlace(from, ctx) : ctx.device.location ?? null, openPlace(to, ctx)]);
  if (!a || !b) return null;
  const options = await planTrip(a, b, ctx.now, { timeZone: ctx.timeZone });
  return options.length ? { from: "name" in a ? a.name : from, options } : null;
}

/**
 * An Erdenet stop by its Mongolian name (the match nearest the person), else the stop nearest the
 * person when their device location is in Erdenet. Otherwise an error listing the stop names.
 */
async function pickStop(query: string, ctx: ToolContext): Promise<{ stop: Station; nearest: boolean } | { error: string; stops: string[] }> {
  const at = ctx.device.location;
  const [hit] = await findStations(query, at);
  if (hit) return { stop: hit, nearest: false };
  if (at && isErdenet(at.lat, at.lng)) {
    const [near] = await nearestStations(at.lat, at.lng, 1);
    if (near) return { stop: near, nearest: true };
  }
  const { stations } = await getStatic();
  return {
    error: `Unknown Erdenet stop "${query}". Stop names are Mongolian Cyrillic: retry with the closest name from 'stops', or ask which stop they mean.`,
    stops: [...new Set(stations.map((s) => s.name))],
  };
}

/** "3" matches "Ч:3", "1" matches "Ч:1-Ч:2"; no number matches every route. */
const sameRoute = (line: string, asked: string) => {
  const n = asked.match(/\d+/)?.[0];
  return !n || !!line.match(/\d+/g)?.includes(n);
};

const SOURCE = { source: "erdenet-live", credit: CREDIT } as const;
const LIVE = { ...SOURCE, estimate: true } as const;

/** How every live bus answer must be told (part of the tool descriptions). */
const TRUTH =
  "Report only what the data says. Minutes are estimates: say 'about N minutes (estimate)'. ageS is how old that bus's position is: when it is over 30, say how old (e.g. 'position 45 seconds old'). Buses silent for over 60 s are left out of estimates. Routes are matched from each bus's position (null when unclear). stopped: the bus is standing still now (say so). If the result says live data is unavailable, say so and never guess.";

/** How Transitous answers must be told. */
const OPEN_TRUTH =
  "Transitous times: live true is real-time (say 'live'); live false is the timetable only (say 'scheduled', never 'live'). Credit 'Transitous'.";

/** One bus by its plate: route, destination, nearest stop, speed, heading and how old its position is. */
async function busByPlate(plate: string) {
  const found = await findVehicles(plate);
  if (!found) return { bus: plate, error: "Ask for at least 3 digits or letters of the plate." };
  const [v, ...rest] = found;
  if (!v) return { bus: plate, error: `No bus with plate "${plate}" is in the live feed right now. Say so; do not guess where it is.`, ...SOURCE };
  const [near] = await nearestStations(v.lat, v.lng, 1);
  return {
    bus: v.name,
    ...(rest.length ? { alsoMatches: rest.map((x) => x.name), ambiguous: "Several buses match: ask which plate they mean." } : {}),
    route: v.routeShort,
    routeName: v.routeName,
    ...(near ? { nearStop: near.name, nearStopM: near.distanceM } : {}),
    // Unknown values stay unknown; a standing bus has no direction of travel.
    speedKph: v.speedKph ?? "unknown",
    ...(moving(v.speedKph) ? { heading: v.heading ?? "unknown" } : { stopped: true }),
    ageS: v.ageS,
    ...(v.stale ? { stale: true, note: `Its last position is ${v.ageS} s old: say it has not reported recently.` } : {}),
    ...(v.routeShort ? {} : { noRoute: "Not on a known route right now (for example at the depot)." }),
    ...SOURCE,
  };
}

export const nextBus: Tool = {
  name: "get_next_bus",
  label: { mn: "Автобус", en: "Bus" },
  description:
    "Next buses at a stop: minutes until each bus, route, bus plate. In Erdenet, Mongolia: live bus positions from the city's open feed; stop names are Mongolian Cyrillic; an empty stop means the stop nearest the person; 'bus' with a plate (e.g. '0216') instead tells where that one bus is going, its speed and heading. " +
    TRUTH +
    " Elsewhere: Google Maps transit when a destination ('to') is given, else Transitous (open data; departures near a named stop or the person's position). " +
    OPEN_TRUTH +
    " Or use get_directions with mode 'transit'. If the person saved their usual stop in memory, use it.",
  parameters: {
    type: "object",
    properties: {
      stop: { type: "string", description: "Stop name as the person said it (in Erdenet in Mongolian Cyrillic, e.g. 'Баян тал'). Empty string = nearest stop." },
      route: { type: "string", description: "Route number to filter, e.g. '3'. Empty string for all routes." },
      to: { type: "string", description: "Where the person is going (stop or place), if they said; empty string otherwise" },
      bus: { type: "string", description: "Erdenet bus plate the person asked about, e.g. '0216'. Empty string otherwise." },
    },
    required: ["stop", "route", "to", "bus"],
  },
  async run(input, ctx) {
    const stop = str(input.stop, 80);
    const route = str(input.route, 10);
    const to = str(input.to, 120);
    const plate = str(input.bus, 20);
    const order = erdenetOrder(ctx, stop, to);
    const live = async () => {
      if (plate) return busByPlate(plate);
      const p = await pickStop(stop, ctx);
      if ("error" in p) return order === "first" ? p : null; // a non-Erdenet stop: let `none` answer
      const list = (await arrivals(p.stop.id)).filter((a) => sameRoute(a.route, route));
      return {
        stop: p.stop.name,
        ...(p.nearest ? { note: "Nearest stop to the person" } : {}),
        now: clockIn(ctx.now, ERDENET_ZONE),
        arrivals: list.map(({ route: r, routeName, minutes, bus, ageS, stopped }) => ({ route: r, routeName, minutes, bus, ageS, ...(stopped ? { stopped } : {}) })),
        ...(list.length ? {} : { empty: await emptyReason() }),
        ...LIVE,
      };
    };
    const google = async () => {
      const g = (await googleTransit(stop, to, ctx)).filter((o) => !route || o.line === route);
      if (!g.length) return null;
      return {
        stop: g[0].stop || stop,
        now: clockIn(ctx.now, zoneOr(ctx.timeZone)),
        arrivals: g.map((o) => ({ route: o.line, routeName: o.lineName, minutes: o.waitMinutes, time: o.departs, towards: o.headsign })),
        source: "google",
      };
    };
    const open = async () => {
      if (to) {
        const t = await openTrip(stop, to, ctx);
        const list = t?.options.filter((o) => !route || o.line === route) ?? [];
        if (!t || !list.length) return null;
        return {
          stop: list[0].stop || t.from,
          now: clockIn(ctx.now, zoneOr(ctx.timeZone)),
          arrivals: list.map((o) => ({ route: o.line, routeName: o.lineName, minutes: o.waitMinutes, time: o.departs, towards: o.headsign, live: o.live })),
          ...OPEN,
        };
      }
      const at = stop ? await openPlace(stop, ctx) : ctx.device.location;
      if (!at) return null;
      const list = (await departuresNear(at, ctx.now, { timeZone: ctx.timeZone })).filter((d) => sameRoute(d.route, route)).slice(0, 8);
      if (!list.length) return null;
      return {
        stop: list[0].stop,
        ...(stop ? {} : { note: "Stops near the person" }),
        now: clockIn(ctx.now, zoneOr(ctx.timeZone)),
        // distanceM is from the person only when no stop was named (else it is from that stop).
        arrivals: list.map((d) => ({ route: d.route, minutes: d.minutes, time: d.time, towards: d.headsign, stop: d.stop, ...(stop ? {} : { distanceM: d.distanceM }), live: d.live })),
        ...OPEN,
      };
    };
    return liveOrGoogle<object>(order, live, google, open, notHere(ctx));
  },
};

export const tripPlanner: Tool = {
  name: "plan_trip",
  label: { mn: "Замын төлөвлөгөө", en: "Trip plan" },
  description:
    "Bus between two stops: which route, how long to wait, how long the ride is. In Erdenet: the city's live feed (direct routes; stop names Mongolian Cyrillic; waitMinutes null means no live bus is on its way). " +
    TRUTH +
    " Elsewhere: Google Maps transit, else Transitous. " +
    OPEN_TRUTH +
    " For door-to-door routes anywhere, prefer get_directions.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start stop or place name. Empty string = the stop nearest the person (Erdenet)." },
      to: { type: "string", description: "Destination stop or place name" },
    },
    required: ["from", "to"],
  },
  async run(input, ctx) {
    const from = str(input.from, 80);
    const to = str(input.to, 80);
    if (!to) return { error: "to is required" };
    const order = erdenetOrder(ctx, from, to);
    const live = async () => {
      const [a, [b]] = await Promise.all([pickStop(from, ctx), findStations(to, ctx.device.location)]);
      if ("error" in a) return order === "first" ? a : null;
      const options = b ? await trip(a.stop.id, b.id) : [];
      if (!options.length) return null;
      return { from: a.stop.name, to: b.name, options: options.map(({ route, waitMinutes, rideMinutes, bus, ageS }) => ({ route, waitMinutes, rideMinutes, bus, ageS })), ...LIVE };
    };
    const google = async () => {
      const g = await googleTransit(from, to, ctx);
      if (!g.length) return null;
      const mapsUrl = directionsUrl(placeFor(from, ctx), placeFor(to, ctx), "transit");
      if (isGoogleMapsUrl(mapsUrl)) ctx.actions.push({ type: "map", title: to, url: mapsUrl });
      return {
        from: g[0].stop || from,
        to,
        options: g.map((o) => ({ route: o.line, departs: o.departs, arrives: o.arrives, waitMinutes: o.waitMinutes, rideMinutes: o.rideMinutes, stops: o.stops })),
        source: "google",
      };
    };
    const open = async () => {
      const t = await openTrip(from, to, ctx);
      if (!t) return null;
      return {
        from: t.options[0].stop || t.from,
        to,
        options: t.options.map((o) => ({ route: o.line, departs: o.departs, arrives: o.arrives, waitMinutes: o.waitMinutes, rideMinutes: o.rideMinutes, stops: o.stops, live: o.live })),
        ...OPEN,
      };
    };
    const none = order !== "first" ? notHere(ctx) : { error: "No direct Erdenet bus found between these stops. Suggest get_directions with mode 'transit' or 'walk'." };
    return liveOrGoogle<object>(order, live, google, open, none);
  },
};

export const localTime: Tool = {
  name: "get_local_time",
  label: { mn: "Цаг", en: "Time" },
  description:
    "Current date, weekday and time in the person's own time zone, or in another place's IANA time zone. Use before setting reminders or calendar events for 'today', 'tomorrow', 'on Friday', and for 'what time is it in Tokyo?'.",
  parameters: {
    type: "object",
    properties: {
      time_zone: { type: "string", description: "IANA time zone of another place, e.g. 'Asia/Tokyo'. Empty string = the person's own." },
    },
    required: ["time_zone"],
  },
  async run(input, ctx) {
    const asked = str(input.time_zone, 64);
    const zone = asked ? validTimeZone(asked) : zoneOr(ctx.timeZone);
    if (!zone) return { error: `Unknown time zone "${asked}"; use an IANA name like 'Europe/Berlin'` };
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, ...o }).format(ctx.now);
    return {
      date: f({ year: "numeric", month: "2-digit", day: "2-digit" }),
      time: f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      weekday: f({ weekday: "long" }),
      timezone: zone,
      ...(!asked && !validTimeZone(ctx.timeZone) ? { note: "The person's time zone is unknown (UTC shown): ask which city they are in." } : {}),
    };
  },
};

/** The zone a reminder or event is set in: the one the model names, else the person's own. */
export function zoneFor(input: Record<string, unknown>, ctx: ToolContext): string {
  return validTimeZone(str(input.time_zone, 64)) ?? zoneOr(ctx.timeZone);
}

export const TIME_ZONE_PARAM = {
  type: "string",
  description: "IANA time zone of the person, e.g. 'Europe/Berlin'. Empty string = their own zone (from the note).",
};

/** Honest about delivery: the app speaks reminders only while it is open, unless push is on (off by default). */
export const ALARM_NOTE =
  "It rings only while Aspire is open, unless reminder notifications are on in Settings. If it is for waking up or critical medicine, add one short sentence telling them to also set their phone alarm.";

export const setReminder: Tool = {
  name: "set_reminder",
  label: { mn: "Сануулга", en: "Reminder" },
  description:
    "Set a spoken reminder on the person's device (medicine, doctor visit, bus, call grandchild). The device says it out loud at that time while the app is open. Can repeat every day. Times are the person's own local time.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What to say at that time, in the person's language, e.g. 'Даралтын эмээ уух цаг боллоо'" },
      time: { type: "string", description: "Local time HH:MM (24h), e.g. '08:30'" },
      date: { type: "string", description: "YYYY-MM-DD local date; empty string means the next time that clock time comes" },
      repeat_daily: { type: "boolean", description: "true to repeat every day" },
      time_zone: TIME_ZONE_PARAM,
    },
    required: ["text", "time", "date", "repeat_daily", "time_zone"],
  },
  async run(input, ctx) {
    const text = str(input.text, 200);
    const time = str(input.time, 5);
    if (!text) return { error: "text is required" };
    const zone = zoneFor(input, ctx);
    let date = str(input.date, 10);
    let at = zonedTime(date || dayIn(ctx.now, zone), time, zone);
    if (!at) return { error: "time must be HH:MM and date YYYY-MM-DD" };
    if (!date && at.getTime() <= ctx.now.getTime()) at = zonedTime(dayIn(new Date(at.getTime() + 86_400_000), zone), time, zone) ?? at; // next occurrence
    if (at.getTime() <= ctx.now.getTime()) return { error: "That time has already passed" };
    if (ctx.device.reminders.length >= 30) return { error: "Too many reminders; delete some first" };
    date = dayIn(at, zone);
    const id = `r${at.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const repeatDaily = bool(input.repeat_daily);
    ctx.actions.push({ type: "reminder", id, text, at: at.toISOString(), repeatDaily });
    return { ok: true, id, date, time: clockIn(at, zone), timezone: zone, repeatDaily, note: ALARM_NOTE };
  },
};

export const listReminders: Tool = {
  name: "list_reminders",
  label: { mn: "Сануулгууд", en: "Reminders" },
  description: "List the reminders saved on this device (id, text, local time).",
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, ctx) {
    const zone = zoneOr(ctx.timeZone);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
    return {
      timezone: zone,
      reminders: ctx.device.reminders.map((r) => ({ id: r.id, text: r.text, at: fmt.format(new Date(r.at)), repeatDaily: r.repeatDaily })),
    };
  },
};

export const cancelReminder: Tool = {
  name: "cancel_reminder",
  label: { mn: "Сануулга устгах", en: "Cancel reminder" },
  description: "Delete a reminder by id (get ids with list_reminders).",
  parameters: { type: "object", properties: { id: { type: "string", description: "Reminder id" } }, required: ["id"] },
  async run(input, ctx) {
    const id = str(input.id, 40);
    if (!ctx.device.reminders.some((r) => r.id === id)) return { error: "No reminder with that id" };
    ctx.actions.push({ type: "cancel_reminder", id });
    return { ok: true };
  },
};

export const remember: Tool = {
  name: "remember",
  label: { mn: "Санах", en: "Remember" },
  description:
    "Save a stable fact about the person on their device only, when they ask you to remember it or mention it naturally: their name, home city, usual bus stop, family members' names and phone numbers, medicines, job or studies, interests, preferences. Not one-off details. Never store passwords, card numbers, PINs or ID numbers.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Short label, e.g. 'home stop', 'daughter phone', 'blood pressure medicine'" },
      value: { type: "string", description: "The fact, e.g. 'dormitory', '+49 151 2345 6789'" },
    },
    required: ["key", "value"],
  },
  async run(input, ctx) {
    const key = str(input.key, 60).toLowerCase();
    const value = str(input.value, 200);
    if (!key || !value) return { error: "key and value are required" };
    if (/password|нууц үг|pin|card|карт|cvv|регистр/i.test(`${key} ${value}`) || /\b\d{13,19}\b/.test(value.replace(/[\s-]/g, ""))) {
      return { error: "Refused: never store passwords, PINs, card or ID numbers. Warn the person kindly." };
    }
    if (Object.keys(ctx.device.memory).length >= 40 && !(key in ctx.device.memory)) return { error: "Memory is full" };
    ctx.actions.push({ type: "remember", key, value });
    return { ok: true };
  },
};

export const forget: Tool = {
  name: "forget",
  label: { mn: "Мартах", en: "Forget" },
  description: "Delete a saved fact from the device memory by its key.",
  parameters: { type: "object", properties: { key: { type: "string", description: "The memory key to delete" } }, required: ["key"] },
  async run(input, ctx) {
    const key = str(input.key, 60).toLowerCase();
    if (!(key in ctx.device.memory)) return { error: "Nothing saved under that key", keys: Object.keys(ctx.device.memory) };
    ctx.actions.push({ type: "forget", key });
    return { ok: true };
  },
};
