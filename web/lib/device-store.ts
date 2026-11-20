"use client";
// The person's memory, reminders, routines, lessons and settings. They live on the device
// (localStorage, one key per signed-in user: `aspire:<userId>:v2`) as a stamped UserState
// (lib/state.ts). When the person linked a bot (cloud sync on), the device pulls the cloud copy
// on open and pushes after changes; both sides merge item by item, so nothing is overwritten.
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyState,
  fromDevice,
  keepLocalOnly,
  mergeState,
  nextDaily,
  parseState,
  stripLocalOnly,
  toDevice,
  type UserState,
} from "@/lib/state";
import type { ClientAction, DeviceContext, Reminder } from "@/lib/tools/types";

export const LEGACY_KEYS = ["aspire-device-v1", "emee-device-v1"] as const; // emee = before the rename
export const stateKey = (userId: string) => `aspire:${userId}:v2`;
/** Window event that asks every useUserState to pull/push now (e.g. right after linking a bot). */
export const SYNC_EVENT = "aspire:sync";

const PUSH_DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// DeviceContext helpers (kept for existing callers; the stamping happens in useDevice's update).

export function applyActions(d: DeviceContext, actions: ClientAction[]): DeviceContext {
  let memory = { ...d.memory };
  let reminders = [...d.reminders];
  let routines = [...(d.routines ?? [])];
  let lessons = [...(d.lessons ?? [])];
  for (const a of actions) {
    if (a.type === "remember") memory[a.key] = a.value;
    if (a.type === "forget") {
      const { [a.key]: _gone, ...rest } = memory;
      void _gone;
      memory = rest;
    }
    if (a.type === "reminder") reminders = [...reminders.filter((r) => r.id !== a.id), { id: a.id, text: a.text, at: a.at, repeatDaily: a.repeatDaily }];
    if (a.type === "cancel_reminder") reminders = reminders.filter((r) => r.id !== a.id);
    if (a.type === "routine") routines = [...routines.filter((r) => r.id !== a.id), { id: a.id, trigger: a.trigger, steps: a.steps }];
    if (a.type === "delete_routine") routines = routines.filter((r) => r.id !== a.id);
    if (a.type === "lesson")
      lessons = [...lessons.filter((l) => l.id !== a.id), { id: a.id, topic: a.topic, level: a.level, step: a.step, score: a.score }];
  }
  reminders.sort((a, b) => a.at.localeCompare(b.at));
  return { ...d, memory, reminders, routines, lessons };
}

/** Reminders that are due now, and the list with them rescheduled (daily) or removed. */
export function takeDue(d: DeviceContext, now: Date): { due: Reminder[]; next: DeviceContext } {
  const due = d.reminders.filter((r) => new Date(r.at).getTime() <= now.getTime());
  if (!due.length) return { due, next: d };
  const reminders = d.reminders
    .flatMap((r) => {
      if (!due.includes(r)) return [r];
      if (!r.repeatDaily) return [];
      return [{ ...r, at: nextDaily(r.at, now) }];
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  return { due, next: { ...d, reminders } };
}

// ---------------------------------------------------------------------------
// Storage

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** v1 storage (a plain DeviceContext) -> stamped state, every item stamped `now`. */
export function migrateLegacy(raw: unknown, now: Date): UserState {
  if (!isObj(raw) || !isObj(raw.memory) || !Array.isArray(raw.reminders)) return emptyState();
  const when = now.toISOString();
  // Stamp everything, then let parseState drop anything malformed.
  const stampAll = (l: unknown) => (Array.isArray(l) ? l.filter(isObj).map((x) => ({ ...x, updatedAt: when })) : []);
  const memory: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.memory)) if (typeof v === "string") memory[k] = { value: v, updatedAt: when };
  const settings = isObj(raw.settings) && Object.keys(raw.settings).length ? { ...raw.settings, updatedAt: when } : undefined;
  return (
    parseState({
      memory,
      reminders: stampAll(raw.reminders),
      routines: stampAll(raw.routines),
      lessons: stampAll(raw.lessons),
      settings,
    }) ?? emptyState()
  );
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null; // storage blocked or corrupt
  }
}

