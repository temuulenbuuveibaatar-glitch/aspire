import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.stubEnv("ELEVENLABS_API_KEY", "")); // each test opts in
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
    expect(sent!.generation_config.speech_config[0].voice).toBe("Charon");
  });
});

describe("Azure Speech", () => {
  const azureEnv = () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("SPEECH_PROVIDER", "");
    vi.stubEnv("AZURE_SPEECH_KEY", "az-test");
    vi.stubEnv("AZURE_SPEECH_REGION", "eastasia");
  };

  it("is preferred over Gemini, and Gemini takes over when Azure fails", async () => {
    azureEnv();
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("cognitive")) return new Response("busy", { status: 503 });
        return json({ steps: [{ type: "model_output", content: [{ type: "text", text: '{"text": "hallo", "language": "de"}' }] }] });
      }),
    );
    const { speechEngines, transcribe } = await import("@/lib/speech");
    expect(speechEngines()).toEqual(["azure", "gemini"]);
    const out = await transcribe(new Blob([new Uint8Array([1])], { type: "audio/webm" }));
    expect(out.text).toBe("hallo");
    expect(calls[0]).toBe("https://eastasia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15");
  });

  it("listens with all 5 languages as candidates and reads the detected locale", async () => {
    azureEnv();
    vi.stubEnv("GEMINI_API_KEY", "");
    let definition = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        definition = String((init?.body as FormData).get("definition"));
        return json({
          combinedPhrases: [{ text: "Сайн байна уу, автобус хэзээ ирэх вэ?" }],
          phrases: [{ text: "Сайн байна уу, автобус хэзээ ирэх вэ?", locale: "mn-MN" }],
        });
      }),
    );
    const { transcribe } = await import("@/lib/speech");
    const out = await transcribe(new Blob([new Uint8Array([1])], { type: "audio/webm" }));
    expect(out).toEqual({ text: "Сайн байна уу, автобус хэзээ ирэх вэ?", language: "mn", probs: { mn: 1 } });
    expect(JSON.parse(definition).locales).toEqual(["mn-MN", "zh-CN", "en-US", "ru-RU", "de-DE"]);
  });

  it("speaks Mongolian with the Jarvis (male) voice by default and escapes the text", async () => {
    azureEnv();
    let sent: { url: string; body: string; headers: Record<string, string> } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent = { url: String(url), body: String(init?.body), headers: init?.headers as Record<string, string> };
        return new Response(new Uint8Array([0xff, 0xf3, 1, 2]), { headers: { "Content-Type": "audio/mpeg" } });
      }),
    );
    const { synthesize } = await import("@/lib/speech");
    const audio = await synthesize("12 автобус <5 минут>", "mn");
    expect(audio.contentType).toBe("audio/mpeg");
    expect(sent!.url).toBe("https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(sent!.body).toContain('voice name="mn-MN-BataaNeural"');
    expect(sent!.body).toContain("&lt;5 минут&gt;");
    const { azureSsml } = await import("@/lib/speech");
    expect(azureSsml("Hello", "en")).toContain('xml:lang="en-GB"><voice name="en-GB-RyanNeural"');
    expect(azureSsml("Сайн уу", "mn", "friday")).toContain('voice name="mn-MN-YesuiNeural"');
  });

  it("speaks OGG/Opus for Telegram voice notes, cached separately from MP3", async () => {
    azureEnv();
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    const formats: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const fmt = (init?.headers as Record<string, string>)["X-Microsoft-OutputFormat"];
        formats.push(fmt);
        return new Response(new Uint8Array(fmt.startsWith("ogg") ? [0x4f, 0x67, 0x67, 0x53] : [0xff, 0xf3]));
      }),
    );
    const { synthesize } = await import("@/lib/speech");
    const ogg = await synthesize("Сайн уу", "mn", "jarvis", "ogg");
    expect(ogg.contentType).toBe("audio/ogg");
    expect(Buffer.from(ogg.body as Uint8Array).subarray(0, 4).toString("ascii")).toBe("OggS");
    const mp3 = await synthesize("Сайн уу", "mn", "jarvis");
    expect(mp3.contentType).toBe("audio/mpeg");
    expect(formats).toEqual(["ogg-24khz-16bit-mono-opus", "audio-24khz-48kbitrate-mono-mp3"]);
    // Both are cached now: no more requests.
    expect((await synthesize("Сайн уу", "mn", "jarvis", "ogg")).contentType).toBe("audio/ogg");
    expect(formats).toHaveLength(2);
  });

  it("OGG is only made by Azure: other engines are not asked for it", async () => {
    azureEnv();
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return new Response("busy", { status: 503 });
      }),
    );
    const { synthesize, SpeechOffline } = await import("@/lib/speech");
    await expect(synthesize("hi", "en", "jarvis", "ogg")).rejects.toBeInstanceOf(SpeechOffline);
    expect(urls.every((u) => u.includes("tts.speech.microsoft.com"))).toBe(true);
  });

  it("short clips: each language transcribes, the one whose words fit its language wins", async () => {
    const { pickShortClip } = await import("@/lib/speech");
    // Real results from Azure for very short TTS clips ("Hi!", "你好", "Hallo").
    const hi = [
      { lang: "mn" as const, text: "Хай.", confidence: 0.08 },
      { lang: "zh" as const, text: "嗨。", confidence: 0.641 },
      { lang: "en" as const, text: "Hi.", confidence: 0.474 },
      { lang: "ru" as const, text: "Hi.", confidence: 0.442 },
      { lang: "de" as const, text: "Hi.", confidence: 0.304 },
    ];
    expect(pickShortClip(hi, null)?.lang).toBe("en");
    const nihao = [
      { lang: "mn" as const, text: "Не ха.", confidence: 0.053 },
      { lang: "zh" as const, text: "你好。", confidence: 0.903 },
      { lang: "en" as const, text: "Ni hao.", confidence: 0.211 },
      { lang: "ru" as const, text: "Mihal.", confidence: 0.111 },
      { lang: "de" as const, text: "Nihar", confidence: 0.221 },
    ];
    expect(pickShortClip(nihao, null)).toEqual({ lang: "zh", text: "你好。", confidence: 0.903 });
    const hallo = [
      { lang: "mn" as const, text: "Хало.", confidence: 0.059 },
      { lang: "zh" as const, text: "哈喽。", confidence: 0.709 },
      { lang: "en" as const, text: "Hello!", confidence: 0.199 },
      { lang: "ru" as const, text: "Hello!", confidence: 0.321 },
      { lang: "de" as const, text: "Hallo", confidence: 0.324 },
    ];
    expect(pickShortClip(hallo, null)?.lang).toBe("de");
  });
});

