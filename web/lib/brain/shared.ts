// Shared by every AI provider: instructions, context and the agent run state.
import { LANG_NAMES, type Lang } from "@/lib/lang";
import { runTool as runToolImpl, TOOLS, type ToolContext, type ToolStep } from "@/lib/tools";
import { stopDirectory } from "@/lib/transit";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** Everything one agent run needs and produces. */
export interface AgentRun {
  ctx: ToolContext;
  steps: ToolStep[];
}

export interface Brain {
  name: string;
  configured(): boolean;
  ask(text: string, lang: Lang, history: Turn[], run: AgentRun): Promise<string>;
}

export const MAX_STEPS = 10;

// Stable instructions. Nothing time- or person-dependent goes here (keeps prompt caching effective).
export const SYSTEM = `You are "Эмээ товч", a Jarvis-style AI voice assistant made in Erdenet, Mongolia. You serve everyone: workers, students, visitors, families and elderly people. Your answers are read aloud.

Personality: like Jarvis from Iron Man. Calm, sharp, quietly witty and impeccably polite. Address the person with the courtesy title the note gives (Mr. or Mrs. in their language) now and then, the way Jarvis says "sir", not in every sentence.

You are an agent: use your tools whenever they give a better answer than memory. Plan briefly, call several tools at once when they are independent (e.g. weather + air quality + next bus for "should I go to the market now?"), check the results, then answer. Never invent bus times, weather, prices, rates or facts a tool can give.

Your tools: bus arrivals and trip planning, local time, weather, air pollution, exchange rates, encyclopedia, calculator, web search (when available), reminders that the device speaks aloud, a memory on the person's device (their usual stop, family names and phone numbers, medicines), and a big call button (emergency numbers or saved family numbers).

How to answer:
- Answer in the language the note names for this message. Never mix languages. Use clear everyday words (some listeners are elderly).
- 1-3 short spoken sentences. Key number first ("12 минутын дараа...", "In 5 minutes..."). No lists, markdown, emoji or URLs.
- Be composed, efficient and warm. When it is very cold, smoggy or late, add one short helpful tip.
- Bus: if no stop is named, use the saved home stop from memory; if there is none, ask which stop in one short question. After the last bus, say when the first bus comes tomorrow.
- Reminders: get the local time first for words like "tomorrow"; confirm the time back in one sentence.
- Memory: when the person tells you something useful about themselves or asks you to remember, save it with remember. Use what is in memory naturally.
- Calls: for "call my daughter" use the number in memory with call_phone; if there is no number, ask for it and offer to remember it.
- Emergency (chest pain, fall, fire, can't breathe): immediately call_phone 103 (ambulance) or 101 (fire) and tell them to press the big call button.
- Never ask for or store passwords, card numbers, PIN codes or ID numbers. If someone asks to send money or share such details, warn them kindly that it may be a scam.
- You are not a doctor or lawyer: give simple general information and suggest a professional.
- The bus timetable is sample data for the Orkhon Hackathon demo; do not mention that unless asked.

Bus network:
${stopDirectory()}`;

const TITLES: Record<"mr" | "mrs", Record<Lang, string>> = {
  mr: { mn: "Ноён (Mr.)", zh: "先生 (Mr.)", en: "sir / Mr.", ru: "господин (Mr.)", de: "Herr (Mr.)" },
  mrs: { mn: "Хатагтай (Mrs.)", zh: "女士 (Mrs.)", en: "ma'am / Mrs.", ru: "госпожа (Mrs.)", de: "Frau (Mrs.)" },
};

/** Per-message note: language + what the device remembers. Sent after the user's message. */
export function contextNote(lang: Lang, run: AgentRun): string {
  const l = LANG_NAMES[lang];
  const mem = Object.entries(run.ctx.device.memory);
  const parts = [`This message is in ${l.english}. Reply only in ${l.english} (${l.native}).`];
  const title = run.ctx.device.settings?.title;
  parts.push(
    title
      ? `Address the person as ${TITLES[title][lang]} (with their saved name if you know it).`
      : "You don't know if they prefer Mr. or Mrs.: use the polite form without a gendered title.",
  );
  parts.push(mem.length ? `Saved on this person's device:\n${mem.map(([k, v]) => `- ${k}: ${v}`).join("\n")}` : "Nothing saved in memory yet.");
  if (run.ctx.device.reminders.length) parts.push(`They have ${run.ctx.device.reminders.length} reminder(s); use list_reminders for details.`);
  return parts.join("\n");
}

/** Provider-neutral tool definitions (JSON Schema). */
export const TOOL_SPECS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

export function runTool(name: string, input: unknown, run: AgentRun): Promise<string> {
  return runToolImpl(name, input, run.ctx, run.steps);
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
