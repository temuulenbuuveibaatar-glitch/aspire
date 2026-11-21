// Tools for buses, time, and the person's own device (reminders, memory). Calls live in connect.ts.
// Buses: Google Maps transit first (real departures, any city) when a key is set and Google knows
// transit there. Erdenet's sample timetable is used only for Erdenet. Every answer says its `source`.
// Clock times use the person's own time zone (ctx.timeZone), never a fixed offset.
import { isGoogleMapsUrl } from "@/lib/links";
import { directionsUrl, haversineKm, mapsConfigured, type TransitOption, transitOptions } from "@/lib/maps";
import { findStop, localMinutes, nextArrivals, planTrip, timetable } from "@/lib/transit";
import { clockIn, dayIn, validTimeZone, zonedTime, zoneOr } from "./time";
import { bool, str, type Tool, type ToolContext } from "./types";

/** Erdenet's centre, only to tell whether the person is in Erdenet (where the sample timetable applies). */
const ERDENET_CENTER = { lat: 49.0333, lng: 104.0833 };
const ERDENET_RADIUS_KM = 30;
const ERDENET_NAME = /erdenet|эрдэнэт|额尔登特/i;

/**
 * Is the person in Erdenet? true or false when we know where they are, null when we do not.
 * The device location wins, then the network city, then the network position.
 */
export function inErdenet(ctx: ToolContext): boolean | null {
  const at = ctx.device.location;
  if (at) return haversineKm(at, ERDENET_CENTER) <= ERDENET_RADIUS_KM;
  if (ctx.city) return ERDENET_NAME.test(ctx.city);
  if (ctx.approxLocation) return haversineKm(ctx.approxLocation, ERDENET_CENTER) <= ERDENET_RADIUS_KM;
  return null;
}

/** Mongolia's zones: with no place known, a Mongolian clock is the only hint that allows Erdenet's timetable. */
const MONGOLIAN_ZONE = /^Asia\/(Ulaanbaatar|Ulan_Bator|Choibalsan|Hovd)$/;

/**
 * May the Erdenet sample timetable answer? Only when the person is in Erdenet, names Erdenet, or
 * nothing is known about their place except a Mongolian time zone. Never as a default for anyone else.
 */
function timetableApplies(ctx: ToolContext, ...said: string[]): boolean {
  if (said.some((s) => ERDENET_NAME.test(s))) return true;
  const known = inErdenet(ctx);
  if (known !== null) return known;
  return MONGOLIAN_ZONE.test(validTimeZone(ctx.timeZone) ?? "");
}

/** Why the sample timetable did not answer: elsewhere, or the place is unknown. */
const notErdenet = (ctx: ToolContext) => ({
  error:
    inErdenet(ctx) === false
      ? "No timetable for this city: the sample timetable is only for Erdenet. Use get_directions with mode 'transit' (needs a destination) for real departures, or find_places 'bus stop' for nearby stops."
      : "Location unknown: ask which city they are in (or suggest 'Use my location' in Settings), then use get_directions with mode 'transit'.",
});

/** An Erdenet sample stop becomes a full place name Google can find; elsewhere the person's city is added. */
function placeFor(query: string, ctx: ToolContext): string {
  const stop = timetableApplies(ctx, query) ? findStop(query) : undefined;
  if (stop) return `${stop.names.en}, ${timetable.city}, Mongolia`;
  const city = ctx.city?.trim();
  return city && !query.toLowerCase().includes(city.toLowerCase()) ? `${query}, ${city}` : query;
}

/** Google transit options, or [] (no key, no transit here, quota or error). */
async function googleTransit(from: string, to: string, ctx: ToolContext): Promise<TransitOption[]> {
  if (!mapsConfigured() || !from || !to) return [];
  return transitOptions({ from: placeFor(from, ctx), to: placeFor(to, ctx), now: ctx.now, lang: ctx.lang ?? "en", timeZone: ctx.timeZone }).catch(() => []);
}

export const nextBus: Tool = {
  name: "get_next_bus",
  label: { mn: "Автобус", en: "Bus" },
  description:
    "Next buses at a stop: minutes until each bus, route number, departure time. Anywhere in the world, give a destination ('to') and real Google Maps transit departures are used. Without a destination it only works in Erdenet, Mongolia (Erdenet's sample timetable; its stop list is in the instructions). Elsewhere, use get_directions with mode 'transit'. If the person saved their usual stop in memory, use it.",
  parameters: {
    type: "object",
    properties: {
      stop: { type: "string", description: "Stop name as the person said it (any language), or an Erdenet stop id such as 'center'" },
      route: { type: "string", description: "Route number to filter, e.g. '12'. Empty string for all routes." },
      to: { type: "string", description: "Where the person is going (stop or place), if they said; empty string otherwise" },
    },
    required: ["stop", "route", "to"],
  },
  async run(input, ctx) {
    const stop = str(input.stop, 80);
    if (!stop) return { error: "stop is required" };
    const route = str(input.route, 10);
    const to = str(input.to, 120);
    const google = (await googleTransit(stop, to, ctx)).filter((o) => !route || o.line === route);
    if (google.length) {
      return {
        stop: google[0].stop || stop,
        now: clockIn(ctx.now, zoneOr(ctx.timeZone)),
        arrivals: google.map((o) => ({ route: o.line, routeName: o.lineName, minutes: o.waitMinutes, time: o.departs, towards: o.headsign })),
        tomorrow: [],
        source: "google",
      };
    }
    if (!timetableApplies(ctx, stop, to)) return notErdenet(ctx);
    const r = nextArrivals(stop, localMinutes(ctx.now), { route: route || undefined });
    return "error" in r ? r : { ...r, city: timetable.city, source: "sample-timetable" };
  },
};

export const tripPlanner: Tool = {
  name: "plan_trip",
  label: { mn: "Замын төлөвлөгөө", en: "Trip plan" },
  description:
    "Bus between two stops: which route, when it leaves, when it arrives, how long to wait. Uses Google Maps transit anywhere it has data; Erdenet's sample timetable (direct routes only) only in Erdenet. For door-to-door routes anywhere, prefer get_directions.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start stop or place name" },
      to: { type: "string", description: "Destination stop or place name" },
    },
    required: ["from", "to"],
  },
  async run(input, ctx) {
    const from = str(input.from, 80);
    const to = str(input.to, 80);
    const google = await googleTransit(from, to, ctx);
    if (google.length) {
      const mapsUrl = directionsUrl(placeFor(from, ctx), placeFor(to, ctx), "transit");
      if (isGoogleMapsUrl(mapsUrl)) ctx.actions.push({ type: "map", title: to, url: mapsUrl });
      return {
        from: google[0].stop || from,
        to,
        options: google.map((o) => ({ route: o.line, departs: o.departs, arrives: o.arrives, waitMinutes: o.waitMinutes, rideMinutes: o.rideMinutes, stops: o.stops })),
        source: "google",
      };
    }
    if (!timetableApplies(ctx, from, to)) return notErdenet(ctx);
    const r = planTrip(from, to, localMinutes(ctx.now));
    return "error" in r ? r : { ...r, city: timetable.city, source: "sample-timetable" };
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
    return { ok: true, id, date, time: clockIn(at, zone), timezone: zone, repeatDaily };
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
