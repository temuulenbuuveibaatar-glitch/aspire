// The agent's toolbox. Add a tool here and every AI provider can use it.
import { getCalendar } from "./calendar";
import { addToCalendar, call, sendMessage } from "./connect";
import { checkEmail } from "./email";
import { deleteRoutine, listRoutines, saveProgress, saveRoutine, startLesson } from "./learning";
import { cancelReminder, forget, listReminders, localTime, nextBus, remember, setReminder, tripPlanner } from "./local";
import { findPlaces, getDirections } from "./maps";
import { playMusic, playVideo } from "./media";
import type { Tool, ToolContext } from "./types";
import { airQuality, calculator, currency, encyclopedia, weather } from "./world";

export type { Channel, ClientAction, DeviceContext, Lesson, Reminder, Routine, ToolContext } from "./types";

export const TOOLS: Tool[] = [
  nextBus,
  tripPlanner,
  getDirections,
  findPlaces,
  localTime,
  weather,
  airQuality,
  currency,
  encyclopedia,
  calculator,
  setReminder,
  listReminders,
  cancelReminder,
  remember,
  forget,
  startLesson,
  saveProgress,
  saveRoutine,
  listRoutines,
  deleteRoutine,
  sendMessage,
  call,
  addToCalendar,
  getCalendar,
  checkEmail,
  playVideo,
  playMusic,
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** One tool call, shown on screen as a text chip (the UI picks any icon from `tool`). */
export interface ToolStep {
  tool: string;
  label: string;
  ok: boolean;
}

/** Run one tool call; never throws (errors go back to the model as data). */
export async function runTool(name: string, input: unknown, ctx: ToolContext, steps: ToolStep[]): Promise<string> {
  const tool = BY_NAME.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool ${name}` });
  let ok = true;
  let result: unknown;
  try {
    result = await tool.run((input && typeof input === "object" ? input : {}) as Record<string, unknown>, ctx);
    if (result && typeof result === "object" && "error" in result) ok = false;
  } catch (e) {
    ok = false;
    result = { error: e instanceof Error ? e.message : "tool failed" };
  }
  steps.push({ tool: name, label: tool.label.en, ok });
  return typeof result === "string" ? result : JSON.stringify(result);
}

/** Labels for the UI, by tool name. */
export const TOOL_LABELS = Object.fromEntries(TOOLS.map((t) => [t.name, t.label]));
