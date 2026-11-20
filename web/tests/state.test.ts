import { describe, expect, it } from "vitest";
import {
  applyActions,
  emptyState,
  fromDevice,
  mergeState,
  parseState,
  stripLocalOnly,
  takeDue,
  toDevice,
  TOMBSTONE_TTL_MS,
  type UserState,
} from "@/lib/state";
import { migrateLegacy } from "@/lib/device-store";

const at = (hhmm: string, day = "2026-11-20") => new Date(`${day}T${hhmm}:00.000Z`);
const iso = (hhmm: string, day = "2026-11-20") => at(hhmm, day).toISOString();

function withMemory(key: string, value: string, when: string, deleted = false): UserState {
  return { ...emptyState(), memory: { [key]: { value, updatedAt: when, ...(deleted ? { deleted: true } : {}) } } };
}

describe("mergeState (item-level, newer wins)", () => {
  it("newer item wins per key", () => {
    const phone = withMemory("home", "Erdenet 5-12", iso("10:00"));
    const cloud = withMemory("home", "Erdenet 7-3", iso("10:05"));
    expect(mergeState(phone, cloud, at("10:10")).memory.home.value).toBe("Erdenet 7-3");
    expect(mergeState(cloud, phone, at("10:10")).memory.home.value).toBe("Erdenet 7-3");
  });

  it("delete beats older edit", () => {
    const edit = withMemory("home", "old", iso("10:00"));
    const del = withMemory("home", "old", iso("10:05"), true);
    const merged = mergeState(edit, del, at("10:10"));
    expect(merged.memory.home.deleted).toBe(true);
    expect(toDevice(merged).memory).toEqual({});
  });

  it("edit after delete resurrects", () => {
    const del = withMemory("home", "old", iso("10:00"), true);
    const edit = withMemory("home", "new", iso("10:05"));
    const merged = mergeState(del, edit, at("10:10"));
    expect(merged.memory.home.deleted).toBeUndefined();
    expect(toDevice(merged).memory).toEqual({ home: "new" });
  });

  it("old tombstones dropped after 30 days", () => {
    const del = withMemory("home", "x", iso("10:00", "2026-10-01"), true);
    const fresh = withMemory("work", "y", iso("10:00"), true);
    const merged = mergeState(del, fresh, at("10:00", "2026-11-20"));
    expect(merged.memory.home).toBeUndefined();
    expect(merged.memory.work.deleted).toBe(true);
    expect(TOMBSTONE_TTL_MS).toBe(30 * 86_400_000);
  });

  it("two sides add different reminders: both kept, sorted by time", () => {
    const now = at("09:00");
    const a = applyActions(emptyState(), [{ type: "reminder", id: "r1", text: "pills", at: iso("12:00"), repeatDaily: false }], now);
    const b = applyActions(emptyState(), [{ type: "reminder", id: "r2", text: "bus", at: iso("11:00"), repeatDaily: true }], now);
    const merged = mergeState(a, b, now);
    expect(merged.reminders.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("settings: the newer settings object wins", () => {
    const a: UserState = { ...emptyState(), settings: { voice: "friday", updatedAt: iso("10:00") } };
    const b: UserState = { ...emptyState(), settings: { voice: "jarvis", updatedAt: iso("10:01") } };
    expect(mergeState(a, b, at("10:02")).settings.voice).toBe("jarvis");
    expect(mergeState(b, a, at("10:02")).settings.voice).toBe("jarvis");
  });

  it("is idempotent and order independent", () => {
    const now = at("10:00");
    const a = applyActions(emptyState(), [{ type: "remember", key: "k", value: "1" }], now);
    const b = applyActions(emptyState(), [{ type: "routine", id: "x", trigger: "go", steps: "do" }], now);
    expect(mergeState(a, b, now)).toEqual(mergeState(b, a, now));
    const m = mergeState(a, b, now);
    expect(mergeState(m, m, now)).toEqual(m);
  });
});

describe("applyActions on stamped state", () => {
  it("forget, cancel and delete leave tombstones", () => {
    const t0 = at("08:00");
    const t1 = at("08:30");
    let s = applyActions(
      emptyState(),
      [
        { type: "remember", key: "son", value: "Bat" },
        { type: "reminder", id: "r", text: "x", at: iso("12:00"), repeatDaily: false },
        { type: "routine", id: "rt", trigger: "morning", steps: "weather" },
        { type: "lesson", id: "l", topic: "Physics", level: "beginner", step: 1, score: 0 },
      ],
      t0,
    );
    s = applyActions(
      s,
      [
        { type: "forget", key: "son" },
        { type: "cancel_reminder", id: "r" },
        { type: "delete_routine", id: "rt" },
      ],
      t1,
    );
    expect(s.memory.son).toEqual({ value: "Bat", updatedAt: t1.toISOString(), deleted: true });
    expect(s.reminders[0]).toMatchObject({ id: "r", deleted: true, updatedAt: t1.toISOString() });
    expect(s.routines[0]).toMatchObject({ id: "rt", deleted: true });
    expect(s.lessons[0]).toMatchObject({ id: "l", updatedAt: t0.toISOString() });
    const d = toDevice(s);
    expect(d).toEqual({
      memory: {},
      reminders: [],
      routines: [],
      lessons: [{ id: "l", topic: "Physics", level: "beginner", step: 1, score: 0 }],
      settings: {},
    });
  });

  it("ignores card-only actions", () => {
    const s = applyActions(emptyState(), [{ type: "call", number: "103", label: "Ambulance", known: true }], at("08:00"));
    expect(s).toEqual(emptyState());
  });
});

describe("takeDue", () => {
  it("daily reminder rescheduled, one-off fires once", () => {
    const s = applyActions(
      emptyState(),
      [
        { type: "reminder", id: "a", text: "once", at: "2026-11-20T01:00:00.000Z", repeatDaily: false },
        { type: "reminder", id: "b", text: "daily", at: "2026-11-20T01:00:00.000Z", repeatDaily: true },
        { type: "reminder", id: "c", text: "later", at: "2026-11-20T05:00:00.000Z", repeatDaily: false },
      ],
      at("00:00"),
    );
    const now = new Date("2026-11-20T02:00:00.000Z");
    const { due, next } = takeDue(s, now);
    expect(due).toEqual([
      { id: "a", text: "once", at: "2026-11-20T01:00:00.000Z", repeatDaily: false },
      { id: "b", text: "daily", at: "2026-11-20T01:00:00.000Z", repeatDaily: true },
    ]);
    expect(toDevice(next).reminders.map((r) => [r.id, r.at])).toEqual([
      ["c", "2026-11-20T05:00:00.000Z"],
      ["b", "2026-11-21T01:00:00.000Z"],
    ]);
    // fired one-off is a tombstone so another device cannot bring it back
    expect(next.reminders.find((r) => r.id === "a")).toMatchObject({ deleted: true, updatedAt: now.toISOString() });
    // due reminders fire once
    expect(takeDue(next, now).due).toEqual([]);
  });

  it("returns the same object when nothing is due", () => {
    const s = emptyState();
    expect(takeDue(s, at("10:00")).next).toBe(s);
  });
});

describe("device conversions, parsing and migration", () => {
  it("fromDevice stamps only what changed", () => {
    const t0 = at("08:00");
    const t1 = at("09:00");
    const prev = applyActions(
      emptyState(),
      [
        { type: "remember", key: "a", value: "1" },
        { type: "remember", key: "b", value: "2" },
      ],
      t0,
    );
    const device = toDevice(prev);
    const next = fromDevice(prev, { ...device, memory: { a: "1", c: "3" }, settings: { voice: "friday" } }, t1);
    expect(next.memory.a.updatedAt).toBe(t0.toISOString());
    expect(next.memory.b).toMatchObject({ deleted: true, updatedAt: t1.toISOString() });
    expect(next.memory.c).toEqual({ value: "3", updatedAt: t1.toISOString() });
    expect(next.settings).toEqual({ voice: "friday", updatedAt: t1.toISOString() });
    // no change -> same object
    expect(fromDevice(next, toDevice(next), at("10:00"))).toBe(next);
  });

  it("parseState cleans hostile input", () => {
    expect(parseState(null)).toBeNull();
    expect(parseState({ memory: "x" })).toBeNull();
    const s = parseState({
      memory: { ok: { value: "v", updatedAt: iso("10:00") }, bad: { value: 3, updatedAt: "x" }, ["k".repeat(500)]: { value: "y", updatedAt: iso("10:00") } },
      reminders: [{ id: "r", text: "t", at: iso("11:00"), repeatDaily: "yes", updatedAt: iso("10:00") }, { id: 5 }],
      routines: [],
      lessons: [{ id: "l", topic: "T", level: "guru", step: 99999, score: 400, updatedAt: iso("10:00") }],
      settings: { voice: "friday", title: "boss", updatedAt: iso("10:00"), gmailRefreshToken: "secret" },
    })!;
    expect(Object.keys(s.memory)).toEqual(["ok", "k".repeat(60)]);
    expect(s.reminders).toEqual([{ id: "r", text: "t", at: iso("11:00"), repeatDaily: false, updatedAt: iso("10:00") }]);
    expect(s.lessons[0]).toMatchObject({ level: "beginner", step: 1000, score: 100 });
    expect(s.settings).toEqual({ voice: "friday", gmailRefreshToken: "secret", updatedAt: iso("10:00") });
  });

  it("stripLocalOnly removes the Gmail refresh token and webhooks", () => {
    const s: UserState = {
      ...emptyState(),
      settings: { voice: "jarvis", gmailRefreshToken: "rt", webhooks: { discord: "https://discord.com/api/webhooks/1/a" }, updatedAt: iso("10:00") },
    };
    expect(stripLocalOnly(s).settings).toEqual({ voice: "jarvis", updatedAt: iso("10:00") });
  });

  it("migrates v1 storage into stamped form", () => {
    const now = at("12:00");
    const s = migrateLegacy(
      {
        memory: { home: "Erdenet" },
        reminders: [{ id: "r", text: "bus", at: iso("13:00"), repeatDaily: false }],
        settings: { voice: "friday" },
        routines: [{ id: "x", trigger: "t", steps: "s" }],
      },
      now,
    );
    expect(s.memory.home).toEqual({ value: "Erdenet", updatedAt: now.toISOString() });
    expect(s.reminders[0]).toMatchObject({ id: "r", updatedAt: now.toISOString() });
    expect(s.routines).toHaveLength(1);
    expect(s.settings).toEqual({ voice: "friday", updatedAt: now.toISOString() });
    expect(toDevice(s).memory).toEqual({ home: "Erdenet" });
  });
});
