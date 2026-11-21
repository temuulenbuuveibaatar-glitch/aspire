import { describe, expect, it } from "vitest";
import { applyListActions, cleanListItems, isPrivateList, keepPrivate, type ListAction, type ListItem, MAX_ITEMS, MAX_LISTS, toMinor, withoutPrivate } from "@/lib/lists";
import { listTool } from "@/lib/tools/lists";
import type { ToolContext } from "@/lib/tools/types";

const NOW = new Date("2026-11-20T20:00:00+08:00");
const ctx = (lists: unknown[] = [], extra: Partial<ToolContext> = {}): ToolContext => ({
  now: NOW,
  timeZone: "Asia/Ulaanbaatar",
  device: { memory: {}, reminders: [], lists } as ToolContext["device"],
  actions: [],
  source: "web",
  ...extra,
});
const item = (list: string, text: string, i: number, amount?: number): ListItem => ({
  id: `l${i}`,
  list,
  text,
  ...(amount !== undefined ? { amount } : {}),
  at: new Date(NOW.getTime() - (100 - i) * 60_000).toISOString(),
});
type Out = Record<string, unknown> & { error?: string };
const run = async (input: Record<string, unknown>, c = ctx()) => ({ out: (await listTool.run({ text: "", amount: 0, list_name: "", ...input }, c)) as Out, c });

