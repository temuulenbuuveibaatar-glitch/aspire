// Tools for buses, time, and the person's own device (reminders, memory). Calls live in connect.ts.
// Buses: Google Maps transit first (real departures) when a key is set and Google knows transit
// there; otherwise the sample Erdenet timetable. Every answer says which `source` it came from.
import { isGoogleMapsUrl } from "@/lib/links";
import { directionsUrl, mapsConfigured, type TransitOption, transitOptions } from "@/lib/maps";
import { findStop, localMinutes, nextArrivals, planTrip, timetable } from "@/lib/transit";
import { bool, str, type Tool, type ToolContext } from "./types";

const TZ_OFFSET = "+08:00"; // Mongolia has no daylight saving time

/** A sample stop becomes a full place name Google can find; anything else is passed as said. */
function placeFor(query: string): string {
  const stop = findStop(query);
  return stop ? `${stop.names.en}, ${timetable.city}, Mongolia` : query;
}

/** Google transit options, or [] (no key, no transit here, quota or error) to use the timetable. */
async function googleTransit(from: string, to: string, ctx: ToolContext): Promise<TransitOption[]> {
  if (!mapsConfigured() || !from || !to) return [];
  return transitOptions({ from: placeFor(from), to: placeFor(to), now: ctx.now, lang: ctx.lang ?? "en" }).catch(() => []);
}

const clockNow = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: timetable.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);

export const nextBus: Tool = {
  name: "get_next_bus",
  label: { icon: "🚌", mn: "Автобус", en: "Bus" },
  description:
    "Next bus arrivals at a stop in Erdenet: minutes until each bus, route number, arrival time. Use a stop id from the bus network list or the stop name as the person said it. If the person saved their usual stop in memory, use it. With a destination, real Google Maps departures are used where Google has transit; otherwise the Erdenet timetable.",
  parameters: {
    type: "object",
    properties: {
      stop: { type: "string", description: "Stop id (e.g. 'center') or stop name in any language" },
      route: { type: "string", description: "Route number to filter, e.g. '12'. Empty string for all routes." },
      to: { type: "string", description: "Where the person is going (stop or place), if they said; empty string otherwise" },
    },
    required: ["stop", "route", "to"],
  },
  async run(input, ctx) {
    const stop = str(input.stop, 80);
    if (!stop) return { error: "stop is required" };
    const route = str(input.route, 10);
    const google = (await googleTransit(stop, str(input.to, 120), ctx)).filter((o) => !route || o.line === route);
    if (google.length) {
      return {
        stop: google[0].stop || stop,
        now: clockNow(ctx.now),
        arrivals: google.map((o) => ({ route: o.line, routeName: o.lineName, minutes: o.waitMinutes, time: o.departs, towards: o.headsign })),
        tomorrow: [],
        source: "google",
      };
    }
    const r = nextArrivals(stop, localMinutes(ctx.now), { route: route || undefined });
    return "error" in r ? r : { ...r, source: "sample-timetable" };
  },
};

export const tripPlanner: Tool = {
  name: "plan_trip",
  label: { icon: "🗺️", mn: "Замын төлөвлөгөө", en: "Trip plan" },
  description:
    "How to get from one stop to another by bus: which route, when it leaves, when it arrives, how long to wait. Uses Google Maps transit when it has data for the area, otherwise the Erdenet timetable (direct routes only).",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start stop id or name" },
      to: { type: "string", description: "Destination stop id or name" },
    },
    required: ["from", "to"],
  },
  async run(input, ctx) {
    const from = str(input.from, 80);
    const to = str(input.to, 80);
    const google = await googleTransit(from, to, ctx);
    if (google.length) {
      const mapsUrl = directionsUrl(placeFor(from), placeFor(to), "transit");
      if (isGoogleMapsUrl(mapsUrl)) ctx.actions.push({ type: "map", title: to, url: mapsUrl });
      return {
        from: google[0].stop || from,
        to,
        options: google.map((o) => ({ route: o.line, departs: o.departs, arrives: o.arrives, waitMinutes: o.waitMinutes, rideMinutes: o.rideMinutes, stops: o.stops })),
        source: "google",
      };
    }
    const r = planTrip(from, to, localMinutes(ctx.now));
    return "error" in r ? r : { ...r, source: "sample-timetable" };
  },
};

