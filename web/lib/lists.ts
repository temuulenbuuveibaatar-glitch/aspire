// Lists on the device: shopping and to-do lists, a spending log, a medicine or fever-dose log.
// One shape for all: each item is its own stamped record (merged by id like reminders, removals
// are tombstones). Amounts are integer minor units (12.50 -> 1250) so sums are exact.
// Medicine and dose items never leave the phone, even when a bot is linked: flagged `private` when
// added (the tool's `medical`), or caught by a medicine word in the list name or item text.
// Pure functions, safe on server and client.

export interface ListItem {
  id: string;
  /** List name, lowercase, e.g. "shopping". */
  list: string;
  text: string;
  /** Integer minor units (cents, mongo); missing = no amount. */
  amount?: number;
  /** ISO instant the item was added. */
  at: string;
  /** Medical: kept on this phone only. */
  private?: true;
}
type Stamped = ListItem & { updatedAt: string; deleted?: boolean };

/** What the list tool asks the device to do (joins ClientAction when wired). */
export type ListAction = { type: "list_add"; item: ListItem } | { type: "list_remove"; id: string } | { type: "list_clear"; list: string };

export const MAX_LISTS = 20;
export const MAX_ITEMS = 200;
/** Items in all lists together (tombstones included): the largest state still fits /api/sync's 1 MB body. */
export const MAX_TOTAL = 800;
export const MAX_NAME = 40;
export const MAX_TEXT = 200;
/** Largest amount in major units (one billion): keeps every sum an exact integer. */
export const MAX_AMOUNT = 1e9;

const MEDICAL =
  /medi[czk]|(?<!\p{L})meds?(?!\p{L})|dose|dosage|pill|fever|tablet|drug|syrup|insulin|инсулин|temperat|antibiot|антибиот|ibupro|paracet|парацет|nurofen|glucose|глюкоз|blood ?sugar|sugar (?:log|level)|blutzucker|血糖|blood ?pressure|blutdruck|давлени|血压|(?<!\p{L})bp(?!\p{L})|inhal|ингалят|лекарств|таблет|доз|температур|жаропониж|arznei|dosis|fieber|药|剂|发烧|退烧|体温|(?<!\p{L})эм(?:ийн|үүд|$|[^\p{L}])|(?<!\p{L})тун(?!\p{L})|халуун/iu;

/** A list name about medicine or doses: such lists stay on this phone only. */
export const isPrivateList = (name: string): boolean => MEDICAL.test(name);

/** Phone-only item: flagged medical when added, or a medicine word in its list name or text. */
export const isPrivateItem = (x: ListItem): boolean => x.private === true || MEDICAL.test(x.list) || MEDICAL.test(x.text);

/** Untrusted text -> one line without control characters, markup, or invisible and direction-changing characters. */
export const cleanText = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/[​-‏‪-‮⁠-⁩﻿]/g, "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

export const cleanName = (v: unknown): string => cleanText(v, MAX_NAME).toLowerCase();

/** A number of major units -> integer minor units, or null when it is not a usable amount. */
export function toMinor(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > MAX_AMOUNT) return null;
  return Math.round(n * 100);
}

const isTime = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** One item from untrusted JSON (request body, localStorage, database row), or null. */
export function parseListItem(x: unknown): ListItem | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : "";
  const list = cleanName(r.list);
  const text = cleanText(r.text, MAX_TEXT);
  if (!id || !list || !text || !isTime(r.at)) return null;
  const amount = Number.isSafeInteger(r.amount) && Math.abs(r.amount as number) <= MAX_AMOUNT * 100 ? (r.amount as number) : undefined;
  return { id, list, text, ...(amount ? { amount } : {}), at: new Date(r.at).toISOString(), ...(r.private === true ? { private: true as const } : {}) };
}

/**
 * At most MAX_TOTAL items in at most MAX_LISTS lists, in their original order. When over, live
 * items win over tombstones and newer over older.
 */
export function capItems<T extends ListItem & { updatedAt?: string; deleted?: boolean }>(items: T[]): T[] {
  const names = new Set<string>();
  const keep = new Set<T>();
  const ranked = [...items].sort((a, b) => Number(!!a.deleted) - Number(!!b.deleted) || (b.updatedAt ?? b.at).localeCompare(a.updatedAt ?? a.at));
  for (const x of ranked) {
    if (keep.size >= MAX_TOTAL) break;
    if (!x.deleted && !names.has(x.list)) {
      if (names.size >= MAX_LISTS) continue;
      names.add(x.list);
    }
    keep.add(x);
  }
  return keep.size === items.length ? items : items.filter((x) => keep.has(x));
}

/** The device's lists from untrusted JSON, capped (capItems). */
export function cleanListItems(raw: unknown): ListItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ListItem[] = [];
  for (const x of raw) {
    if (out.length >= MAX_LISTS * MAX_ITEMS) break;
    const item = parseListItem(x);
    if (item) out.push(item);
  }
  return capItems(out);
}

/** Apply list actions to the stamped items: adds are new records, remove/clear leave tombstones. */
export function applyListActions(items: Stamped[], actions: readonly { type: string }[], now: Date): Stamped[] {
  const when = now.toISOString();
  let out = items;
  for (const a of actions as ListAction[]) {
    if (a.type === "list_add") out = [...out.filter((x) => x.id !== a.item.id), { ...a.item, updatedAt: when }];
    const gone = a.type === "list_remove" ? (x: Stamped) => x.id === a.id : a.type === "list_clear" ? (x: Stamped) => x.list === a.list : null;
    if (gone) out = out.map((x) => (!x.deleted && gone(x) ? { ...x, deleted: true, updatedAt: when } : x));
  }
  return out;
}

/** The copy that may leave the device: no medicine or dose items. */
export const withoutPrivate = <T extends ListItem>(items: T[]): T[] => items.filter((x) => !isPrivateItem(x));

/** After a merge with the cloud copy: put this device's private items back. */
export const keepPrivate = <T extends ListItem>(merged: T[], local: T[]): T[] => [...withoutPrivate(merged), ...local.filter(isPrivateItem)];

/** One list, newest first, with the exact sum when any item has an amount. */
export function readList(items: ListItem[], list: string) {
  const mine = items.filter((x) => x.list === list).sort((a, b) => b.at.localeCompare(a.at));
  const amounts = mine.filter((x) => x.amount !== undefined);
  const total = amounts.reduce((s, x) => s + (x.amount ?? 0), 0);
  return { items: mine, ...(amounts.length ? { totalMinor: total, total: total / 100 } : {}) };
}

/** Every list name with its item count. */
export function listNames(items: ListItem[]): { list: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const x of items) counts.set(x.list, (counts.get(x.list) ?? 0) + 1);
  return [...counts].map(([list, count]) => ({ list, count }));
}
