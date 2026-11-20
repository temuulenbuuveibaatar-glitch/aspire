// Agent tool system: every AI provider sees the same tools.

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
  | ({ type: "lesson" } & Lesson);

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
  /** YYYY-MM-DD in Mongolia time: the day the morning briefing last played. */
  lastBriefingDate?: string;
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
}

export interface ToolContext {
  now: Date;
  device: DeviceContext;
  actions: ClientAction[];
  /** Google access token with Gmail read access, fetched lazily (null = Gmail not connected). Server only. */
  gmailToken?: () => Promise<string | null>;
}

export interface Tool {
  name: string;
  /** Short label shown on screen while the tool runs. */
  label: { icon: string; mn: string; en: string };
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
