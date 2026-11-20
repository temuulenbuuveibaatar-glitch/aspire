// Any OpenAI-compatible chat API runs the same agent loop (tools, parallel calls):
//  - "local":    Ollama / LM Studio / vLLM / llama.cpp (Qwen2.5, Hermes 3, DeepSeek-R1 distills...)
//  - "deepseek": DeepSeek's cloud API.
import type { Lang } from "@/lib/lang";
import {
  type Brain,
  contextNote,
  forSpeech,
  MAX_STEPS,
  runTool,
  SYSTEM,
  TOOL_SPECS,
} from "./shared";

interface CompatConfig {
  name: string;
  url: () => string | undefined;
  key: () => string | undefined;
  model: () => string;
  /** Some hosted APIs need a key; local servers don't. */
  needsKey: boolean;
}

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
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

function openAiCompatible(cfg: CompatConfig): Brain {
  const URL_BASE = () => cfg.url()?.replace(/\/$/, "");
  return {
    name: cfg.name,
    configured: () =>
      Boolean(URL_BASE()) && (!cfg.needsKey || Boolean(cfg.key())),

    async ask(text, lang: Lang, history, run) {
      const messages: Message[] = [
        { role: "system", content: `${SYSTEM}\n\n${contextNote(lang, run)}` },
        ...history.map((t): Message =>
          t.role === "user"
            ? { role: "user", content: t.text }
            : { role: "assistant", content: t.text },
        ),
        { role: "user", content: text },
      ];

      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch(`${URL_BASE()}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.key() ? { Authorization: `Bearer ${cfg.key()}` } : {}),
          },
          body: JSON.stringify({
            model: cfg.model(),
            messages,
            tools,
            temperature: 0.3,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok)
          throw new Error(
            `${cfg.name} error ${res.status}: ${(await res.text()).slice(0, 300)}`,
          );
        const data = (await res.json()) as {
          choices?: Array<{
            message?: { content?: string | null; tool_calls?: ToolCall[] };
          }>;
        };
        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error("Local model returned no message");

        if (!msg.tool_calls?.length) {
          const reply = forSpeech(msg.content ?? "");
          if (!reply) throw new Error("Local model returned no text");
          return reply;
        }
        messages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        });
        const results = await Promise.all(
          msg.tool_calls.map(async (call) => {
            let args: unknown = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch {
              args = {};
            }
            return {
              role: "tool" as const,
              tool_call_id: call.id,
              content: await runTool(call.function.name, args, run),
            };
          }),
        );
        messages.push(...results);
      }
      throw new Error(`${cfg.name} did not finish within the step limit`);
    },
  };
}

export const local = openAiCompatible({
  name: "local",
  url: () => process.env.LOCAL_LLM_URL,
  key: () => process.env.LOCAL_LLM_KEY,
  model: () => process.env.LOCAL_LLM_MODEL ?? "qwen2.5:7b",
  needsKey: false,
});

export const deepseek = openAiCompatible({
  name: "deepseek",
  url: () => process.env.DEEPSEEK_URL ?? "https://api.deepseek.com",
  key: () => process.env.DEEPSEEK_API_KEY,
  model: () => process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  needsKey: true,
});
