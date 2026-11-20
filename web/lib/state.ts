// The person's state with a time stamp on every item, so the phone and the cloud copy (for
// linked bots) can be merged item by item: memory per key, reminders/routines/lessons per id,
// settings as one object. The newer `updatedAt` wins; deletions are kept as tombstones for 30
// days so an old copy cannot bring a deleted item back. Pure functions, safe on server and client.
import {
  LESSON_LEVELS,
  type ClientAction,
  type DeviceContext,
  type Lesson,
  type Reminder,
  type Routine,
  type Settings,
} from "@/lib/tools/types";

export type Stamp = { updatedAt: string; deleted?: boolean };
export type MemoryItem = { value: string } & Stamp;
export type StampedSettings = Settings & { updatedAt: string };

export interface UserState {
  memory: Record<string, MemoryItem>;
  reminders: (Reminder & Stamp)[];
  routines: (Routine & Stamp)[];
  lessons: (Lesson & Stamp)[];
  settings: StampedSettings;
}

export const TOMBSTONE_TTL_MS = 30 * 86_400_000;
/** Settings that never leave the device (secrets). */
export const LOCAL_ONLY_SETTINGS = ["gmailRefreshToken", "webhooks"] as const;

const EPOCH = new Date(0).toISOString();

export function emptyState(): UserState {
  return { memory: {}, reminders: [], routines: [], lessons: [], settings: { updatedAt: EPOCH } };
}

const byAt = (a: { at: string }, b: { at: string }) => a.at.localeCompare(b.at) || 0;

// ---------------------------------------------------------------------------
// Actions from the assistant

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return [...list.filter((x) => x.id !== item.id), item];
}

function tombstone<T extends { id: string } & Stamp>(list: T[], id: string, when: string): T[] {
  return list.map((x) => (x.id === id && !x.deleted ? { ...x, deleted: true, updatedAt: when } : x));
}

/** Apply the assistant's actions. Forget/cancel/delete leave tombstones. Card-only actions are ignored. */
export function applyActions(s: UserState, actions: ClientAction[], now: Date): UserState {
  const when = now.toISOString();
  let { memory, reminders, routines, lessons } = s;
  let changed = false;
  for (const a of actions) {
    switch (a.type) {
      case "remember":
        memory = { ...memory, [a.key]: { value: a.value, updatedAt: when } };
        break;
      case "forget":
        if (!memory[a.key] || memory[a.key].deleted) continue;
        memory = { ...memory, [a.key]: { ...memory[a.key], deleted: true, updatedAt: when } };
        break;
      case "reminder":
        reminders = upsert(reminders, { id: a.id, text: a.text, at: a.at, repeatDaily: a.repeatDaily, updatedAt: when });
        break;
      case "cancel_reminder":
        reminders = tombstone(reminders, a.id, when);
        break;
      case "routine":
        routines = upsert(routines, { id: a.id, trigger: a.trigger, steps: a.steps, updatedAt: when });
        break;
      case "delete_routine":
        routines = tombstone(routines, a.id, when);
        break;
      case "lesson":
        lessons = upsert(lessons, { id: a.id, topic: a.topic, level: a.level, step: a.step, score: a.score, updatedAt: when });
        break;
      default:
        continue; // call / message / calendar are cards, not state
    }
    changed = true;
  }
  if (!changed) return s;
  return { ...s, memory, reminders: [...reminders].sort(byAt), routines, lessons };
}

const plainReminder = ({ id, text, at, repeatDaily }: Reminder): Reminder => ({ id, text, at, repeatDaily });

/** Reminders due now, and the state with daily ones moved to their next time and one-offs tombstoned. */
export function takeDue(s: UserState, now: Date): { due: Reminder[]; next: UserState } {
  const t = now.getTime();
  const due = s.reminders.filter((r) => !r.deleted && new Date(r.at).getTime() <= t);
  if (!due.length) return { due: [], next: s };
  const when = now.toISOString();
  const reminders = s.reminders
    .map((r) => {
      if (!due.includes(r)) return r;
      if (!r.repeatDaily) return { ...r, deleted: true, updatedAt: when };
      return { ...r, at: nextDaily(r.at, now), updatedAt: when };
    })
    .sort(byAt);
  return { due: due.map(plainReminder), next: { ...s, reminders } };
}

/** The first daily occurrence of `at` that is after `now`. */
export function nextDaily(at: string, now: Date): string {
  let t = new Date(at).getTime();
  while (t <= now.getTime()) t += 86_400_000;
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------------
// Merge

/** a vs b: the newer stamp wins; on a tie a deletion wins, then the larger JSON (deterministic). */
function newer<T extends Stamp>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function live<T extends Stamp>(x: T, cutoff: string): boolean {
  return !x.deleted || x.updatedAt >= cutoff;
}

function mergeById<T extends { id: string } & Stamp>(a: T[], b: T[], cutoff: string): T[] {
  const out = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const have = out.get(x.id);
    out.set(x.id, have ? newer(have, x) : x);
  }
  return [...out.values()].filter((x) => live(x, cutoff));
}

