// Automatic language detection for the 5 supported languages.
// No settings: every message is detected on its own, so switching
// language mid-conversation just works.

export const LANGS = ["mn", "zh", "en", "ru", "de"] as const;
export type Lang = (typeof LANGS)[number];

// No flags: a language is not a country. The UI shows `code` ("MN", "ZH", ...) or `native`.
export const LANG_NAMES: Record<Lang, { native: string; english: string; code: string }> = {
  mn: { native: "Монгол", english: "Mongolian", code: "MN" },
  zh: { native: "中文", english: "Chinese", code: "ZH" },
  en: { native: "English", english: "English", code: "EN" },
  ru: { native: "Русский", english: "Russian", code: "RU" },
  de: { native: "Deutsch", english: "German", code: "DE" },
};

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

// Greetings and very short phrases are where speech detectors fail most,
// so they get an exact fast path ("hi" -> en, "ni hao" -> zh, ...).
// `\b` is ASCII-only in JS, so use a Unicode-aware "end of word" instead.
const END = "(?=$|[^\\p{L}])";
const g = (body: string) => new RegExp(`^(?:${body})${END}`, "iu");
const GREETINGS: Array<[RegExp, Lang]> = [
  [g("сайн\\s*(?:байна\\s*)?уу|сайнуу|sain\\s*(?:baina\\s*)?uu|sainuu|sain\\s*bainuu"), "mn"],
  [/^(?:你好|您好|嗨|喂)/u, "zh"],
  [g("ni\\s*hao|nihao|nin\\s*hao|ni\\s*hau"), "zh"],
  [g("привет|здравствуй(?:те)?|добрый\\s+(?:день|вечер|утро)"), "ru"],
  [g("privet|privyet|zdravstvuy(?:te)?|dobryy\\s+den"), "ru"],
  [g("hallo|guten\\s+(?:tag|morgen|abend)|servus|moin|grüß\\s*gott"), "de"],
  [g("hi|hello|hey|good\\s+(?:morning|afternoon|evening)"), "en"],
];

export function greetingLanguage(text: string): Lang | null {
  const t = text.trim().replace(/^[\s"'«“(¡¿.,!?-]+/, "");
  for (const [re, lang] of GREETINGS) if (re.test(t)) return lang;
  return null;
}

const MN_WORDS = [
  "сайн", "байна", "уу", "вэ", "бэ", "юу", "хэзээ", "хаана", "ирэх", "ирнэ", "эмээ", "өвөө",
  "баярлалаа", "болно", "байгаа", "дараа", "минутын", "юм", "би", "чи", "та", "энэ", "тэр",
  "хэдэн", "хэд", "явах", "явна", "автобусны", "буудал", "буудлаас", "хүртэл", "гэж", "яаж",
  "манай", "миний", "нь", "ч", "биш", "өнөөдөр", "маргааш", "цаг", "хүйтэн", "дулаан",
];
const RU_WORDS = [
  "привет", "когда", "где", "что", "как", "спасибо", "здравствуйте", "пожалуйста", "будет",
  "придёт", "придет", "следующий", "автобуса", "остановка", "остановки", "сколько", "минут",
  "мне", "я", "ты", "вы", "это", "не", "и", "в", "на", "до", "из", "сегодня", "завтра",
  "погода", "почему", "который", "час", "нужно", "можно", "ли",
];
const DE_WORDS = [
  "hallo", "guten", "tag", "morgen", "abend", "ich", "wann", "kommt", "der", "die", "das",
  "nächste", "naechste", "danke", "bitte", "wie", "ist", "nicht", "und", "mein", "wo", "bin",
  "haltestelle", "fährt", "faehrt", "spät", "uhr", "heute", "wetter", "was", "warum", "ein",
  "eine", "zum", "zur", "nach", "mit", "auf", "du", "sie", "wir", "es", "gibt",
];
const EN_WORDS = [
  "the", "when", "where", "what", "how", "is", "are", "next", "bus", "stop", "thanks",
  "thank", "please", "i", "you", "my", "to", "from", "will", "does", "today", "weather",
  "why", "which", "time", "can", "a", "an", "of", "and", "it",
];
const MN_LATIN = ["bayarlalaa", "hezee", "khezee", "haana", "khaana", "ireh", "avtobus", "emee", "uvuu", "baina", "bna"];
const RU_LATIN = ["privet", "spasibo", "kogda", "pozhaluysta", "zdravstvuyte", "avtobus kogda"];
const ZH_LATIN = ["ni hao", "nihao", "xie xie", "xiexie", "zai jian", "zaijian", "gong jiao", "gongjiao"];

function countHits(words: string[], tokens: string[]): number {
  const set = new Set(words);
  return tokens.reduce((n, t) => n + (set.has(t) ? 1 : 0), 0);
}

/** Detect the language of typed or transcribed text. */
export function detectTextLanguage(text: string): Lang {
  const greeting = greetingLanguage(text);
  if (greeting) return greeting;

  const t = text.toLowerCase();
  if (/\p{Script=Han}/u.test(t)) return "zh";

  const tokens = t.split(/[^\p{L}]+/u).filter(Boolean);

  if (/\p{Script=Cyrillic}/u.test(t)) {
    // ө and ү exist in Mongolian Cyrillic but not in Russian.
    if (/[өү]/.test(t)) return "mn";
    const mn = countHits(MN_WORDS, tokens);
    const ru = countHits(RU_WORDS, tokens);
    return mn > ru ? "mn" : "ru";
  }

  // Latin script: transliterated Mongolian / Russian / Chinese, German or English.
  if (ZH_LATIN.some((w) => t.includes(w))) return "zh";
  if (MN_LATIN.some((w) => tokens.includes(w) || t.includes(w + " "))) return "mn";
  if (RU_LATIN.some((w) => t.includes(w))) return "ru";
  if (/[äöüß]/.test(t)) return "de";
  const de = countHits(DE_WORDS, tokens);
  const en = countHits(EN_WORDS, tokens);
  return de > en ? "de" : "en";
}

/**
 * Pick the language for a spoken message, combining the speech engine's
 * language probabilities with the transcript itself.
 */
export function chooseSpokenLanguage(
  transcript: string,
  probs: Partial<Record<string, number>> | undefined,
): Lang {
  const greeting = greetingLanguage(transcript);
  if (greeting) return greeting;

  // Script is decisive when it is unambiguous.
  if (/\p{Script=Han}/u.test(transcript)) return "zh";
  if (/[өүӨҮ]/.test(transcript)) return "mn";

  if (probs) {
    let best: Lang | null = null;
    let bestP = 0;
    for (const l of LANGS) {
      const p = probs[l] ?? 0;
      if (p > bestP) {
        best = l;
        bestP = p;
      }
    }
    // Whisper often confuses Mongolian and Russian; let the words decide.
    if (best && (best === "ru" || best === "mn") && /\p{Script=Cyrillic}/u.test(transcript)) {
      return detectTextLanguage(transcript);
    }
    if (best && bestP >= 0.3) return best;
  }
  return detectTextLanguage(transcript);
}
