import { describe, expect, it } from "vitest";
import { chooseSpokenLanguage, detectTextLanguage } from "@/lib/lang";

// Everyday Mongolian WITHOUT ө/ү (the letters that used to be the only sure sign), and Russian.
const MN = [
  "сайн байна уу",
  "маргааш цаг агаар ямар байх вэ",
  "автобус хэзээ ирэх вэ",
  "надад дуу тоглуулаад өгөөч", // has ө: easy case kept
  "энэ хаана байдаг вэ",
  "такси дуудаад ирээч",
  "ээждээ мессеж илгээ",
  "яагаад ийм хүйтэн байна", // has ү
  "хоолны газар хаана байна",
  "сургууль руу яаж явах вэ",
  "ажлын цаг хэд вэ",
  "Эрдэнэт хотын замын байдал ямар байна",
  "код бичээд аваач",
  "за баярлалаа",
];
const RU = [
  "привет как дела",
  "какая сегодня погода",
  "когда придёт следующий автобус",
  "где находится ближайшая аптека",
  "мне нужно такси до вокзала",
  "спасибо большое",
  "сколько стоит билет",
  "включи музыку пожалуйста",
  "почему так холодно",
  "напиши письмо маме",
];

describe("Mongolian vs Russian (Cyrillic)", () => {
  it.each(MN)("typed Mongolian stays Mongolian: %s", (s) => expect(detectTextLanguage(s)).toBe("mn"));
  it.each(RU)("typed Russian stays Russian: %s", (s) => expect(detectTextLanguage(s)).toBe("ru"));

  it("a close call keeps the person's recent language, else Mongolian", () => {
    expect(detectTextLanguage("окей")).toBe("mn");
    expect(detectTextLanguage("окей", "ru")).toBe("ru");
  });

  it("speech that the recognizer calls Russian is still Mongolian when the words are", () => {
    expect(chooseSpokenLanguage("маргааш цаг агаар ямар байх вэ", { ru: 0.8, mn: 0.2 })).toBe("mn");
    expect(chooseSpokenLanguage("какая сегодня погода", { ru: 0.8, mn: 0.2 }, "mn")).toBe("ru");
  });
});
