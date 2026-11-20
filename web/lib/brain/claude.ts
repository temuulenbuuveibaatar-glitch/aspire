// Claude (Anthropic): the default brain, with web search.
import Anthropic from "@anthropic-ai/sdk";
import type { Lang } from "@/lib/lang";
import { type Brain, fallbackLine, forSpeech, languageNote, MAX_STEPS, runTool, SYSTEM, TOOL_SPECS } from "./shared";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const tools: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  ...TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as unknown as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  })),
];

export const claude: Brain = {
  name: "claude",
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

  async ask(text, lang: Lang, history) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: text },
      { role: "system", content: languageNote(lang) },
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
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = response.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
        .map((b) => ({ type: "tool_result", tool_use_id: b.id, content: runTool(b.name, b.input) }));
      messages.push({ role: "user", content: results });
    }
    throw new Error("Claude did not finish within the step limit");
  },
};