export const localTime: Tool = {
  name: "get_local_time",
  label: { icon: "🕒", mn: "Цаг", en: "Time" },
  description: "Current local date, weekday and time in Mongolia (Asia/Ulaanbaatar). Use before setting reminders for 'today', 'tomorrow' etc.",
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, ctx) {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: timetable.timezone, ...o }).format(ctx.now);
    return {
      date: f({ year: "numeric", month: "2-digit", day: "2-digit" }),
      time: f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      weekday: f({ weekday: "long" }),
      timezone: "Asia/Ulaanbaatar (UTC+8)",
    };
  },
};

/** "2026-11-21" + "08:30" (Mongolia time) -> ISO instant. */
export function mongoliaTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":");
  const d = new Date(`${date}T${h.padStart(2, "0")}:${m}:00${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayInMongolia(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timetable.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const setReminder: Tool = {
  name: "set_reminder",
  label: { icon: "⏰", mn: "Сануулга", en: "Reminder" },
  description:
    "Set a spoken reminder on the person's device (medicine, doctor visit, bus, call grandchild). The device says it out loud at that time while the app is open. Can repeat every day.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What to say at that time, in the person's language, e.g. 'Даралтын эмээ уух цаг боллоо'" },
      time: { type: "string", description: "Mongolia local time HH:MM (24h), e.g. '08:30'" },
      date: { type: "string", description: "YYYY-MM-DD in Mongolia time; empty string means the next time that clock time comes" },
      repeat_daily: { type: "boolean", description: "true to repeat every day" },
    },
    required: ["text", "time", "date", "repeat_daily"],
  },
  async run(input, ctx) {
    const text = str(input.text, 200);
    const time = str(input.time, 5);
    if (!text) return { error: "text is required" };
    let date = str(input.date, 10);
    let at = mongoliaTime(date || todayInMongolia(ctx.now), time);
    if (!at) return { error: "time must be HH:MM and date YYYY-MM-DD" };
    if (!date && at.getTime() <= ctx.now.getTime()) at = new Date(at.getTime() + 86_400_000); // next occurrence
    if (at.getTime() <= ctx.now.getTime()) return { error: "That time has already passed" };
    if (ctx.device.reminders.length >= 30) return { error: "Too many reminders; delete some first" };
    date = todayInMongolia(at);
    const id = `r${at.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const repeatDaily = bool(input.repeat_daily);
    ctx.actions.push({ type: "reminder", id, text, at: at.toISOString(), repeatDaily });
    return { ok: true, id, date, time, repeatDaily };
  },
};

export const listReminders: Tool = {
  name: "list_reminders",
  label: { icon: "📋", mn: "Сануулгууд", en: "Reminders" },
  description: "List the reminders saved on this device (id, text, time).",
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, ctx) {
    return {
      reminders: ctx.device.reminders.map((r) => ({
        id: r.id,
        text: r.text,
        at: new Intl.DateTimeFormat("en-CA", { timeZone: timetable.timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(r.at)),
        repeatDaily: r.repeatDaily,
      })),
    };
  },
};

export const cancelReminder: Tool = {
  name: "cancel_reminder",
  label: { icon: "🗑️", mn: "Сануулга устгах", en: "Cancel reminder" },
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
  label: { icon: "🧠", mn: "Санах", en: "Remember" },
  description:
    "Save a stable fact about the person on their device only, when they ask you to remember it or mention it naturally: their name, usual bus stop, family members' names and phone numbers, medicines, job or studies, interests, preferences. Not one-off details. Never store passwords, card numbers, PINs or ID numbers.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Short label, e.g. 'home stop', 'daughter phone', 'blood pressure medicine'" },
      value: { type: "string", description: "The fact, e.g. 'dormitory', '+976 9911 2233'" },
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
  label: { icon: "🧹", mn: "Мартах", en: "Forget" },
  description: "Delete a saved fact from the device memory by its key.",
  parameters: { type: "object", properties: { key: { type: "string", description: "The memory key to delete" } }, required: ["key"] },
  async run(input, ctx) {
    const key = str(input.key, 60).toLowerCase();
    if (!(key in ctx.device.memory)) return { error: "Nothing saved under that key", keys: Object.keys(ctx.device.memory) };
    ctx.actions.push({ type: "forget", key });
    return { ok: true };
  },
};
