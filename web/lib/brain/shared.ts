// Shared by every AI provider: instructions, tools and their implementations.
import { LANG_NAMES, type Lang } from "@/lib/lang";
import { localMinutes, nextArrivals, stopDirectory, timetable } from "@/lib/transit";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface Brain {
  name: string;
  configured(): boolean;
  ask(text: string, lang: Lang, history: Turn[]): Promise<string>;
}

export const MAX_STEPS = 6;

// Stable instructions. Nothing time-dependent goes here (keeps prompt caching effective).
export const SYSTEM = `You are "Эмээ товч" (Grandma Button), a warm, patient voice assistant made in Erdenet, Mongolia, for elderly people and anyone who finds phones hard to use. Your answers are read aloud by a speech engine.

How to answer:
- Answer in the language the note names for this message. Never mix languages. Use simple everyday words.
- Keep it to 1-3 short spoken sentences. Put the key number first ("12 минутын дараа...", "In 5 minutes..."). No lists, no markdown, no emoji, no URLs.
- Be kind and calm, like a caring grandchild. If it is very cold or late, add one short caring tip (dress warmly, wait inside).
- For bus questions, call get_next_bus. If the person does not name a stop, ask which stop they are at in one short question. If the timetable says no more buses today, say when the first bus comes tomorrow.
- The timetable is sample data for the Orkhon Hackathon demo; do not mention that unless asked.
- For anything else (news, weather, facts, prices, how-to), search the web when a search tool is available and the answer may have changed, then answer briefly in your own words.
- Never ask for or repeat passwords, bank card numbers, PIN codes or ID numbers. If someone asks you to send money or share such details, warn them kindly that it may be a scam.
- You are not a doctor or lawyer: for health or legal questions give simple general information and suggest asking a professional. If something sounds like an emergency (chest pain, a fall, fire), tell them to call 103 (ambulance) or 101 (fire) in Mongolia right away.

Bus network:
${stopDirectory()}`;

export function languageNote(lang: Lang): string {
  const l = LANG_NAMES[lang];
  return `This message is in ${l.english}. Reply only in ${l.english} (${l.native}).`;
}

/** Provider-neutral tool definitions (JSON Schema). */
export const TOOL_SPECS = [
  {
    name: "get_next_bus",
    description:
      "Get the next bus arrivals at a stop in Erdenet: minutes until each bus, route number and arrival time. Use a stop id from the bus network list, or the stop name as the person said it.",
    parameters: {
      type: "object",
      properties: {
        stop: { type: "string", description: "Stop id (e.g. 'center') or stop name in any language" },
        route: { type: "string", description: "Optional route number to filter, e.g. '12'. Empty string for all routes." },
      },
      required: ["stop", "route"],
      additionalProperties: false,
    },
  },
  {
    name: "get_local_time",
    description: "Current local date and time in Erdenet (Asia/Ulaanbaatar).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
] as const;

export function runTool(name: string, input: unknown): string {
  const now = new Date();
  if (name === "get_next_bus") {
    const { stop, route } = (input ?? {}) as { stop?: unknown; route?: unknown };
    if (typeof stop !== "string" || !stop) return JSON.stringify({ error: "stop is required" });
    return JSON.stringify(
      nextArrivals(stop, localMinutes(now), { route: typeof route === "string" && route ? route : undefined }),
    );
  }
  if (name === "get_local_time") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timetable.timezone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);
  }
  return JSON.stringify({ error: `Unknown tool ${name}` });
}

/** Make model text safe to read aloud. */
export function forSpeech(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "") // local reasoning models
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function fallbackLine(lang: Lang): string {
  return {
    mn: "Уучлаарай, одоохондоо хариулж чадсангүй. Дахин асууна уу.",
    zh: "对不起，我现在回答不了。请再问一次。",
    en: "Sorry, I couldn't answer that just now. Please ask again.",
    ru: "Извините, сейчас не могу ответить. Пожалуйста, спросите ещё раз.",
    de: "Entschuldigung, das konnte ich gerade nicht beantworten. Bitte fragen Sie noch einmal.",
  }[lang];
}