/** Item-level merge: per key/id the larger `updatedAt` wins; tombstones older than 30 days are dropped. */
export function mergeState(a: UserState, b: UserState, now: Date): UserState {
  const cutoff = new Date(now.getTime() - TOMBSTONE_TTL_MS).toISOString();
  const memory: Record<string, MemoryItem> = {};
  for (const key of [...new Set([...Object.keys(a.memory), ...Object.keys(b.memory)])].sort()) {
    const x = a.memory[key];
    const y = b.memory[key];
    const winner = x && y ? newer(x, y) : (x ?? y);
    if (live(winner, cutoff)) memory[key] = winner;
  }
  const sortId = <T extends { id: string }>(l: T[]) => l.sort((p, q) => p.id.localeCompare(q.id));
  return {
    memory,
    reminders: sortId(mergeById(a.reminders, b.reminders, cutoff)).sort(byAt),
    routines: sortId(mergeById(a.routines, b.routines, cutoff)),
    lessons: sortId(mergeById(a.lessons, b.lessons, cutoff)),
    settings: newer(a.settings, b.settings),
  };
}

// ---------------------------------------------------------------------------
// Conversions

/** What the assistant sees: no tombstones, no stamps. `connected` is filled in by the caller. */
export function toDevice(s: UserState): DeviceContext {
  const memory: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.memory)) if (!v.deleted) memory[k] = v.value;
  const { updatedAt: _u, ...settings } = s.settings;
  void _u;
  return {
    memory,
    reminders: s.reminders.filter((r) => !r.deleted).map(plainReminder),
    routines: s.routines.filter((r) => !r.deleted).map(({ id, trigger, steps }) => ({ id, trigger, steps })),
    lessons: s.lessons.filter((l) => !l.deleted).map(({ id, topic, level, step, score }) => ({ id, topic, level, step, score })),
    settings,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffById<T extends { id: string }>(prev: (T & Stamp)[], next: T[], when: string, plain: (x: T) => T): (T & Stamp)[] {
  const nextById = new Map(next.map((x) => [x.id, plain(x)]));
  const out: (T & Stamp)[] = [];
  for (const old of prev) {
    const now = nextById.get(old.id);
    if (!now) out.push(old.deleted ? old : { ...old, deleted: true, updatedAt: when });
    else if (old.deleted || !same(plain(old), now)) out.push({ ...now, updatedAt: when });
    else out.push(old);
    nextById.delete(old.id);
  }
  for (const x of nextById.values()) out.push({ ...x, updatedAt: when });
  return out;
}

/**
 * Stamp a plain DeviceContext edit (what existing UI code produces) onto the previous state:
 * changed or new items get `now`, removed ones become tombstones. Unchanged input returns `prev`.
 */
export function fromDevice(prev: UserState, d: DeviceContext, now: Date): UserState {
  const when = now.toISOString();
  let changed = false;
  const memory: Record<string, MemoryItem> = {};
  for (const [k, old] of Object.entries(prev.memory)) {
    if (k in d.memory) {
      if (old.deleted || old.value !== d.memory[k]) {
        memory[k] = { value: d.memory[k], updatedAt: when };
        changed = true;
      } else memory[k] = old;
    } else if (!old.deleted) {
      memory[k] = { ...old, deleted: true, updatedAt: when };
      changed = true;
    } else memory[k] = old;
  }
  for (const [k, v] of Object.entries(d.memory)) {
    if (!(k in prev.memory)) {
      memory[k] = { value: v, updatedAt: when };
      changed = true;
    }
  }
  const reminders = diffById(prev.reminders, d.reminders, when, plainReminder).sort(byAt);
  // A context without routines/lessons (older callers) leaves them untouched instead of deleting them.
  const routines =
    d.routines === undefined ? prev.routines : diffById(prev.routines, d.routines, when, ({ id, trigger, steps }: Routine) => ({ id, trigger, steps }));
  const lessons =
    d.lessons === undefined
      ? prev.lessons
      : diffById(prev.lessons, d.lessons, when, ({ id, topic, level, step, score }: Lesson) => ({ id, topic, level, step, score }));
  const { updatedAt: _u, ...oldSettings } = prev.settings;
  void _u;
  const settingsChanged = !same(oldSettings, d.settings ?? {});
  const settings = settingsChanged ? { ...(d.settings ?? {}), updatedAt: when } : prev.settings;
  changed =
    changed ||
    settingsChanged ||
    !same(reminders, prev.reminders) ||
    !same(routines, prev.routines) ||
    !same(lessons, prev.lessons);
  if (!changed) return prev;
  return { memory, reminders, routines, lessons, settings };
}

/** The copy that may leave the device: no Gmail refresh token, no webhook URLs. */
export function stripLocalOnly(s: UserState): UserState {
  const settings = { ...s.settings };
  for (const k of LOCAL_ONLY_SETTINGS) delete settings[k];
  return { ...s, settings };
}

/** Put the device-only settings of `local` back onto a merged state. */
export function keepLocalOnly(merged: UserState, local: UserState): UserState {
  const settings = { ...merged.settings };
  for (const k of LOCAL_ONLY_SETTINGS) {
    if (local.settings[k] !== undefined) (settings as Record<string, unknown>)[k] = local.settings[k];
    else delete settings[k];
  }
  return same(settings, merged.settings) ? merged : { ...merged, settings };
}

// ---------------------------------------------------------------------------
// Parsing untrusted input (PUT /api/sync bodies, localStorage, database rows)

const LIMITS = { memory: 200, reminders: 100, routines: 50, lessons: 50 };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isTime = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const clampInt = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;

function stamp(raw: Record<string, unknown>): Stamp | null {
  if (!isTime(raw.updatedAt)) return null;
  return raw.deleted === true ? { updatedAt: raw.updatedAt, deleted: true } : { updatedAt: raw.updatedAt };
}

function parseSettings(raw: unknown): StampedSettings {
  if (!isObj(raw) || !isTime(raw.updatedAt)) return { updatedAt: EPOCH };
  const s: StampedSettings = { updatedAt: raw.updatedAt };
  if (raw.voice === "jarvis" || raw.voice === "friday") s.voice = raw.voice;
  if (raw.title === "mr" || raw.title === "mrs" || raw.title === "") s.title = raw.title;
  if (typeof raw.gmailRefreshToken === "string") s.gmailRefreshToken = raw.gmailRefreshToken.slice(0, 2000);
  if (typeof raw.gmailConnected === "boolean") s.gmailConnected = raw.gmailConnected;
  if (typeof raw.lastBriefingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastBriefingDate)) s.lastBriefingDate = raw.lastBriefingDate;
  if (isObj(raw.webhooks)) {
    const w: { discord?: string; slack?: string } = {};
    if (typeof raw.webhooks.discord === "string") w.discord = raw.webhooks.discord.slice(0, 500);
    if (typeof raw.webhooks.slack === "string") w.slack = raw.webhooks.slack.slice(0, 500);
    s.webhooks = w;
  }
  return s;
}

