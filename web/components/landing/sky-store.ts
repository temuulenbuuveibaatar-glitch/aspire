// One optional override for the page's sky, shared by the two halves of the opening page: the
// scroll story sets it while its weather scene is on screen (to show what clear, rain and snow look
// like) and clears it on the way out, and SkyLayer draws it in place of the visitor's own sky.
// Nothing here is ever set on the server: the override only exists in the browser, after a scroll.
import { useSyncExternalStore } from "react";
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";

let current: SkyKind | null = null;
const listeners = new Set<() => void>();

/** Show this sky instead of the visitor's own; null goes back to the real one. Unknown kinds count as null. */
export function setSkyOverride(kind: SkyKind | null): void {
  const next = kind !== null && (SKY_KINDS as readonly unknown[]).includes(kind) ? kind : null;
  if (next === current) return;
  current = next;
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
const snapshot = () => current;
const serverSnapshot = () => null;

/** The sky a scene asked for, or null while the page shows the visitor's own. */
export function useSkyOverride(): SkyKind | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
