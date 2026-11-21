import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("brain chain (any AI)", () => {
  it("skips unconfigured providers and keeps BRAIN_ORDER", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubEnv("LOCAL_LLM_URL", "http://local.test/v1");
    vi.stubEnv("BRAIN_ORDER", "local,gemini,claude");
    const { activeBrains } = await import("@/lib/brain");
    expect(activeBrains().map((b) => b.name)).toEqual(["local", "gemini"]);
  });

  it("reports when no AI is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LOCAL_LLM_URL", "");
    const { ask, NoBrainConfigured } = await import("@/lib/brain");
    await expect(ask("hi", "en")).rejects.toBeInstanceOf(NoBrainConfigured);
  });

  it("falls back from a failing Gemini to a local Qwen that uses the bus tool", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubEnv("LOCAL_LLM_URL", "http://local.test/v1");
    vi.stubEnv("BRAIN_ORDER", "gemini,local");

    const localBodies: Array<{ messages: Array<{ role: string; content?: string }> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("generativelanguage")) return json({ error: { message: "overloaded" } }, 503);
      const body = JSON.parse(String(init?.body));
      localBodies.push(body);
      if (localBodies.length === 1) {
        return json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { id: "c1", type: "function", function: { name: "get_next_bus", arguments: '{"stop":"Төв талбай","route":""}' } },
                ],
              },
            },
          ],
        });
      }
      return json({ choices: [{ message: { content: "**12-р автобус** 5 минутын дараа ирнэ." } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ask } = await import("@/lib/brain");
    const out = await ask("Автобус хэзээ ирэх вэ?", "mn", [], undefined, undefined, { timeZone: "Asia/Ulaanbaatar" }); // a phone on Mongolian time

    expect(out.brain).toBe("local");
    expect(out.reply).toBe("12-р автобус 5 минутын дараа ирнэ."); // markdown removed for speech
    // the bus tool really ran and its result went back to the model
    const toolMsg = localBodies[1].messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain('"id":"center"');
    // the reply language was requested explicitly
    expect(localBodies[0].messages[0].content).toContain("Reply only in Mongolian");
  });
});

describe("Mr / Mrs address", () => {
  it("tells the AI which courtesy title to use, in the reply language", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const run = (title: "mr" | "mrs" | "") => ({
      ctx: { now: new Date(), device: { memory: {}, reminders: [], settings: { title } }, actions: [] },
      steps: [],
      sources: [],
    });
    expect(contextNote("mn", run("mr"))).toContain("Ноён");
    expect(contextNote("de", run("mrs"))).toContain("Frau");
    expect(contextNote("en", run(""))).toContain("polite form without a gendered title");
  });
});

describe("brain v2 context", () => {
  it("contextNote lists routines, lessons and connected channels", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const note = contextNote("en", {
      ctx: {
        now: new Date(),
        device: {
          memory: {},
          reminders: [],
          routines: [{ id: "rt1", trigger: "going home", steps: "next bus to Хороолол and the weather" }],
          lessons: [{ id: "l1", topic: "Aerodynamics", level: "beginner", step: 3, score: 80 }],
          connected: ["discord", "telegram"],
        },
        actions: [],
      },
      steps: [],
      sources: [],
    });
    expect(note).toContain('- "going home": next bus to Хороолол and the weather');
    expect(note).toContain("Aerodynamics");
    expect(note).toMatch(/Connected.*discord, telegram/);
  });

  it("contextNote says when nothing is connected", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const note = contextNote("en", { ctx: { now: new Date(), device: { memory: {}, reminders: [] }, actions: [] }, steps: [], sources: [] });
    expect(note).toMatch(/No messaging apps are connected/);
    expect(note).not.toMatch(/Routines/);
  });

  it("the system prompt covers research, teaching, routines and never claiming a send", async () => {
    const { SYSTEM } = await import("@/lib/brain/shared");
    expect(SYSTEM).toMatch(/web_search/);
    expect(SYSTEM).toMatch(/start_lesson/);
    expect(SYSTEM).toMatch(/routine/i);
    expect(SYSTEM).toMatch(/never say .*sent/i);
    expect(SYSTEM).toContain("Аспайр");
  });
});

