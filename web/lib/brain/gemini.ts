// Google Gemini via the generateContent REST API (function calling + Google Search).
import type { Lang } from "@/lib/lang";
import { type Brain, forSpeech, languageNote, MAX_STEPS, runTool, SYSTEM, TOOL_SPECS } from "./shared";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [k: string]: unknown; // e.g. thoughtSignature: sent back unchanged
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

// Gemini's schema dialect does not accept `additionalProperties`.
const declarations = TOOL_SPECS.map((t) => {
  const { additionalProperties: _drop, ...schema } = t.parameters;
  void _drop;
  return { name: t.name, description: t.description, parameters: schema };
});

let searchSupported = process.env.GEMINI_SEARCH !== "0";

async function call(contents: Content[]): Promise<Content> {
  const tools: unknown[] = [{ functionDeclarations: declarations }];
  if (searchSupported) tools.push({ googleSearch: {} });

  const res = await fetch(ENDPOINT(MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      tools,
      generationConfig: { maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // Some models can't combine Google Search with function calling: retry without it.
    if (res.status === 400 && searchSupported && /search|tool/i.test(detail)) {
      searchSupported = false;
      return call(contents);
    }
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { candidates?: Array<{ content?: Content; finishReason?: string }> };
  const content = data.candidates?.[0]?.content;
  if (!content?.parts) throw new Error(`Gemini returned no content (${data.candidates?.[0]?.finishReason ?? "?"})`);
  return content;
}

export const gemini: Brain = {
  name: "gemini",
  configured: () => Boolean(process.env.GEMINI_API_KEY),

  async ask(text, lang: Lang, history) {
    const contents: Content[] = [
      ...history.map((t): Content => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] })),
      { role: "user", parts: [{ text: `(${languageNote(lang)})\n\n${text}` }] },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const content = await call(contents);
      const calls = content.parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        const reply = content.parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join("")
          .trim();
        if (!reply) throw new Error("Gemini returned no text");
        return forSpeech(reply);
      }
      // Send the model turn back unchanged (keeps thought signatures), then the results.
      contents.push({ role: "model", parts: content.parts });
      contents.push({
        role: "user",
        parts: calls.map((p) => ({
          functionResponse: {
            name: p.functionCall!.name,
            response: { result: runTool(p.functionCall!.name, p.functionCall!.args ?? {}) },
          },
        })),
      });
    }
    throw new Error("Gemini did not finish within the step limit");
  },
};
