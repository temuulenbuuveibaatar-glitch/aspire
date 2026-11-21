// "Send for me" tools: messages, calls and calendar events.
// None of these touch the network. Each one puts a confirm card on the person's screen;
// nothing is sent, posted or dialed until they press the button themselves.
import type { Lang } from "@/lib/lang";
import { googleCalendarUrl, phoneDigits } from "@/lib/links";
import { TIME_ZONE_PARAM, zoneFor } from "./local";
import { zonedTime } from "./time";
import { CHANNELS, type Channel, str, type Tool } from "./types";

// Emergency lines around the world (always "known", so no "check the number" warning). The
// kind, not an English label: the card shows it in the person's language.
type EmergencyKind = "emergency" | "police" | "fire" | "ambulance";
const EMERGENCY: Record<string, EmergencyKind> = {
  "112": "emergency", // EU, Russia, most of the world on mobile
  "911": "emergency", // Americas
  "999": "emergency", // UK, Hong Kong
  "000": "emergency", // Australia
  "111": "emergency", // New Zealand
  "110": "police", // China, Japan, Germany
  "119": "fire", // China, Japan, Korea
  "120": "ambulance", // China
  "101": "fire", // Mongolia
  "102": "police", // Mongolia, Russia
  "103": "ambulance", // Mongolia, Russia
  "105": "emergency", // Mongolia
};
const EMERGENCY_WORD: Record<Lang, Record<EmergencyKind, string>> = {
  mn: { emergency: "Яаралтай тусламж", police: "Цагдаа", fire: "Гал унтраах", ambulance: "Түргэн тусламж" },
  zh: { emergency: "紧急求助", police: "报警", fire: "火警", ambulance: "急救" },
  en: { emergency: "Emergency", police: "Police", fire: "Fire", ambulance: "Ambulance" },
  ru: { emergency: "Экстренная помощь", police: "Полиция", fire: "Пожарная", ambulance: "Скорая" },
  de: { emergency: "Notruf", police: "Polizei", fire: "Feuerwehr", ambulance: "Rettungsdienst" },
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINKED_CHANNELS: readonly Channel[] = ["telegram", "discord", "slack"];

/** Phone number in a comparable form: digits only, the last 8 digits (ignores country prefixes and trunk zeros). */
function localNumber(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.length > 8 ? digits.slice(-8) : digits;
}

/** 3-15 digits; spaces, dashes, brackets and a leading + allowed. Returns the cleaned number or null. */
function validPhone(raw: string): string | null {
  if (!/^\+?[\d\s()-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 3 && digits.length <= 15 ? phoneDigits(raw) : null;
}

/** Is this number an emergency line or one the person saved in memory? */
function isKnownNumber(number: string, memory: Record<string, string>): boolean {
  if (number in EMERGENCY) return true;
  const target = localNumber(number);
  return Object.values(memory).some((v) => (v.match(/\+?\d[\d\s()-]*\d/g) ?? []).some((found) => localNumber(found) === target));
}

export const sendMessage: Tool = {
  name: "send_message",
  label: { mn: "Мессеж", en: "Message" },
  description:
    "Prepare a message for the person to send: Telegram, Discord or Slack (only if connected), SMS (phone number) or email (address). It shows a card with the text; the person can edit it and must press Send. It is NOT sent by this tool, so never say it was sent: say it is ready to send. Write the text in the language they want it sent in.",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Where to send", enum: [...CHANNELS] },
      to: {
        type: "string",
        description: "Recipient: email address for email, phone number for sms, chat/channel name for telegram/discord/slack (e.g. '#team' or 'me')",
      },
      subject: { type: "string", description: "Email subject; empty string for other channels" },
      text: { type: "string", description: "The message text, up to 2000 characters" },
    },
    required: ["channel", "to", "subject", "text"],
  },
  async run(input, ctx) {
    const channel = str(input.channel, 20).toLowerCase() as Channel;
    if (!CHANNELS.includes(channel)) return { error: `channel must be one of ${CHANNELS.join(", ")}` };
    const rawText = typeof input.text === "string" ? input.text.trim() : "";
    if (!rawText) return { error: "text is required" };
    if (rawText.length > 2000) return { error: "text is longer than 2000 characters; shorten it" };
    let to = str(input.to, 120);
    const subject = channel === "email" ? str(input.subject, 200) : "";

    if (channel === "email") {
      if (!EMAIL.test(to)) return { error: "email needs a valid address like name@example.com; ask the person for it" };
    } else if (channel === "sms") {
      const n = validPhone(to);
      if (!n) return { error: "sms needs a phone number with 3-15 digits; ask the person for it" };
      to = n;
    } else if (LINKED_CHANNELS.includes(channel) && !(ctx.device.connected ?? []).includes(channel)) {
      return { error: `${channel} is not connected. Ask them to connect it in Settings, Connections` };
    }

    ctx.actions.push({ type: "message", channel, to, subject, text: rawText });
    return { ok: true, status: "ready — the person must press Send" };
  },
};

export const call: Tool = {
  name: "call_phone",
  label: { mn: "Залгах", en: "Call" },
  description:
    "Show a big 'Call' button for any phone number: the local emergency number for the person's country (112 in Europe, 911 in the Americas, 999 in the UK, 000 in Australia, 120 ambulance and 110 police in China, 103 ambulance and 101 fire in Mongolia and Russia), a number saved in memory, or a number the person says. The person presses it to call; it never dials by itself. Numbers that are not emergency or saved are marked as new: tell the person to check the number before calling.",
  parameters: {
    type: "object",
    properties: {
      number: { type: "string", description: "Phone number, e.g. '112' or '+4915123456789'" },
      label: { type: "string", description: "Who it is, in the person's language, e.g. 'Охин Сараа'" },
    },
    required: ["number", "label"],
  },
  async run(input, ctx) {
    const number = validPhone(str(input.number, 30));
    if (!number) return { error: "Not a valid phone number (needs 3-15 digits)" };
    const known = isKnownNumber(number, ctx.device.memory);
    const kind = EMERGENCY[number];
    const fallback = kind ? `${(EMERGENCY_WORD[ctx.lang ?? "en"] ?? EMERGENCY_WORD.en)[kind]} ${number}` : number;
    ctx.actions.push({ type: "call", number, label: str(input.label, 60) || fallback, known });
    return known ? { ok: true, shown: "call button", known } : { ok: true, shown: "call button", known, note: "New number: ask the person to check it before calling" };
  },
};

export const addToCalendar: Tool = {
  name: "add_to_calendar",
  label: { mn: "Календарь", en: "Calendar" },
  description:
    "Prepare a Google Calendar event (meeting, appointment, class). Shows an 'Add to Google Calendar' button; the person presses it to save. Times are the person's own local time. Get the local time first for words like 'tomorrow'.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Event title in the person's language" },
      date: { type: "string", description: "YYYY-MM-DD local date" },
      time: { type: "string", description: "Start time HH:MM (24h), local time" },
      duration_minutes: { type: "number", description: "Length in minutes, e.g. 60" },
      details: { type: "string", description: "Notes, place or empty string" },
      time_zone: TIME_ZONE_PARAM,
    },
    required: ["title", "date", "time", "duration_minutes", "details", "time_zone"],
  },
  async run(input, ctx) {
    const title = str(input.title, 120);
    if (!title) return { error: "title is required" };
    const start = zonedTime(str(input.date, 10), str(input.time, 5), zoneFor(input, ctx));
    if (!start) return { error: "date must be YYYY-MM-DD and time HH:MM" };
    const rawMinutes = Number(input.duration_minutes);
    const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.min(Math.round(rawMinutes), 24 * 60) : 60;
    const end = new Date(start.getTime() + minutes * 60_000);
    const details = str(input.details, 500);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    ctx.actions.push({ type: "calendar", title, start: startIso, end: endIso, details, url: googleCalendarUrl(title, startIso, endIso, details) });
    if (start.getTime() < ctx.now.getTime()) return { ok: true, shown: "calendar button", warning: "That time is in the past; check the date with the person" };
    return { ok: true, shown: "calendar button" };
  },
};