describe("Claude research sources", () => {
  it("ask returns sources from web search blocks", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("BRAIN_ORDER", "claude");
    const requests: Array<{ tools: Array<{ name: string; max_uses?: number }> }> = [];
    const create = vi.fn(async (req: { tools: Array<{ name: string; max_uses?: number }> }) => {
      requests.push(req);
      return {
        stop_reason: "end_turn",
        content: [
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "jet engine thrust" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "s1",
            content: [
              { type: "web_search_result", title: "How jet engines work", url: "https://example.org/jet", encrypted_content: "x", page_age: null },
              { type: "web_search_result", title: "Thrust - NASA", url: "https://nasa.example/thrust", encrypted_content: "y", page_age: null },
            ],
          },
          {
            type: "text",
            text: "A jet engine pushes air backwards fast, so the plane moves forward.",
            citations: [
              { type: "web_search_result_location", url: "https://example.org/jet", title: "How jet engines work", cited_text: "...", encrypted_index: "z" },
            ],
          },
        ],
      };
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        beta = { messages: { create } };
      },
    }));

    const { ask } = await import("@/lib/brain");
    const out = await ask("Explain how a jet engine produces thrust", "en");
    expect(out.brain).toBe("claude");
    expect(out.sources).toEqual([
      { title: "How jet engines work", url: "https://example.org/jet" },
      { title: "Thrust - NASA", url: "https://nasa.example/thrust" },
    ]);
    const byName = Object.fromEntries(requests[0].tools.map((t) => [t.name, t]));
    expect(byName.web_search.max_uses).toBe(5);
    expect(byName.web_fetch.max_uses).toBe(3);
    expect(byName.start_lesson).toBeTruthy();
    expect(byName.send_message).toBeTruthy();
    vi.doUnmock("@anthropic-ai/sdk");
  });
});