function parseList<T>(raw: unknown, max: number, item: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const x of raw) {
    if (out.length >= max) break;
    const v = isObj(x) ? item(x) : null;
    if (v) out.push(v);
  }
  return out;
}

/** A clean UserState from untrusted JSON, or null when it is not one at all. */
export function parseState(raw: unknown): UserState | null {
  if (!isObj(raw) || !isObj(raw.memory) || !Array.isArray(raw.reminders)) return null;
  const memory: Record<string, MemoryItem> = {};
  for (const [k, v] of Object.entries(raw.memory)) {
    if (Object.keys(memory).length >= LIMITS.memory) break;
    if (!isObj(v) || typeof v.value !== "string") continue;
    const st = stamp(v);
    if (st) memory[k.slice(0, 60)] = { value: v.value.slice(0, 500), ...st };
  }
  const reminders = parseList(raw.reminders, LIMITS.reminders, (r) => {
    const st = stamp(r);
    const id = text(r.id, 40);
    const t = text(r.text, 300);
    if (!st || !id || t === null || !isTime(r.at)) return null;
    return { id, text: t, at: new Date(r.at).toISOString(), repeatDaily: r.repeatDaily === true, ...st };
  }).sort(byAt);
  const routines = parseList(raw.routines, LIMITS.routines, (r) => {
    const st = stamp(r);
    const id = text(r.id, 40);
    const trigger = text(r.trigger, 60);
    const steps = text(r.steps, 500);
    if (!st || !id || trigger === null || steps === null) return null;
    return { id, trigger, steps, ...st };
  });
  const lessons = parseList(raw.lessons, LIMITS.lessons, (l) => {
    const st = stamp(l);
    const id = text(l.id, 40);
    const topic = text(l.topic, 120);
    if (!st || !id || topic === null) return null;
    const level = (LESSON_LEVELS as readonly unknown[]).includes(l.level) ? (l.level as string) : "beginner";
    return { id, topic, level, step: clampInt(l.step, 1, 1000), score: clampInt(l.score, 0, 100), ...st };
  });
  return { memory, reminders, routines, lessons, settings: parseSettings(raw.settings) };
}
