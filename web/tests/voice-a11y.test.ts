// Eyes-free voice: earcons, speak() reporting whether audio really played, the "tap to hear"
// notice on a blocked play (and the tap that then plays it), the silent clip that unlocks audio inside
// the tap, and the daily briefing counting its day once the text is on screen.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDailyBriefing } from "@/components/aspire/BriefingCard";
import { beep, earcon } from "@/lib/earcon";
import { UI } from "@/lib/ui-text";
import { useVoice, type VoiceHandlers } from "@/lib/use-voice";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubCtx() {
  const oscs: { frequency: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number } }[] = [];
  const ctx = {
    currentTime: 1,
    destination: {},
    createOscillator: vi.fn(() => {
      const o = { frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
      oscs.push(o);
      return o;
    }),
    createGain: vi.fn(() => {
      const g = { gain: { value: 1 }, connect: (n: unknown) => n };
      gains.push(g);
      return g;
    }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, raw: ctx, oscs, gains };
}

describe("earcons", () => {
  it("beep plays one quiet oscillator at the given pitch", () => {
    const { ctx, raw, oscs, gains } = stubCtx();
    beep(ctx, 880);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscs[0].frequency.value).toBe(880);
    expect(gains[0].gain.value).toBe(0.08);
    expect(oscs[0].start).toHaveBeenCalledWith(1);
    expect(oscs[0].stop.mock.calls[0][0]).toBeCloseTo(1.09);
  });

  it("earcon repeats, and is silent without a context or in Calm mode", () => {
    const { ctx, raw, oscs } = stubCtx();
    earcon(ctx, 220, 2);
    expect(raw.createOscillator).toHaveBeenCalledTimes(2);
    expect(oscs[1].start.mock.calls[0][0]).toBeCloseTo(1.15);
    expect(() => earcon(null, 440)).not.toThrow();
    vi.stubGlobal("document", { documentElement: { dataset: { calm: "true" } } });
    earcon(ctx, 440);
    expect(raw.createOscillator).toHaveBeenCalledTimes(2);
  });
});

class FakeAudio {
  static last: FakeAudio | null = null;
  static play: () => Promise<void> = () => Promise.resolve();
  src = "";
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  constructor() {
    FakeAudio.last = this;
  }
  play() {
    return FakeAudio.play();
  }
  pause() {
    this.onpause?.();
  }
}

/** Renders the hook once on the server and hands back what it returned. */
function grab<T>(useHook: () => T): T {
  let out: T | undefined;
  function Probe() {
    out = useHook();
    return null;
  }
  renderToString(createElement(Probe));
  return out as T;
}

function voiceWith(handlers: Partial<VoiceHandlers> = {}) {
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const onNotice = vi.fn();
  const v = grab(() =>
    useVoice({ lang: "en", voice: () => "calm" as never, onHeard: async () => {}, onNotice, onError: () => {}, ...handlers }),
  );
  return { v, onNotice };
}

describe("speak reports whether audio played", () => {
  it("resolves played once play() succeeded and the clip ended", async () => {
    FakeAudio.play = () => Promise.resolve();
    vi.stubGlobal("fetch", async () => new Response(new Blob(["x"], { type: "audio/mpeg" })));
    const { v, onNotice } = voiceWith();
    const done = v.speak("Hello", "en");
    await vi.waitFor(() => expect(FakeAudio.last?.onended).toBeTypeOf("function"));
    FakeAudio.last!.onended!();
    await expect(done).resolves.toBe("played");
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("resolves blocked and asks for a tap when autoplay is blocked", async () => {
    FakeAudio.play = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    vi.stubGlobal("fetch", async () => new Response(new Blob(["x"], { type: "audio/mpeg" })));
    const { v, onNotice } = voiceWith();
    await expect(v.speak("Hello", "en")).resolves.toBe("blocked");
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(UI.en.tapToHear).toBeTruthy();
    expect(onNotice).toHaveBeenCalledWith(UI.en.tapToHear);
  });

  it("the next tap on the orb plays the blocked clip instead of opening the mic", async () => {
    FakeAudio.play = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    vi.stubGlobal("fetch", async () => new Response(new Blob(["x"], { type: "audio/mpeg" })));
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const { v } = voiceWith();
    await v.speak("Hello", "en");
    const src = FakeAudio.last!.src;
    let plays = 0;
    FakeAudio.play = () => {
      plays++;
      return Promise.resolve();
    };
    v.core();
    expect(plays).toBe(1);
    expect(FakeAudio.last!.src).toBe(src);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("resolves failed without a notice for other audio errors, and when the voice is offline", async () => {
    FakeAudio.play = () => Promise.reject(new DOMException("bad", "NotSupportedError"));
    vi.stubGlobal("fetch", async () => new Response(new Blob(["x"])));
    const a = voiceWith();
    await expect(a.v.speak("Hello", "en")).resolves.toBe("failed");
    expect(a.onNotice).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const b = voiceWith();
    await expect(b.v.speak("Hello", "en")).resolves.toBe("failed");
    expect(b.onNotice).toHaveBeenCalledWith(UI.en.voiceOffline);
  });
});

describe("unlocking audio inside the tap", () => {
  it("plays the silent clip from a blob: URL, which the page's media policy allows (it refused data:)", () => {
    let plays = 0;
    FakeAudio.play = () => {
      plays++;
      return Promise.resolve();
    };
    const { v } = voiceWith();
    v.unlock();
    expect(FakeAudio.last!.src).toMatch(/^blob:/);
    expect(plays).toBe(1);
    v.unlock(); // the element is unlocked: nothing is loaded or played again
    expect(plays).toBe(1);
  });
});

describe("daily briefing counts its day once the text is on screen", () => {
  function briefingWith(speak: () => Promise<unknown>) {
    vi.stubGlobal("fetch", async () => Response.json({ text: "Good morning.", mailCount: null, gmailError: false }));
    const setLastDate = vi.fn();
    const { refresh } = grab(() =>
      useDailyBriefing({ lang: "en", reminders: [], speak, lastDate: undefined, setLastDate, ready: false }),
    );
    return { refresh, setLastDate };
  }

  it("marks the day while the voice is still speaking, so a reload meanwhile asks for no second briefing", async () => {
    const { refresh, setLastDate } = briefingWith(() => new Promise(() => {}));
    void refresh();
    await vi.waitFor(() => expect(setLastDate).toHaveBeenCalledTimes(1));
    expect(setLastDate.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("marks the day when playback was blocked too (its notice asks for a tap, the card keeps the text)", async () => {
    const { refresh, setLastDate } = briefingWith(async () => "blocked");
    await refresh();
    expect(setLastDate).toHaveBeenCalledTimes(1);
  });

  it("does not mark the day when no briefing came back", async () => {
    const { refresh, setLastDate } = briefingWith(async () => "played");
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await refresh();
    expect(setLastDate).not.toHaveBeenCalled();
  });

  it("marks the day when it played", async () => {
    const { refresh, setLastDate } = briefingWith(async () => "played");
    await refresh();
    expect(setLastDate).toHaveBeenCalledTimes(1);
    expect(setLastDate.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("marks the day when the voice is offline (its notice was said; no refetch on every open)", async () => {
    const { refresh, setLastDate } = briefingWith(async () => "failed");
    await refresh();
    expect(setLastDate).toHaveBeenCalledTimes(1);
  });

  it("still marks the day for a speak that returns nothing (void callers)", async () => {
    const { refresh, setLastDate } = briefingWith(async () => undefined);
    await refresh();
    expect(setLastDate).toHaveBeenCalledTimes(1);
  });
});
