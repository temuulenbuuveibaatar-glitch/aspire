// Blind and low-vision users: screen reader mode (one voice per reply), the reply region outside the
// inert root, skip links, keyboard shortcuts, speaker labels and reply language, and named settings.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createElement, type FunctionComponent } from "react";
import { renderToString } from "react-dom/server";
import { MessageList, type ChatMessage } from "@/components/aspire/MessageList";
import { MemoryBody, SettingsBody } from "@/components/aspire/SettingsSheets";
import { DEFAULT_PREFS, parsePrefs } from "@/lib/display-prefs";
import { LANGS } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ userId: "u1", isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over many prop shapes
const html = <P,>(c: FunctionComponent<P>, props: P) => renderToString(createElement(c as FunctionComponent<any>, props as any));
const noop = () => {};

const question: ChatMessage = { id: "q1", role: "user", text: "Сайн уу", lang: "mn" };
const reply: ChatMessage = { id: "r1", role: "assistant", text: "你好，今天天气很好。", lang: "mn" };
const list = (props: Partial<Parameters<typeof MessageList>[0]> = {}) =>
  html(MessageList, { messages: [question, reply], lang: "en", busy: false, thinking: false, webhooks: {}, onReplay: noop, onOpenConnections: noop, ...props });

describe("screen reader mode (display prefs)", () => {
  it("is off by default and survives a round trip", () => {
    expect(DEFAULT_PREFS.screenReader).toBe(false);
    expect(parsePrefs(null).screenReader).toBe(false);
    expect(parsePrefs(JSON.stringify({ screenReader: true })).screenReader).toBe(true);
    expect(parsePrefs(JSON.stringify({ screenReader: "yes" })).screenReader).toBe(false);
  });

  it("has its label, help, the blocked-playback notice and a voice-offline line that does not need sight, in every language", () => {
    for (const l of LANGS) {
      expect(UI[l].screenReaderMode, l).toBeTruthy();
      expect(UI[l].screenReaderHelp, l).toBeTruthy();
      expect(UI[l].tapToHear, l).toBeTruthy();
    }
    expect(UI.en.voiceOffline).not.toMatch(/on screen/i);
    // Neutral wording: it also covers a blocked morning briefing, where no question was asked.
    expect(UI.en.tapToHear).toBe("Playback was blocked. Tap the orb to play it.");
    for (const l of LANGS) expect(UI[l].voiceInputOffline, l).toBeTruthy();
    expect(UI.en.voiceInputOffline).not.toMatch(/answer/i);
  });
});

describe("MessageList", () => {
  it("renders its own reply live region only when asked", () => {
    expect(list({ announceReplies: false })).not.toContain('aria-live="polite"');
    expect(list({ announceReplies: true })).toContain('aria-live="polite"');
  });

  it("says who is speaking and reads an interpreter reply in its own language", () => {
    const out = list();
    // The question is Mongolian on an English screen: its speaker label is Mongolian, like its <li lang>.
    expect(out).toMatch(/<span class="sr-only">Та(<!-- -->)?: <\/span>/);
    expect(out).not.toMatch(/<span class="sr-only">You(<!-- -->)?: <\/span>/);
    expect(out).toContain('<span class="sr-only">Aspire: </span>');
    // A Chinese reply to a Mongolian question: the reply paragraph (and the live region) are zh-Hans.
    expect(out).toMatch(/<p lang="zh-Hans"[^>]*>你好/);
    expect(out).toMatch(/aria-live="polite"[^>]*><p lang="zh-Hans">你好/);
    // Messages can take focus (Jump to latest moves focus to the newest one).
    expect(out).toMatch(/<li lang="mn" tabindex="-1"/);
  });
});

describe("Settings and Memory sheets", () => {
  it("names every choice group and offers the screen reader mode switch", () => {
    const out = html(SettingsBody, {
      t: UI.en,
      lang: "en",
      settings: {},
      busy: false,
      prefs: DEFAULT_PREFS,
      setPrefs: noop,
      update: noop,
      sample: noop,
      chooseLang: noop,
      setShareLocation: noop,
    });
    // Each group is named by the heading just above it, not a repeated aria-label.
    expect(out).not.toMatch(/role="group" aria-label=/);
    const groups = [...out.matchAll(/role="group" aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(groups).toHaveLength(5);
    const named = groups.map((ref) => {
      const at = out.search(new RegExp(`<h[34][^>]* id="${ref.replace(/[^\w-]/g, "\\$&")}"`));
      return at < 0 ? null : out.slice(out.indexOf(">", at) + 1, out.indexOf("<", at + 1));
    });
    expect(named).toEqual([UI.en.voice, UI.en.address, UI.en.textSize, UI.en.units, UI.en.language]);
    expect(out).toMatch(/role="switch" aria-checked="false"[^>]*>(?:(?!<\/button>).)*Screen reader mode/);
  });

  it("names each Remove button after its row", () => {
    const device = { memory: { home: "Erdenet" }, reminders: [], routines: [], lessons: [] } as never;
    const out = html(MemoryBody, { t: UI.en, lang: "en", device, update: noop });
    expect(out).toContain(`aria-label="${UI.en.remove}: home"`);
    // The heading takes focus when the last row goes.
    expect(out).toMatch(/<h3 tabindex="-1"/);
  });
});

describe("Assistant (server render): reply region, skip links, shortcuts", () => {
  it("keeps one reply region after the status region, outside the app root", async () => {
    const { default: Assistant } = await import("@/components/Assistant");
    const out = renderToString(createElement(Assistant));
    const live = out.indexOf('aria-live="polite"');
    expect(out.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(live).toBeGreaterThan(out.indexOf('role="status"'));
    // The app root (the element that turns inert) closes before the footer's end; the region is after it.
    expect(live).toBeGreaterThan(out.indexOf("</footer>"));
    expect(out).toMatch(/href="#aspire-thread"/);
    // The server renders the phone layout: the second skip link goes to the composer's mic in the dock.
    // Named for where it goes, not for an action it does not do (WCAG 2.4.4).
    expect(out).toMatch(/href="#aspire-mic"[^>]*>Skip to the microphone</);
    expect(out).toContain('id="aspire-mic"');
    expect(out).toMatch(/id="aspire-core"[^>]*aria-keyshortcuts="Space Escape"/);
    // The orb keeps one name in every phase; listening and speaking show as pressed.
    expect(out).toMatch(/id="aspire-core" type="button" aria-label="Voice" aria-pressed="false"/);
    expect(out).toMatch(/<main tabindex="-1"/);
  });

  it("Escape drops a recording unsent, and Space still works after a click inside a card or message", () => {
    const app = readFileSync(new URL("../components/Assistant.tsx", import.meta.url), "utf8");
    expect(app).toContain("cancelRef.current();");
    expect(app).not.toContain("coreRef.current();");
    expect(app).toContain("el.tabIndex === -1");
  });

  it("does not announce Listening while the mic is open (item 5)", () => {
    expect(readFileSync(new URL("../components/Assistant.tsx", import.meta.url), "utf8")).toContain('{orbState === "listening" ? "" : pill}');
  });
});
