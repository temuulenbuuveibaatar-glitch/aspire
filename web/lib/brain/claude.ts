// Claude (Anthropic): the default brain, with web search + web fetch and the shared toolbox.
import Anthropic from "@anthropic-ai/sdk";
import type { Lang } from "@/lib/lang";
import { addSource, type AgentRun, type Brain, contextNote, fallbackLine, forSpeech, MAX_STEPS, runTool, SYSTEM, TOOL_SPECS } from "./shared";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const tools: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
  ...TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as unknown as Anthropic.Beta.BetaTool.InputSchema,
  })),
];

/** Collect the pages Claude searched, read or cited, for the on-screen source list. */
export function collectSources(content: Anthropic.Beta.BetaContentBlock[], run: AgentRun): void {
  for (const b of content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result") addSource(run, r.url, r.title);
    } else if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") {
      addSource(run, b.content.url, b.content.content?.title);
    } else if (b.type === "text") {
      for (const c of b.citations ?? []) if (c.type === "web_search_result_location") addSource(run, c.url, c.title);
    }
  }
}

export const claude: Brain = {
  name: "claude",
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

  async ask(text, lang: Lang, history, run) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: text },
      { role: "system", content: contextNote(lang, run) },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // If Claude declines, the API retries on a fallback Claude model automatically.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });

      collectSources(response.content, run);
      for (const b of response.content) {
        if (b.type === "server_tool_use") {
          run.steps.push({ tool: b.name, icon: b.name === "web_fetch" ? "📄" : "🔍", label: b.name === "web_fetch" ? "Reading page" : "Web search", ok: true });
        }
      }

      const reply = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (response.stop_reason === "refusal") return fallbackLine(lang);
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason !== "tool_use") {
        if (!reply) throw new Error("Claude returned no text");
        return forSpeech(reply);
      }

      messages.push({ role: "assistant", content: response.content });
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      // Independent tool calls run in parallel; all results go back in one message.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        calls.map(async (b) => ({ type: "tool_result" as const, tool_use_id: b.id, content: await runTool(b.name, b.input, run) })),
      );
      messages.push({ role: "user", content: results });
    }
    throw new Error("Claude did not finish within the step limit");
  },
};
