// Agent tool system: every AI provider sees the same tools.
import type { SkyKind } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

/** Where "send for me" can deliver a message. */
export type Channel = "telegram" | "discord" | "slack" | "sms" | "email";
export const CHANNELS: readonly Channel[] = ["telegram", "discord", "slack", "sms", "email"];

/** A skill the person taught: when they say `trigger`, run `steps` with the tools. */
export interface Routine {
  id: string;
  trigger: string;
  steps: string;
}

export type LessonLevel = "beginner" | "intermediate" | "advanced";
export const LESSON_LEVELS: readonly LessonLevel[] = ["beginner", "intermediate", "advanced"];

/** Progress in a tutor-mode lesson. */
export interface Lesson {
  id: string;
  topic: string;
  level: string; // a LessonLevel
  step: number;
  score: number; // 0-100, share of quiz answers correct so far
}

/** Something the assistant asks the person's device to do. */
export type ClientAction =
  | { type: "reminder"; id: string; text: string; at: string; repeatDaily: boolean }
  | { type: "cancel_reminder"; id: string }
  | { type: "remember"; key: string; value: string }
  | { type: "forget"; key: string }
  /** Call button. `known` = emergency number or saved in memory; unknown numbers get a warning. */
  | { type: "call"; number: string; label: string; known: boolean }
  /** Confirm card: nothing is sent until the person presses Send. */
  | { type: "message"; channel: Channel; to: string; subject: string; text: string }
  /** start/end are ISO instants; url opens Google Calendar with the event filled in. */
  | { type: "calendar"; title: string; start: string; end: string; details: string; url: string }
  | ({ type: "routine" } & Routine)
  | { type: "delete_routine"; id: string }
  | ({ type: "lesson" } & Lesson)
  /** "Open in Google Maps" card (url is a Google Maps link). */
  | { type: "map"; title: string; url: string }
  /** Weather result card (spec 10.2): the numbers behind a spoken weather answer. */
  | { type: "weather"; place: string; tempC: number; feelsC: number | null; kind: SkyKind; days: WeatherCardDay[] }
  /** In-app YouTube player (youtube-nocookie embed). videoId is 11 chars of [A-Za-z0-9_-]. */
  | { type: "video"; videoId: string; title: string; channel: string }
  /** In-app Spotify embed. id is the 22-char Spotify id. */
  | { type: "spotify"; kind: "track" | "playlist"; id: string; title: string; artist: string };

/** The ClientAction variants MediaCard plays. */
export type MediaAction = Extract<ClientAction, { type: "video" | "spotify" }>;
/** YouTube video ids are exactly 11 characters of [A-Za-z0-9_-]. */
export const isVideoId = (s: unknown): s is string => typeof s === "string" && /^[\w-]{11}$/.test(s);
/** Spotify ids are 22 base-62 characters. */
export const isSpotifyId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9]{22}$/.test(s);

export interface WeatherCardDay {
  date: string; // YYYY-MM-DD
  minC: number;
  maxC: number;
  kind: SkyKind;
  precipChance: number | null;
}

export interface Reminder {
  id: string;
  text: string;
  at: string; // ISO time
  repeatDaily: boolean;
}

export type VoiceStyle = "jarvis" | "friday";
export type Title = "mr" | "mrs" | "";

/** The person's choices from the settings panel. */
export interface Settings {
  voice?: VoiceStyle;
  title?: Title;
  /** Channel webhook URLs the person saved in Connections (validated with isAllowedWebhook). */
  webhooks?: { discord?: string; slack?: string };
  /** Only kept on the device (or encrypted server-side for linked bots); never sent to /api/ask. */
  gmailRefreshToken?: string;
  gmailConnected?: boolean;
  /** YYYY-MM-DD: the day the morning briefing last played. */
  lastBriefingDate?: string;
  /** Opt-in: send a rounded location with questions (directions, nearby places). Default off. */
  shareLocation?: boolean;
  /** "My city": where the HUD's weather, photo, air, traffic and buses are for when GPS is off. */
  city?: string;
}

/** What the device tells us about the person (stored only on their device). */
export interface DeviceContext {
  memory: Record<string, string>;
  reminders: Reminder[];
  settings?: Settings;
  /** Missing = none. */
  routines?: Routine[];
  /** Missing = none. */
  lessons?: Lesson[];
  /** Messaging apps the person connected (Telegram link, Discord/Slack webhooks). Missing = none. */
  connected?: Channel[];
  /** Only when the person turned on location sharing; rounded to 3 decimals (~100 m) by /api/ask. */
  location?: { lat: number; lng: number };
}

export interface ToolContext {
  now: Date;
  device: DeviceContext;
  actions: ClientAction[];
  /** Language of this message (for Maps answers). Missing = English. */
  lang?: Lang;
  /** Google access token with Gmail read access, fetched lazily (null = Gmail not connected). Server only. */
  gmailToken?: () => Promise<string | null>;
  /** The person's IANA time zone (device first, else the network). Missing = unknown (UTC is used). */
  timeZone?: string;
  /** The person's city (device or network). Missing = unknown. */
  city?: string;
  /** ISO 3166-1 alpha-2 country code from the network, e.g. "DE". Missing = unknown. */
  country?: string;
  /** City-level position from the network (never the device). Used only when no place is named. */
  approxLocation?: { lat: number; lng: number };
}

export interface Tool {
  name: string;
  /** Short label shown on screen while the tool runs (text only; no emoji or icon glyphs). */
  label: { mn: string; en: string };
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const bool = (v: unknown): boolean => v === true || v === "true";
