import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The owner's rule: no emojis or pictographic symbols in anything a person reads or hears.
// Static bot lines bypass the model-side stripEmoji(), so they are checked here.
const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

describe("no arrows or emojis in fixed user-facing text", () => {
  for (const rel of ["../lib/bots/text.ts", "../lib/ui-text.ts"]) {
    it(rel, () => {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      const strings = src.match(STRING_LITERAL) ?? [];
      expect(strings.length).toBeGreaterThan(20);
      expect(strings.filter((s) => SYMBOLS.test(s))).toEqual([]);
    });
  }
});