describe("Jarvis tone and every city", () => {
  const runAt = (now: string, where: { timeZone?: string; city?: string; country?: string; approxLocation?: { lat: number; lng: number } } = {}, location?: { lat: number; lng: number }) => ({
    ctx: { now: new Date(now), device: { memory: {}, reminders: [], settings: { title: "mr" as const }, ...(location ? { location } : {}) }, actions: [], ...where },
    steps: [],
    sources: [],
  });

  it("the note gives the local time of day and city, from the person's time zone", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const note = contextNote("en", runAt("2026-11-20T19:30:00Z", { timeZone: "Europe/Berlin", city: "Berlin", country: "DE" }));
    expect(note).toContain("Friday 20:30, evening (time zone Europe/Berlin)");
    expect(note).toContain('"Good evening"');
    expect(note).toContain("They are in Berlin (DE), approximately, from their network");
    expect(note).toContain("sir / Mr.");
  });

  it("morning in Tokyo, afternoon in Lagos, and late night says Good evening (never Good night)", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    expect(contextNote("en", runAt("2026-11-20T23:30:00Z", { timeZone: "Asia/Tokyo" }))).toMatch(/08:30, morning.*"Good morning"/);
    expect(contextNote("en", runAt("2026-11-20T13:00:00Z", { timeZone: "Africa/Lagos" }))).toMatch(/14:00, afternoon.*"Good afternoon"/);
    const late = contextNote("en", runAt("2026-11-20T01:15:00Z", { timeZone: "Europe/London" }));
    expect(late).toMatch(/01:15, night.*"Good evening"/);
    expect(late).not.toContain("Good night");
  });

  it("an unknown place and time zone is said plainly (no Erdenet default)", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const note = contextNote("en", runAt("2026-11-20T12:00:00Z"));
    expect(note).toMatch(/time zone is unknown/);
    expect(note).toMatch(/neutral greeting/);
    expect(note).toMatch(/city is unknown/);
    expect(note).not.toMatch(/Erdenet|Mongolia/);
  });

  it("a network position without a city name is still used for weather", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    const note = contextNote("en", runAt("2026-11-20T12:00:00Z", { timeZone: "Europe/Paris", country: "FR", approxLocation: { lat: 48.86, lng: 2.35 } }));
    expect(note).toMatch(/approximate position is known from the network \(country FR\)/);
    expect(note).not.toMatch(/ask which city/);
  });

  it("a shared device location is named as such", async () => {
    const { contextNote } = await import("@/lib/brain/shared");
    expect(contextNote("de", runAt("2026-11-20T12:00:00Z", { timeZone: "Europe/Vienna", city: "Wien" }, { lat: 48.2, lng: 16.37 }))).toContain("Wien, from their device location");
    expect(contextNote("de", runAt("2026-11-20T12:00:00Z", { timeZone: "Europe/Vienna" }, { lat: 48.2, lng: 16.37 }))).toContain("shared their device location");
  });

  it("the system prompt keeps greetings short, never lists capabilities and bans emojis", async () => {
    const { SYSTEM } = await import("@/lib/brain/shared");
    expect(SYSTEM).toContain("Good evening, sir. How is it going?");
    expect(SYSTEM).toContain("Good morning, ma'am. Everything is in order. How may I help?");
    expect(SYSTEM).toMatch(/one or two short sentences/);
    expect(SYSTEM).toMatch(/Never list what you can do/);
    expect(SYSTEM).toMatch(/Never use emojis/);
    expect(SYSTEM).toMatch(/every country and city/);
    expect(SYSTEM).toMatch(/Never assume Erdenet or Mongolia/);
    expect(SYSTEM).toMatch(/get_directions with mode "transit"/);
    expect(SYSTEM).not.toMatch(/default Erdenet|made in Erdenet/);
    // stable: no per-request time in the cached prompt
    expect(SYSTEM).not.toMatch(/time zone Europe|Their local time:/);
  });

  it("nothing the model reads carries emoji or arrow glyphs", async () => {
    const { SYSTEM, TOOL_SPECS, contextNote } = await import("@/lib/brain/shared");
    const glyph = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u;
    expect(SYSTEM).not.toMatch(glyph);
    expect(JSON.stringify(TOOL_SPECS)).not.toMatch(glyph);
    expect(contextNote("en", runAt("2026-11-20T12:00:00Z"))).not.toMatch(glyph);
  });

  it("forSpeech strips emojis, flags and arrows from model output", async () => {
    const { forSpeech } = await import("@/lib/brain/shared");
    const sun = String.fromCodePoint(0x2600, 0xfe0f);
    const smile = String.fromCodePoint(0x1f600);
    const flag = String.fromCodePoint(0x1f1f2, 0x1f1f3);
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const arrow = String.fromCodePoint(0x2192);
    expect(forSpeech(`Good evening, sir ${smile}. Sunny ${sun} today ${flag}.`)).toBe("Good evening, sir. Sunny today.");
    expect(forSpeech(`Home ${arrow} work ${family}`)).toBe("Home work");
    // ordinary punctuation stays
    expect(forSpeech("Minus 12 \u2212 cold \u2014 wear a hat. \u201cQuote\u201d")).toBe("Minus 12 \u2212 cold \u2014 wear a hat. \u201cQuote\u201d");
  });

  it("web search steps carry no icon glyphs", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("BRAIN_ORDER", "claude");
    const create = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
        { type: "text", text: "Done, sir." },
      ],
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        beta = { messages: { create } };
      },
    }));
    const { ask } = await import("@/lib/brain");
    const out = await ask("look it up", "en");
    expect(out.steps).toEqual([{ tool: "web_search", label: "Web search", ok: true }]);
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("ask passes the time zone and city into the tool context", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LOCAL_LLM_URL", "http://local.test/v1");
    vi.stubEnv("BRAIN_ORDER", "local");
    const bodies: Array<{ messages: Array<{ role: string; content?: string }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return json({ choices: [{ message: { content: "Good evening, sir. How is it going?" } }] });
      }),
    );
    const { ask } = await import("@/lib/brain");
    const out = await ask("hi", "en", [], { memory: {}, reminders: [] }, new Date("2026-11-20T19:00:00Z"), { timeZone: "America/Sao_Paulo", city: "Sao Paulo" });
    expect(out.reply).toBe("Good evening, sir. How is it going?");
    expect(bodies[0].messages[0].content).toContain("16:00, afternoon (time zone America/Sao_Paulo)");
    expect(bodies[0].messages[0].content).toContain("They are in Sao Paulo");
  });
});
