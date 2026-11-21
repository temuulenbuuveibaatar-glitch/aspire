// One "list" tool for shopping and to-do lists, a spending log and a medicine or fever-dose log.
// It only records what the person says; storage and caps are in lib/lists.ts.
import {
  cleanListItems,
  cleanName,
  cleanText,
  isPrivateItem,
  isPrivateList,
  type ListAction,
  type ListItem,
  listNames,
  MAX_ITEMS,
  MAX_LISTS,
  MAX_NAME,
  MAX_TEXT,
  MAX_TOTAL,
  readList,
  toMinor,
} from "@/lib/lists";
import { zoneOr } from "./time";
import { str, type Tool, type ToolContext } from "./types";

const ACTIONS = ["add", "read", "remove", "clear"] as const;
const CARD_OR_ID = /(?<!\d)\d{13,19}(?!\d)/;

// The lists are re-validated here, so a forged body is harmless.
const deviceLists = (ctx: ToolContext): ListItem[] => cleanListItems(ctx.device.lists);
const push = (ctx: ToolContext, a: ListAction) => ctx.actions.push(a);

export const listTool: Tool = {
  name: "list",
  label: { mn: "Жагсаалт", en: "List" },
  description:
    "Lists kept on the person's device: shopping or to-do list, a spending log (with amounts), a medicine or fever-dose log (what was given and when). action add/read/remove/clear. read gives items newest first with the time added, and the exact total of the amounts. Records only what the person says: never compute, check or suggest a dose or an interval between doses; for that they ask a doctor or pharmacist. Medicine, dose and health-reading lists are on this phone only (set medical true for them): say so. To share a list use send_message; for a next-dose alarm use set_reminder with the time the person says.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "What to do", enum: [...ACTIONS] },
      list_name: { type: "string", description: `List name in the person's language, e.g. 'shopping', 'spending', 'fever log' (up to ${MAX_NAME} characters). Empty string with read = all lists.` },
      text: { type: "string", description: "add: the item, e.g. 'milk 2 l' or 'paracetamol 5 ml'. remove: the item's id or exact text. Otherwise empty string." },
      amount: { type: "number", description: "add: money spent, e.g. 12.5 (only for spending); 0 = none" },
      medical: { type: "boolean", description: "true when the list is about medicine, doses, symptoms or health readings (blood sugar, blood pressure): kept on this phone only" },
    },
    required: ["action", "list_name", "text", "amount", "medical"],
  },
  async run(input, ctx) {
    const action = str(input.action, 10).toLowerCase();
    if (!(ACTIONS as readonly string[]).includes(action)) return { error: `action must be one of ${ACTIONS.join(", ")}` };
    const list = cleanName(input.list_name);
    const items = deviceLists(ctx);
    // Phone-only: the model says so, the name says so, or the list already holds a flagged item.
    const phoneOnly = input.medical === true || isPrivateList(list) || items.some((x) => x.list === list && x.private);
    if (phoneOnly && (ctx.source === "bot" || ctx.source === "cron")) return { error: "Medicine and dose lists are kept on the phone only: open the Aspire app to use them." };

    if (action === "read") {
      if (!list) return { lists: listNames(items) };
      const zone = zoneOr(ctx.timeZone);
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
      const { items: mine, ...sum } = readList(items, list);
      if (!mine.length) return { list, items: [], note: "This list is empty or does not exist", lists: listNames(items) };
      return {
        list,
        timezone: zone,
        items: mine.map((x) => ({ id: x.id, text: x.text, added: fmt.format(new Date(x.at)), ...(x.amount !== undefined ? { amount: x.amount / 100 } : {}) })),
        // A dose list gets no total: adding up doses is not this tool's job.
        ...(phoneOnly ? { phoneOnly } : sum),
      };
    }

    if (!list) return { error: "list_name is required" };
    const mine = items.filter((x) => x.list === list);

    if (action === "clear") {
      if (!mine.length) return { error: "That list is already empty", lists: listNames(items) };
      push(ctx, { type: "list_clear", list });
      return { ok: true, list, removed: mine.length };
    }

    const text = cleanText(input.text, MAX_TEXT);
    if (!text) return { error: "text is required" };

    if (action === "remove") {
      const want = text.toLowerCase();
      const hit = [...mine].sort((a, b) => b.at.localeCompare(a.at)).find((x) => x.id === text || x.text.toLowerCase() === want);
      if (!hit) return { error: "No such item; read the list for ids", items: mine.map((x) => ({ id: x.id, text: x.text })) };
      push(ctx, { type: "list_remove", id: hit.id });
      return { ok: true, list, removed: hit.text };
    }

    // add
    if (CARD_OR_ID.test(text.replace(/[^\d\p{L}]/gu, ""))) return { error: "Refused: never store card or ID numbers. Warn the person kindly." };
    if (!mine.length && listNames(items).length >= MAX_LISTS) return { error: `At most ${MAX_LISTS} lists; clear one first` };
    if (mine.length >= MAX_ITEMS) return { error: `This list is full (${MAX_ITEMS} items); clear or remove some first` };
    if (items.length >= MAX_TOTAL) return { error: `All lists together are full (${MAX_TOTAL} items); clear one first` };
    const amount = toMinor(input.amount);
    const item: ListItem = {
      id: `l${ctx.now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      list,
      text,
      ...(amount !== null && !phoneOnly ? { amount } : {}),
      at: ctx.now.toISOString(),
      ...(phoneOnly ? { private: true as const } : {}),
    };
    push(ctx, { type: "list_add", item });
    return { ok: true, list, added: text, count: mine.length + 1, ...(isPrivateItem(item) ? { phoneOnly: true } : {}) };
  },
};

export const listTools: Tool[] = [listTool];
