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