describe("list tool", () => {
  it("add puts one item on the device, with the amount in exact minor units", async () => {
    const { out, c } = await run({ action: "add", list_name: "Spending", text: "bus card top-up", amount: 0.1 });
    expect(out).toMatchObject({ ok: true, list: "spending", added: "bus card top-up", count: 1 });
    const [a] = c.actions as unknown as ListAction[];
    expect(a).toMatchObject({ type: "list_add", item: { list: "spending", text: "bus card top-up", amount: 10, at: NOW.toISOString() } });
  });

  it("read: newest first and an exact integer total", async () => {
    const lists = [item("spending", "bread", 1, 10), item("spending", "milk", 2, 20), item("spending", "soap", 3, 70), item("shopping", "eggs", 4)];
    const { out } = await run({ action: "read", list_name: "spending" }, ctx(lists));
    expect((out.items as { text: string }[]).map((x) => x.text)).toEqual(["soap", "milk", "bread"]);
    expect(out.totalMinor).toBe(100); // 0.1 + 0.2 + 0.7 would not be exact in floats
    expect(out.total).toBe(1);
    const all = await run({ action: "read", list_name: "" }, ctx(lists));
    expect(all.out.lists).toEqual([
      { list: "spending", count: 3 },
      { list: "shopping", count: 1 },
    ]);
  });

  it("remove by text (newest match) or id; clear tombstones a whole list", async () => {
    const lists = [item("shopping", "Milk", 1), item("shopping", "milk", 2), item("shopping", "eggs", 3)];
    const r = await run({ action: "remove", list_name: "shopping", text: "MILK" }, ctx(lists));
    expect(r.c.actions).toEqual([{ type: "list_remove", id: "l2" }]);
    expect((await run({ action: "remove", list_name: "shopping", text: "l3" }, ctx(lists))).c.actions).toEqual([{ type: "list_remove", id: "l3" }]);
    expect((await run({ action: "remove", list_name: "shopping", text: "bread" }, ctx(lists))).out.error).toMatch(/No such item/);
    const cl = await run({ action: "clear", list_name: "shopping" }, ctx(lists));
    expect(cl.out).toMatchObject({ ok: true, removed: 3 });

    const stamped = applyListActions(lists.map((x) => ({ ...x, updatedAt: "2026-01-01T00:00:00.000Z" })), cl.c.actions, NOW);
    expect(stamped.every((x) => x.deleted && x.updatedAt === NOW.toISOString())).toBe(true);
  });

  it("caps: 20 lists and 200 items per list", async () => {
    const many = Array.from({ length: MAX_LISTS }, (_, i) => item(`list ${i}`, "x", i));
    expect((await run({ action: "add", list_name: "one more", text: "x" }, ctx(many))).out.error).toMatch(/At most 20 lists/);
    expect((await run({ action: "add", list_name: "list 3", text: "y" }, ctx(many))).out.ok).toBe(true);
    const full = Array.from({ length: MAX_ITEMS }, (_, i) => item("shopping", `x${i}`, i));
    expect((await run({ action: "add", list_name: "shopping", text: "z" }, ctx(full))).out.error).toMatch(/full/);
  });

  it("medicine and dose lists: phone only, no total, never from a bot", async () => {
    const add = await run({ action: "add", list_name: "Fever log", text: "paracetamol 5 ml", amount: 5 });
    expect(add.out).toMatchObject({ ok: true, phoneOnly: true });
    expect((add.c.actions[0] as unknown as { item: ListItem }).item).not.toHaveProperty("amount");
    const dose = [item("fever log", "paracetamol 5 ml", 1), item("fever log", "ibuprofen 5 ml", 2)];
    const read = await run({ action: "read", list_name: "fever log" }, ctx(dose));
    expect(read.out).toMatchObject({ phoneOnly: true });
    expect(read.out).not.toHaveProperty("total");
    expect((await run({ action: "read", list_name: "fever log" }, ctx(dose, { source: "bot" }))).out.error).toMatch(/phone only/);
    for (const name of ["Medicine", "эм", "эмийн жагсаалт", "лекарства", "Fieber", "退烧药", "тун"]) expect(isPrivateList(name)).toBe(true);
    for (const name of ["shopping", "эмээгийн дэлгүүр", "hemp", "todo"]) expect(isPrivateList(name)).toBe(false);
  });

  it("pen test: bad input is refused or cleaned", async () => {
    expect((await run({ action: "drop table" })).out.error).toMatch(/action must be/);
    expect((await run({ action: "add", list_name: "", text: "x" })).out.error).toMatch(/list_name/);
    expect((await run({ action: "add", list_name: "notes", text: "card 4111 1111 1111 1111" })).out.error).toMatch(/Refused/);
    const xss = await run({ action: "add", list_name: "<b>x</b>", text: "<img src=x onerror=alert(1)>\u0000milk" });
    const added = (xss.c.actions[0] as unknown as { item: ListItem }).item;
    expect(added.list).not.toMatch(/[<>]/);
    expect(added.text).not.toMatch(/[<>\u0000]/);
    expect((await run({ action: "add", list_name: "a".repeat(500), text: "b".repeat(5000) })).c.actions[0]).toMatchObject({
      item: { list: "a".repeat(40), text: "b".repeat(200) },
    });
    for (const v of [NaN, Infinity, 1e10, "1e400", "12,5", 0, null, {}]) expect(toMinor(v)).toBeNull();
    expect(toMinor("12.5")).toBe(1250);
    // forged device lists from the request body are dropped
    expect(cleanListItems([{ id: "a b", list: "x", text: "y", at: NOW.toISOString() }, { id: "ok", list: "x", text: "y", at: "never" }, "x", null, { id: "ok", list: "x", text: "y", at: NOW.toISOString(), amount: 1.5 }])).toEqual([
      { id: "ok", list: "x", text: "y", at: NOW.toISOString() },
    ]);
    expect(cleanListItems({ length: 5 })).toEqual([]);
  });

  it("cloud copy never carries private lists, and a merge keeps the phone's", () => {
    const local = [item("shopping", "eggs", 1), item("medicine", "insulin 8u", 2)];
    expect(withoutPrivate(local).map((x) => x.list)).toEqual(["shopping"]);
    expect(keepPrivate([item("shopping", "eggs", 1), item("medicine", "forged", 9)], local).map((x) => x.text)).toEqual(["eggs", "insulin 8u"]);
  });
});
