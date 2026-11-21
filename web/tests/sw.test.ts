// public/sw.js run against a fake worker scope: only hashed build files and the offline page are
// ever cached (nothing personal survives signing out), and a push shows only the message's text.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://aspire-mn.vercel.app";

function boot(online = true) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const m = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, m);
    const key = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
    return {
      match: async (r: Request | string) => m.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(key(r), res),
      add: async (r: Request | string) => void m.set(key(r), new Response("offline page")),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      delete: async (r: Request) => m.delete(r.url),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: string, o: { cacheName: string }) => (await open(o.cacheName)).match(r),
  };
  const shown: { title: string; opts: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async (u: string) => void opened.push(u) },
    registration: { showNotification: async (title: string, opts: Record<string, unknown>) => void shown.push({ title, opts }) },
  };
  const fetch = vi.fn(async () => (online ? new Response("net", { status: 200 }) : Promise.reject(new TypeError("offline"))));
  // Responses built here have type "default"; the worker caches only same-origin "basic" ones.
  const basic = async (...a: unknown[]) => Object.defineProperty(await (fetch as unknown as (...x: unknown[]) => Promise<Response>)(...a), "type", { value: "basic" });
  // In a worker, new Request("/offline.html") resolves against the origin; Node needs it spelled out.
  const WorkerRequest = class extends Request {
    constructor(u: RequestInfo | URL, init?: RequestInit) {
      super(typeof u === "string" ? new URL(u, ORIGIN) : u, init);
    }
  };
  new Function("self", "caches", "fetch", "Request", "Response", SRC)(self, caches, basic, WorkerRequest, Response);
  const fire = async (type: string, e: Record<string, unknown>) => {
    let p: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers[type]({ ...e, waitUntil: (x: Promise<unknown>) => (p = x), respondWith: (x: Promise<Response>) => (responded = x) });
    await p;
    return responded;
  };
  const get = (path: string, mode: RequestMode | "navigate" = "cors", method = "GET") => {
    const r = new Request(new URL(path, ORIGIN), { method });
    Object.defineProperty(r, "mode", { value: mode });
    return fire("fetch", { request: r });
  };
  return { fire, get, stores, shown, opened, fetch };
}

describe("service worker", () => {
  it("caches only hashed build files and the offline page; never pages, API or sign-in", async () => {
    const w = boot();
    await w.fire("install", {});
    expect(await (await w.get("/_next/static/chunks/a1b2.js"))!.text()).toBe("net");
    expect(await w.get("/api/ask")).toBeUndefined();
    expect(await w.get("/api/push", "cors", "POST")).toBeUndefined();
    expect(await w.get("https://clerk.aspire-mn.vercel.app/v1/client")).toBeUndefined();
    expect(await (await w.get("/", "navigate"))!.text()).toBe("net");
    expect(await (await w.get("/login", "navigate"))!.text()).toBe("net");
    const cached = [...w.stores.values()].flatMap((m) => [...m.keys()]);
    expect(cached.sort()).toEqual([`${ORIGIN}/_next/static/chunks/a1b2.js`, `${ORIGIN}/offline.html`]);
  });

  it("offline: a page load gets the static offline page", async () => {
    const w = boot(false);
    await w.fire("install", {});
    expect(await (await w.get("/", "navigate"))!.text()).toBe("offline page");
  });

  it("activate drops older Aspire caches", async () => {
    const w = boot();
    w.stores.set("aspire-static-v0", new Map());
    w.stores.set("other-app", new Map());
    await w.fire("activate", {});
    expect([...w.stores.keys()]).toEqual(["other-app"]);
  });

  it("push shows only the message's title, body and tag (clamped); a click opens the app root", async () => {
    const w = boot();
    await w.fire("push", { data: { json: () => ({ title: "Aspire", body: "Reminder: pills".padEnd(900, "."), tag: "r-1", url: "https://evil.example" }) } });
    expect(w.shown[0].title).toBe("Aspire");
    expect((w.shown[0].opts.body as string).length).toBe(500);
    expect(w.shown[0].opts).not.toHaveProperty("data");
    await w.fire("push", { data: { json: () => { throw new Error("bad"); } } });
    expect(w.shown[1]).toMatchObject({ title: "Aspire", opts: { body: "", tag: "aspire" } });
    await w.fire("notificationclick", { notification: { close: () => undefined } });
    expect(w.opened).toEqual(["/"]);
  });
});
