// The agent's toolbox. Add a tool here and every AI provider can use it.
import { appTools } from "./apps";
import { getCalendar } from "./calendar";
import { cameraTools } from "./cameras";
import { cityTools } from "./city";
import { addToCalendar, call, sendMessage } from "./connect";
import { desktopTools, desktopToolsFor } from "./desktop";
import { checkEmail } from "./email";
import { deleteRoutine, listRoutines, saveProgress, saveRoutine, startLesson } from "./learning";
import { cancelReminder, forget, listReminders, localTime, nextBus, remember, setReminder, tripPlanner } from "./local";
import { findPlaces, getDirections } from "./maps";
import { playMusic, playVideo } from "./media";
import { newsTools } from "./news";
import { taskTools } from "./tasks";
import type { Tool, ToolContext } from "./types";
import { airQuality, calculator, currency, encyclopedia, weather } from "./world";

export type { Channel, ClientAction, DeviceContext, Lesson, Reminder, Routine, ToolContext } from "./types";
export { desktopToolsFor } from "./desktop";

export const TOOLS: Tool[] = [
  nextBus,
  tripPlanner,
  ...cityTools,
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
  ...newsTools,
  ...taskTools,
  ...appTools,
  ...cameraTools,
];

/**
 * Every tool a model is told about: TOOLS plus the desktop_* tools. The desktop tools run only for
 * a direct, signed-in web request (ctx.userId and ctx.source "web"); bots and cron get an error.
 */
export const ALL_TOOLS: Tool[] = [...TOOLS, ...desktopTools];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
const DESKTOP_NAMES = new Set(desktopTools.map((t) => t.name));

const findTool = (name: string, ctx: ToolContext): Tool | undefined =>
  BY_NAME.get(name) ?? (DESKTOP_NAMES.has(name) ? desktopToolsFor(ctx).find((t) => t.name === name) : undefined);

/** One tool call, shown on screen as a text chip (the UI picks any icon from `tool`). */
export interface ToolStep {
  tool: string;
  label: string;
  ok: boolean;
}

/** Run one tool call; never throws (errors go back to the model as data). */
export async function runTool(name: string, input: unknown, ctx: ToolContext, steps: ToolStep[]): Promise<string> {
  const tool = findTool(name, ctx);
  if (!tool) {
    const error = DESKTOP_NAMES.has(name) ? "Only a signed-in person in the Aspire app can use their computer from Aspire." : `Unknown tool ${name}`;
    return JSON.stringify({ error });
  }
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
export const TOOL_LABELS = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.label]));
