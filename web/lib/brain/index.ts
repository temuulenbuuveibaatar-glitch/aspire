// Any AI can be the brain. Providers are tried in BRAIN_ORDER; unconfigured ones
// are skipped, and if one fails (outage, rate limit) the next one answers.
import type { Lang } from "@/lib/lang";
import type { ClientAction, DeviceContext, ToolContext, ToolStep } from "@/lib/tools";
import { claude } from "./claude";
import { gemini } from "./gemini";
import { deepseek, local } from "./local";
import type { AgentRun, Brain, Source, Turn } from "./shared";

export type { Source, Turn } from "./shared";

const ALL: Record<string, Brain> = { claude, deepseek, gemini, local };

export class NoBrainConfigured extends Error {
  constructor() {
    super("No AI provider is configured (set ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY or LOCAL_LLM_URL)");
  }
}

export function activeBrains(): Brain[] {
  const order = (process.env.BRAIN_ORDER ?? "claude,deepseek,gemini,local")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in ALL);
  return order.map((n) => ALL[n]).filter((b) => b.configured());
}

export interface AskResult {
  reply: string;
  brain: string;
  actions: ClientAction[];
  steps: ToolStep[];
  /** Web pages used for the answer (shown on screen, not spoken). */
  sources: Source[];
}

const EMPTY_DEVICE: DeviceContext = { memory: {}, reminders: [] };

export async function ask(
  text: string,
  lang: Lang,
  history: Turn[] = [],
  device: DeviceContext = EMPTY_DEVICE,
  now = new Date(),
  /** Server-only capabilities for this request (e.g. a lazy Gmail token); never from the client body. */
  extra: Pick<ToolContext, "gmailToken"> = {},
): Promise<AskResult> {
  const brains = activeBrains();
  if (brains.length === 0) throw new NoBrainConfigured();

  let lastError: unknown;
  for (const brain of brains) {
    // Fresh run per provider so a failed attempt leaves no half-done actions behind.
    const run: AgentRun = { ctx: { now, device, actions: [], ...extra }, steps: [], sources: [] };
    try {
      const reply = await brain.ask(text, lang, history.slice(-8), run);
      return { reply, brain: brain.name, actions: run.ctx.actions, steps: run.steps, sources: run.sources };
    } catch (e) {
      lastError = e;
      console.error(`[brain:${brain.name}] failed, trying next`, e instanceof Error ? e.message.slice(0, 300) : e);
    }
  }
  throw lastError;
}
