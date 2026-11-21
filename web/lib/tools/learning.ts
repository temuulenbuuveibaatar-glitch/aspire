// Learning tools: tutor-mode lessons ("teach me") and routines ("I teach you a skill").
// They only push ClientActions; the device stores lessons and routines. No network.
import { LESSON_LEVELS, type Lesson, type LessonLevel, str, type Tool, type ToolContext } from "./types";

const MAX_LESSONS = 20;
const MAX_ROUTINES = 20;
const MAX_TRIGGER = 60;
const MAX_STEPS = 500;

const newId = (prefix: string, now: Date) => `${prefix}${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Clamp a model-supplied number to an integer range. */
function int(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
}

/** The lesson as it stands now: device copy, overridden by anything this answer already changed. */
function findLesson(ctx: ToolContext, id: string): Lesson | undefined {
  for (let i = ctx.actions.length - 1; i >= 0; i--) {
    const a = ctx.actions[i];
    if (a.type === "lesson" && a.id === id) return { id: a.id, topic: a.topic, level: a.level, step: a.step, score: a.score };
  }
  return (ctx.device.lessons ?? []).find((l) => l.id === id);
}

export const startLesson: Tool = {
  name: "start_lesson",
  label: { mn: "Хичээл", en: "Lesson" },
  description:
    "Start a tutor-mode lesson when the person wants to learn a topic step by step (e.g. 'teach me aerodynamics'). Then teach one small step at a time, ask one quiz question at a time, wait for the answer, and record progress with save_progress. Returns the lesson id.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What they want to learn, e.g. 'Nuclear physics'" },
      level: { type: "string", description: "Their level", enum: [...LESSON_LEVELS] },
    },
    required: ["topic", "level"],
  },
  async run(input, ctx) {
    const topic = str(input.topic, 120);
    if (!topic) return { error: "topic is required" };
    const rawLevel = str(input.level, 20).toLowerCase() as LessonLevel;
    const level: LessonLevel = LESSON_LEVELS.includes(rawLevel) ? rawLevel : "beginner";
    const same = (ctx.device.lessons ?? []).find((l) => l.topic.toLowerCase() === topic.toLowerCase());
    if (same) return { ok: true, lessonId: same.id, resumed: true, step: same.step, score: same.score };
    if ((ctx.device.lessons ?? []).length >= MAX_LESSONS) return { error: "Too many lessons saved; ask the person to delete an old one first" };
    const id = newId("l", ctx.now);
    ctx.actions.push({ type: "lesson", id, topic, level, step: 1, score: 0 });
    return { ok: true, lessonId: id };
  },
};

export const saveProgress: Tool = {
  name: "save_progress",
  label: { mn: "Ахиц", en: "Progress" },
  description: "Save the person's progress in a lesson after a step or quiz answer: the step they reached and their score (0-100, share of quiz answers correct so far).",
  parameters: {
    type: "object",
    properties: {
      lesson_id: { type: "string", description: "Lesson id from start_lesson or the note" },
      step: { type: "number", description: "Step number they reached (1, 2, 3...)" },
      score: { type: "number", description: "0-100" },
    },
    required: ["lesson_id", "step", "score"],
  },
  async run(input, ctx) {
    const lesson = findLesson(ctx, str(input.lesson_id, 40));
    if (!lesson) return { error: "No lesson with that id; start one with start_lesson" };
    const step = int(input.step, 1, 1000) ?? lesson.step;
    const score = int(input.score, 0, 100) ?? lesson.score;
    ctx.actions.push({ type: "lesson", ...lesson, step, score });
    return { ok: true, step, score };
  },
};

export const saveRoutine: Tool = {
  name: "save_routine",
  label: { mn: "Дадал", en: "Routine" },
  description:
    "Save a routine the person teaches you: 'When I say <trigger>, do <steps>'. Later, when a message matches the trigger, run the steps with your tools. Saving the same trigger again replaces its steps.",
  parameters: {
    type: "object",
    properties: {
      trigger: { type: "string", description: "The phrase, max 60 characters, e.g. 'going home'" },
      steps: { type: "string", description: "What to do, max 500 characters, e.g. 'tell me the next bus to Хороолол and the weather'" },
    },
    required: ["trigger", "steps"],
  },
  async run(input, ctx) {
    const trigger = typeof input.trigger === "string" ? input.trigger.trim() : "";
    const steps = typeof input.steps === "string" ? input.steps.trim() : "";
    if (!trigger || !steps) return { error: "trigger and steps are required" };
    if (trigger.length > MAX_TRIGGER) return { error: `trigger must be at most ${MAX_TRIGGER} characters; shorten it` };
    if (steps.length > MAX_STEPS) return { error: `steps must be at most ${MAX_STEPS} characters; shorten them` };
    const routines = ctx.device.routines ?? [];
    const existing = routines.find((r) => r.trigger.toLowerCase() === trigger.toLowerCase());
    if (!existing && routines.length >= MAX_ROUTINES) return { error: `Already ${MAX_ROUTINES} routines; ask the person to delete one first` };
    const id = existing?.id ?? newId("rt", ctx.now);
    ctx.actions.push({ type: "routine", id, trigger, steps });
    return { ok: true, id, replaced: Boolean(existing) };
  },
};

export const listRoutines: Tool = {
  name: "list_routines",
  label: { mn: "Дадлууд", en: "Routines" },
  description: "List the routines the person taught you (id, trigger, steps).",
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, ctx) {
    return { routines: (ctx.device.routines ?? []).map((r) => ({ id: r.id, trigger: r.trigger, steps: r.steps })) };
  },
};

export const deleteRoutine: Tool = {
  name: "delete_routine",
  label: { mn: "Дадал устгах", en: "Delete routine" },
  description: "Delete a routine by id (get ids with list_routines).",
  parameters: { type: "object", properties: { id: { type: "string", description: "Routine id" } }, required: ["id"] },
  async run(input, ctx) {
    const id = str(input.id, 40);
    if (!(ctx.device.routines ?? []).some((r) => r.id === id)) return { error: "No routine with that id" };
    ctx.actions.push({ type: "delete_routine", id });
    return { ok: true };
  },
};
