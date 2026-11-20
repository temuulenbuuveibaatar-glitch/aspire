"use client";
// The person's memory and reminders live only on their device (localStorage).
import { useCallback, useEffect, useState } from "react";
import type { ClientAction, DeviceContext, Reminder } from "@/lib/tools/types";

const KEY = "emee-device-v1";
const EMPTY: DeviceContext = { memory: {}, reminders: [] };

function load(): DeviceContext {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as DeviceContext | null;
    if (raw && typeof raw.memory === "object" && Array.isArray(raw.reminders)) return raw;
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  return EMPTY;
}

function save(d: DeviceContext) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: keep in memory for this visit */
  }
}

export function applyActions(d: DeviceContext, actions: ClientAction[]): DeviceContext {
  let memory = { ...d.memory };
  let reminders = [...d.reminders];
  for (const a of actions) {
    if (a.type === "remember") memory[a.key] = a.value;
    if (a.type === "forget") {
      const { [a.key]: _gone, ...rest } = memory;
      void _gone;
      memory = rest;
    }
    if (a.type === "reminder") reminders = [...reminders.filter((r) => r.id !== a.id), { id: a.id, text: a.text, at: a.at, repeatDaily: a.repeatDaily }];
    if (a.type === "cancel_reminder") reminders = reminders.filter((r) => r.id !== a.id);
  }
  reminders.sort((a, b) => a.at.localeCompare(b.at));
  return { ...d, memory, reminders };
}

/** Reminders that are due now, and the list with them rescheduled (daily) or removed. */
export function takeDue(d: DeviceContext, now: Date): { due: Reminder[]; next: DeviceContext } {
  const due = d.reminders.filter((r) => new Date(r.at).getTime() <= now.getTime());
  if (!due.length) return { due, next: d };
  const reminders = d.reminders
    .flatMap((r) => {
      if (!due.includes(r)) return [r];
      if (!r.repeatDaily) return [];
      let t = new Date(r.at).getTime();
      while (t <= now.getTime()) t += 86_400_000;
      return [{ ...r, at: new Date(t).toISOString() }];
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  return { due, next: { ...d, reminders } };
}

export function useDevice() {
  const [device, setDevice] = useState<DeviceContext>(EMPTY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage is read after mount
    setDevice(load());
  }, []);
  const update = useCallback((fn: (d: DeviceContext) => DeviceContext) => {
    setDevice((d) => {
      const next = fn(d);
      save(next);
      return next;
    });
  }, []);
  return { device, update };
}
