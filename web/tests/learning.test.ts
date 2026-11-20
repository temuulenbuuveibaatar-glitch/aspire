import { describe, expect, it } from "vitest";
import { runTool, type ToolStep } from "@/lib/tools";
import type { DeviceContext, Lesson, Routine, ToolContext } from "@/lib/tools/types";

const NOW = new Date("2026-11-20T10:00:00+08:00");
const ctx = (device: Partial<DeviceContext> = {}): ToolContext => ({
  now: NOW,
  device: { memory: {}, reminders: [], ...device },
  actions: [],
});
const run = async (name: string, input: unknown, c = ctx()) => {
  const steps: ToolStep[] = [];
  return { out: JSON.parse(await runTool(name, input, c, steps)), c, steps };
};

const routine = (i: number): Routine => ({ id: `rt${i}`, trigger: `trigger ${i}`, steps: "do things" });
const lesson: Lesson = { id: "l1", topic: "Nuclear physics", level: "beginner", step: 2, score: 50 };

describe("lessons (teach me)", () => {
  it("start_lesson creates a lesson action", async () => {
    const { out, c } = await run("start_lesson", { topic: "Aerodynamics", level: "intermediate" });
    expect(out.ok).toBe(true);
    expect(typeof out.lessonId).toBe("string");
    expect(c.actions).toEqual([{ type: "lesson", id: out.lessonId, topic: "Aerodynamics", level: "intermediate", step: 1, score: 0 }]);
  });

  it("start_lesson needs a topic and falls back to beginner level", async () => {
    expect((await run("start_lesson", { topic: "", level: "beginner" })).out.error).toBeTruthy();
    const { c } = await run("start_lesson", { topic: "Chess", level: "wizard" });
    expect(c.actions[0]).toMatchObject({ type: "lesson", level: "beginner" });
  });

  it("save_progress updates a known lesson", async () => {
    const { out, c } = await run("save_progress", { lesson_id: "l1", step: 3, score: 75 }, ctx({ lessons: [lesson] }));
    expect(out.ok).toBe(true);
    expect(c.actions).toEqual([{ type: "lesson", id: "l1", topic: "Nuclear physics", level: "beginner", step: 3, score: 75 }]);
  });

  it("save_progress works for a lesson started earlier in the same answer", async () => {
    const c = ctx();
    const started = await run("start_lesson", { topic: "Jet engines", level: "beginner" }, c);
    const { out } = await run("save_progress", { lesson_id: started.out.lessonId, step: 2, score: 100 }, c);
    expect(out.ok).toBe(true);
    expect(c.actions.at(-1)).toMatchObject({ type: "lesson", topic: "Jet engines", step: 2, score: 100 });
  });

  it("save_progress unknown id errors", async () => {
    const { out, c, steps } = await run("save_progress", { lesson_id: "nope", step: 2, score: 10 }, ctx({ lessons: [lesson] }));
    expect(out.error).toBeTruthy();
    expect(c.actions).toEqual([]);
    expect(steps[0].ok).toBe(false);
  });
});

describe("routines (I teach it skills)", () => {
  it("saves a routine", async () => {
    const { out, c } = await run("save_routine", { trigger: "Going home", steps: "Next bus to Хороолол and the weather" });
    expect(out.ok).toBe(true);
    expect(c.actions[0]).toMatchObject({ type: "routine", trigger: "Going home", steps: "Next bus to Хороолол and the weather" });
  });

  it("routine limits", async () => {
    expect((await run("save_routine", { trigger: "x".repeat(61), steps: "ok" })).out.error).toBeTruthy();
    expect((await run("save_routine", { trigger: "ok", steps: "x".repeat(501) })).out.error).toBeTruthy();
    const full = ctx({ routines: Array.from({ length: 20 }, (_, i) => routine(i)) });
    const { out, c } = await run("save_routine", { trigger: "one more", steps: "do it" }, full);
    expect(out.error).toBeTruthy();
    expect(c.actions).toEqual([]);
  });

  it("saving an existing trigger updates it (even when full)", async () => {
    const full = ctx({ routines: Array.from({ length: 20 }, (_, i) => routine(i)) });
    const { out, c } = await run("save_routine", { trigger: "TRIGGER 3", steps: "new steps" }, full);
    expect(out.ok).toBe(true);
    expect(c.actions[0]).toEqual({ type: "routine", id: "rt3", trigger: "TRIGGER 3", steps: "new steps" });
  });

  it("lists and deletes routines", async () => {
    const c = ctx({ routines: [routine(1), routine(2)] });
    expect((await run("list_routines", {}, c)).out.routines).toHaveLength(2);
    expect((await run("delete_routine", { id: "rt2" }, c)).c.actions).toEqual([{ type: "delete_routine", id: "rt2" }]);
    expect((await run("delete_routine", { id: "missing" }, ctx())).out.error).toBeTruthy();
  });
});
