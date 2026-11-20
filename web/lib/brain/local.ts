// Local / self-hosted models through any OpenAI-compatible endpoint:
// Ollama (http://localhost:11434/v1), LM Studio, vLLM, llama.cpp server...
// Default model: Qwen2.5 7B. No web search here; bus and time tools work.
import type { Lang } from "@/lib/lang";
import { type Brain, contextNote, forSpeech, MAX_STEPS, runTool, SYSTEM, TOOL_SPECS } from "./shared";

const URL_BASE = () => process.env.LOCAL_LLM_URL?.replace(/\/$/, "");
const MODEL = process.env.LOCAL_LLM_MODEL ?? "qwen2.5:7b";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const tools = TOOL_SPECS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export const local: Brain = {
  name: "local",
  configured: () => Boolean(URL_BASE()),

  async ask(text, lang: Lang, history, run) {
    const messages: Message[] = [
      { role: "system", content: `${SYSTEM}\n\n${contextNote(lang, run)}` },
      ...history.map((t): Message => (t.role === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.text })),
      { role: "user", content: text },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch(`${URL_BASE()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.LOCAL_LLM_KEY ? { Authorization: `Bearer ${process.env.LOCAL_LLM_KEY}` } : {}),
        },
        body: JSON.stringify({ model: MODEL, messages, tools, temperature: 0.3, max_tokens: 1024 }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Local model error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("Local model returned no message");

      if (!msg.tool_calls?.length) {
        const reply = forSpeech(msg.content ?? "");
        if (!reply) throw new Error("Local model returned no text");
        return reply;
      }
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      const results = await Promise.all(
        msg.tool_calls.map(async (call) => {
          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }
          return { role: "tool" as const, tool_call_id: call.id, content: await runTool(call.function.name, args, run) };
        }),
      );
      messages.push(...results);
    }
    throw new Error("Local model did not finish within the step limit");
  },
};
