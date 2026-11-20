// Agent tool system: every AI provider sees the same tools.

/** Something the assistant asks the person's device to do. */
export type ClientAction =
  | { type: "reminder"; id: string; text: string; at: string; repeatDaily: boolean }
  | { type: "cancel_reminder"; id: string }
  | { type: "remember"; key: string; value: string }
  | { type: "forget"; key: string }
  | { type: "call"; number: string; label: string };

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
}

/** What the device tells us about the person (stored only on their device). */
export interface DeviceContext {
  memory: Record<string, string>;
  reminders: Reminder[];
  settings?: Settings;
}

export interface ToolContext {
  now: Date;
  device: DeviceContext;
  actions: ClientAction[];
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