/** This user's saved state; on first load the old single-user storage is moved in (once). */
export function loadState(userId: string, now = new Date()): UserState {
  const saved = parseState(readJson(stateKey(userId)));
  if (saved) return saved;
  for (const key of LEGACY_KEYS) {
    const legacy = readJson(key);
    if (!legacy) continue;
    const migrated = migrateLegacy(legacy, now);
    saveState(userId, migrated);
    try {
      for (const k of LEGACY_KEYS) localStorage.removeItem(k); // so a second account on this device starts clean
    } catch {
      /* ignore */
    }
    return migrated;
  }
  return emptyState();
}

export function saveState(userId: string, s: UserState): void {
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(s));
  } catch {
    /* storage unavailable: keep in memory for this visit */
  }
}

// ---------------------------------------------------------------------------
// Hooks

type SyncMode = "unknown" | "linked" | "off";

/**
 * The signed-in person's stamped state. `userId` null = not known yet (state stays empty and
 * nothing is stored). When a bot is linked, changes are pushed to /api/sync and the cloud copy
 * is pulled on open, on SYNC_EVENT and when the tab becomes visible again.
 */
export function useUserState(userId: string | null | undefined) {
  const [state, setState] = useState<UserState>(emptyState);
  const ref = useRef(state);
  const sync = useRef<SyncMode>("unknown");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linked, setLinked] = useState(false);

  const commit = useCallback(
    (next: UserState) => {
      if (next === ref.current) return;
      ref.current = next;
      setState(next);
      if (userId) saveState(userId, next);
    },
    [userId],
  );

  /** Merge a cloud copy into the device copy (device-only settings stay as they are). */
  const absorb = useCallback(
    (remote: UserState | null) => {
      if (!remote) return;
      const local = ref.current;
      const merged = keepLocalOnly(mergeState(local, remote, new Date()), local);
      if (JSON.stringify(merged) !== JSON.stringify(local)) commit(merged);
    },
    [commit],
  );

  const setMode = useCallback((mode: SyncMode) => {
    sync.current = mode;
    setLinked(mode === "linked");
  }, []);

  const push = useCallback(async () => {
    if (!userId || sync.current !== "linked") return;
    try {
      const res = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stripLocalOnly(ref.current) }),
      });
      if (res.status === 409) return setMode("off");
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
      absorb(parseState(body?.state));
    } catch {
      /* offline: the next change or pull tries again */
    }
  }, [userId, absorb, setMode]);

  const pull = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (res.status === 409 || res.status === 401 || res.status === 503) return setMode("off");
      if (!res.ok) return;
      setMode("linked");
      const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
      const remote = parseState(body?.state);
      absorb(remote);
      // Send what only this device has (e.g. everything, right after linking).
      if (!remote || JSON.stringify(stripLocalOnly(ref.current)) !== JSON.stringify(remote)) await push();
    } catch {
      /* offline */
    }
  }, [userId, absorb, push, setMode]);

  // Load this user's copy when the id becomes known, then pull the cloud copy.
  useEffect(() => {
    const loaded = userId ? loadState(userId) : emptyState();
    ref.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage is read after mount
    setState(loaded);
    setMode("unknown");
    if (userId) void pull();
  }, [userId, pull, setMode]);

  useEffect(() => {
    if (!userId) return;
    const onSync = () => void pull();
    // Back to the tab: pick up what the bots changed (only when sync is on; linking fires SYNC_EVENT).
    const onVisible = () => document.visibilityState === "visible" && sync.current === "linked" && void pull();
    window.addEventListener(SYNC_EVENT, onSync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      document.removeEventListener("visibilitychange", onVisible);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [userId, pull]);

  const update = useCallback(
    (fn: (s: UserState) => UserState) => {
      const before = ref.current;
      commit(fn(before));
      if (ref.current === before || sync.current !== "linked") return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void push(), PUSH_DELAY_MS);
    },
    [commit, push],
  );

  return { state, update, linked };
}

/** The signed-in person's device context (plain, unstamped) for the assistant UI. */
export function useDevice() {
  const { userId } = useAuth();
  const { state, update } = useUserState(userId);
  const device = useMemo(() => toDevice(state), [state]);
  const updateDevice = useCallback(
    (fn: (d: DeviceContext) => DeviceContext) => update((s) => fromDevice(s, fn(toDevice(s)), new Date())),
    [update],
  );
  return { device, update: updateDevice };
}
