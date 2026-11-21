import { describe, expect, it } from "vitest";
import { LANG_NAMES, LANGS } from "@/lib/lang";
import { greetingPart, jarvisGreeting, UI } from "@/lib/ui-text";

// Emoji, flags, joiners, variation selectors, and the arrow / dingbat / symbol blocks.
const GLYPH = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

const allStrings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === "object" ? Object.values(v).flatMap(allStrings) : [];

describe("ui-text: no emojis, every city", () => {
  it("has no emoji, flag or arrow glyphs in any language", () => {
    for (const lang of LANGS) {
      for (const s of allStrings(UI[lang])) expect(s, `${lang}: ${s}`).not.toMatch(GLYPH);
    }
  });

  it("language names carry no flags", () => {
    for (const lang of LANGS) {
      expect(Object.keys(LANG_NAMES[lang]).sort()).toEqual(["code", "english", "native"]);
      expect(allStrings(LANG_NAMES[lang]).join(" ")).not.toMatch(GLYPH);
    }
    expect(LANGS.map((l) => LANG_NAMES[l].code)).toEqual(["MN", "ZH", "EN", "RU", "DE"]);
  });

  it("suggestion chips are global: no Erdenet, no tugrik, short", () => {
    for (const lang of LANGS) {
      const chips = UI[lang].suggestions;
      expect(chips.length).toBeGreaterThanOrEqual(4);
      for (const c of chips) {
        expect(c).not.toMatch(/erdenet|эрдэнэт|额尔登特|tugrik|төгрөг|тугрик|图格里克|Tugrik|MNT/i);
        expect(c.length).toBeLessThanOrEqual(48);
      }
    }
  });
});

describe("Jarvis greeting", () => {
  it("is one short sentence plus 'How is it going?' on first open", () => {
    expect(jarvisGreeting("en", "evening", "mr")).toBe("Good evening, sir. How is it going?");
    expect(jarvisGreeting("en", "morning", "mrs")).toBe("Good morning, ma'am. How is it going?");
    expect(jarvisGreeting("en", "afternoon", "")).toBe("Good afternoon. How is it going?");
    expect(jarvisGreeting("en", "evening", "mr", false)).toBe("Good evening, sir.");
  });

  it("follows the spec templates in all five languages", () => {
    expect(jarvisGreeting("mn", "evening", "mr")).toBe("Оройн мэнд, эрхэм ээ. Бүх зүйл сайн байна уу?");
    expect(jarvisGreeting("ru", "evening", "mr")).toBe("Добрый вечер, сэр. Как ваши дела?");
    expect(jarvisGreeting("de", "evening", "mr")).toBe("Guten Abend, Sir. Wie geht es Ihnen?");
    expect(jarvisGreeting("zh", "evening", "mr")).toBe("晚上好，先生。今天过得怎么样？");
  });

  it("can address the person by first name instead of the title", () => {
    expect(jarvisGreeting("en", "evening", "mr", true, "Sarnai")).toBe("Good evening, Sarnai. How is it going?");
    expect(jarvisGreeting("zh", "morning", "", false, "小明")).toBe("早上好，小明。");
    // Markup and symbols in a stored name never reach the greeting.
    expect(jarvisGreeting("en", "morning", "mrs", false, "<{}>")).toBe("Good morning, ma'am.");
  });

  it("never lists capabilities, never exclaims, never says good night", () => {
    for (const lang of LANGS) {
      for (const part of ["morning", "afternoon", "evening"] as const) {
        for (const title of ["mr", "mrs", ""] as const) {
          const g = jarvisGreeting(lang, part, title);
          expect(g).not.toMatch(/[!！]/);
          expect(g).not.toMatch(GLYPH);
          expect(g).not.toMatch(/weather|bus|remind|Gmail|I can/i);
          expect(g.length).toBeLessThanOrEqual(60);
        }
      }
    }
    expect([5, 11, 12, 17, 18, 23, 0, 4].map(greetingPart)).toEqual(["morning", "morning", "afternoon", "afternoon", "evening", "evening", "evening", "evening"]);
  });
});