describe("ElevenLabs voice", () => {
  const elevenEnv = () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "el-test");
    vi.stubEnv("ELEVENLABS_MODEL", "");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    vi.stubEnv("ELEVENLABS_VOICE_ID_FRIDAY", "");
    vi.stubEnv("SPEECH_URL", "");
    vi.stubEnv("SPEECH_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AZURE_SPEECH_KEY", "az-test");
    vi.stubEnv("AZURE_SPEECH_REGION", "eastasia");
  };
  const mp3 = () => new Response(new Uint8Array([0xff, 0xf3, 9, 9]), { headers: { "Content-Type": "audio/mpeg" } });

  it("speaks first with the British butler voice, sends the key in a header, and caches", async () => {
    elevenEnv();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return mp3();
      }),
    );
    const { synthesize, speechEngines } = await import("@/lib/speech");
    expect(speechEngines()).toEqual(["elevenlabs", "azure"]);
    const audio = await synthesize("Good evening, sir.", "en");
    expect(audio).toMatchObject({ contentType: "audio/mpeg", engine: "elevenlabs" });
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe("el-test");
    expect(calls[0].url).not.toContain("el-test");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "Good evening, sir.", model_id: "eleven_flash_v2_5", language_code: "en" });
    await synthesize("Good evening, sir.", "en");
    expect(calls).toHaveLength(1);
  });

  it("uses the Friday voice and the env overrides", async () => {
    elevenEnv();
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return mp3();
      }),
    );
    const { synthesize } = await import("@/lib/speech");
    await synthesize("Guten Tag.", "de", "friday");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "myJarvis");
    vi.stubEnv("ELEVENLABS_VOICE_ID_FRIDAY", "myFriday");
    await synthesize("Hallo.", "de");
    await synthesize("Hallo.", "de", "friday");
    expect(urls.map((u) => u.split("/").pop()!.split("?")[0])).toEqual(["Xb7hH8MSUJpSbSDYk0k2", "myJarvis", "myFriday"]);
  });

  it("falls back to Azure on any ElevenLabs error (used-up quota)", async () => {
    elevenEnv();
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("elevenlabs")) return json({ detail: { status: "quota_exceeded" } }, 401);
        return mp3();
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { synthesize } = await import("@/lib/speech");
    const audio = await synthesize("Привет.", "ru");
    expect(audio.engine).toBe("azure");
    expect(urls).toEqual([
      "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
      "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1",
    ]);
    // Used-up quota pauses ElevenLabs: the next sentence goes straight to Azure.
    expect((await synthesize("Пока.", "ru")).engine).toBe("azure");
    expect(urls.filter((u) => u.includes("elevenlabs"))).toHaveLength(1);
  });

  it("keeps trying ElevenLabs after a passing error (429 busy)", async () => {
    elevenEnv();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("elevenlabs") && n++ === 0 ? json({ detail: "busy" }, 429) : mp3())),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { synthesize } = await import("@/lib/speech");
    expect((await synthesize("One.", "en")).engine).toBe("azure");
    expect((await synthesize("Two.", "en")).engine).toBe("elevenlabs");
  });

  it("Mongolian stays on Azure with a v2 model; Telegram OGG always uses Azure", async () => {
    elevenEnv();
    vi.stubEnv("ELEVENLABS_MODEL", "eleven_flash_v2_5");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        urls.push(String(url));
        if (String(url).includes("elevenlabs")) expect(JSON.parse(String(init.body)).model_id).toBe("eleven_flash_v2_5");
        return mp3();
      }),
    );
    const { synthesize } = await import("@/lib/speech");
    expect((await synthesize("Сайн байна уу.", "mn")).engine).toBe("azure");
    expect((await synthesize("你好。", "zh")).engine).toBe("elevenlabs");
    expect((await synthesize("Hello.", "en", "jarvis", "ogg")).engine).toBe("azure");
    expect(urls.filter((u) => u.includes("elevenlabs"))).toHaveLength(1);
  });

  it("speaks Mongolian with the opt-in eleven_v3 model", async () => {
    elevenEnv();
    vi.stubEnv("ELEVENLABS_MODEL", "eleven_v3");
    vi.stubGlobal("fetch", vi.fn(async () => mp3()));
    const { synthesize } = await import("@/lib/speech");
    expect((await synthesize("Сайн байна уу.", "mn")).engine).toBe("elevenlabs");
  });
});
