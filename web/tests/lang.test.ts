import { describe, expect, it } from "vitest";
import { chooseSpokenLanguage, detectTextLanguage } from "@/lib/lang";

describe("greetings switch language instantly", () => {
  it.each([
    ["hi", "en"],
    ["Hello!", "en"],
    ["ni hao", "zh"],
    ["你好", "zh"],
    ["hallo", "de"],
    ["Guten Morgen", "de"],
    ["privet", "ru"],
    ["Привет!", "ru"],
    ["Здравствуйте", "ru"],
    ["Сайн байна уу", "mn"],
    ["сайн уу", "mn"],
    ["sain baina uu", "mn"],
  ])("%s -> %s", (text, lang) => {
    expect(detectTextLanguage(text)).toBe(lang);
  });
});

describe("full sentences", () => {
  it.each([
    ["Автобус хэзээ ирэх вэ?", "mn"],
    ["12-р автобус хэдэн минутын дараа ирэх вэ", "mn"],
    ["Эмнэлэг рүү яаж явах вэ", "mn"],
    ["Когда придёт автобус?", "ru"],
    ["Где остановка автобуса?", "ru"],
    ["公交车什么时候来？", "zh"],
    ["Wann kommt der nächste Bus?", "de"],
    ["Wie ist das Wetter heute", "de"],
    ["When is the next bus?", "en"],
    ["What is the weather today", "en"],
  ])("%s -> %s", (text, lang) => {
    expect(detectTextLanguage(text)).toBe(lang);
  });
});

describe("spoken: speech-engine probabilities + transcript", () => {
  it("fixes Whisper's Mongolian/Russian confusion from the words", () => {
    expect(chooseSpokenLanguage("Автобус хэзээ ирэх вэ", { ru: 0.7, mn: 0.2 })).toBe("mn");
    expect(chooseSpokenLanguage("Когда придёт автобус", { mn: 0.6, ru: 0.3 })).toBe("ru");
  });
  it("ignores unsupported languages", () => {
    expect(chooseSpokenLanguage("Wann kommt der Bus", { nl: 0.8, de: 0.15 })).toBe("de");
  });
  it("greeting beats a wrong probability", () => {
    expect(chooseSpokenLanguage("ni hao", { en: 0.9 })).toBe("zh");
    expect(chooseSpokenLanguage("privet", { en: 0.9 })).toBe("ru");
  });
});
