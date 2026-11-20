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
    const out = await ask("Автобус хэзээ ирэх вэ?", "mn");

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
