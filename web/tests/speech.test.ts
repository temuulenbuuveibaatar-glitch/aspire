import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("speech engine choice", () => {
  it("uses Gemini when only a Gemini key is set, OmniVoice when SPEECH_URL is set, none otherwise", async () => {
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("SPEECH_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "g");
    const { speechEngine } = await import("@/lib/speech");
    expect(speechEngine()).toBe("gemini");
    vi.stubEnv("SPEECH_URL", "https://voice.test");
    expect(speechEngine()).toBe("omnivoice");
    vi.stubEnv("SPEECH_PROVIDER", "gemini");
    expect(speechEngine()).toBe("gemini");
    vi.stubEnv("SPEECH_PROVIDER", "");
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(speechEngine()).toBeNull();
  });
});

describe("Gemini listening", () => {
  it("sends the recording and reads transcript + language", async () => {
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    let sent: { model: string; input: Array<{ type: string; mime_type?: string; data?: string }> } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return json({
          steps: [
            { type: "user_input" },
            { type: "model_output", content: [{ type: "text", text: '```json\n{"text": "Автобус хэзээ ирэх вэ?", "language": "mn"}\n```' }] },
          ],
        });
      }),
    );
    const { transcribe } = await import("@/lib/speech");
    const out = await transcribe(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" }));
    expect(out).toEqual({ text: "Автобус хэзээ ирэх вэ?", language: "mn", probs: { mn: 0.9 } });
    const audioPart = sent!.input.find((p) => p.type === "audio");
    expect(audioPart?.mime_type).toBe("audio/webm"); // codecs suffix stripped
    expect(audioPart?.data).toBe("AQID");
  });

  it("reports the engine offline on API errors (no crash)", async () => {
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "quota" }, 429)));
    const { transcribe, SpeechOffline } = await import("@/lib/speech");
    await expect(transcribe(new Blob([new Uint8Array([1])], { type: "audio/webm" }))).rejects.toBeInstanceOf(SpeechOffline);
  });
});

describe("Gemini voice", () => {
  it("asks for a warm voice and returns playable WAV, wrapping raw PCM if needed", async () => {
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    const pcm = Buffer.from(new Int16Array([0, 1000, -1000, 0]).buffer);
    let sent: { model: string; generation_config: { speech_config: Array<{ voice: string }> } } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return json({ steps: [{ type: "model_output", content: [{ type: "audio", data: pcm.toString("base64") }] }] });
      }),
    );
    const { synthesize } = await import("@/lib/speech");
    const audio = await synthesize("12 минутын дараа ирнэ.", "mn");
    expect(audio.contentType).toBe("audio/wav");
    const bytes = Buffer.from(audio.body as Uint8Array);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.readUInt32LE(24)).toBe(24_000);
    expect(bytes.length).toBe(44 + pcm.length);
    expect(sent!.model).toContain("tts");
    expect(sent!.generation_config.speech_config[0].voice).toBe("Sulafat");
  });
});
