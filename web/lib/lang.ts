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

/** BCP 47 tag for `lang` attributes and Intl (Chinese is written in simplified script). */
export const HTML_LANG: Record<Lang, string> = { mn: "mn", zh: "zh-Hans", en: "en", ru: "ru", de: "de" };

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

/**
 * The best supported language from an Accept-Language header (untrusted input: capped, parsed
 * defensively, q-values honoured). English when nothing matches, so a page suits any country.
 */
export function langFrom(header: string | null | undefined): Lang {
  if (!header) return "en";
  const ranked = header
    .slice(0, 512)
    .split(",", 24)
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { base } of ranked) if (isLang(base)) return base;
  return "en";
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

// Common Mongolian words with no ө/ү (those letters alone already decide). Kept to words Russian lacks.
const MN_MORE = [
  "би", "бид", "та", "тань", "танд", "надад", "надтай", "чамд", "тэд", "бол", "байх", "байсан", "байгаа", "байдаг",
  "байна", "бна", "уу", "юу", "вэ", "бэ", "яах", "яагаад", "яасан", "ямар", "хэн", "хэнд", "хэрэг", "хэрэгтэй",
  "хаана", "хаашаа", "хаанаас", "хэзээ", "хэдэн", "хэд", "хэр", "хир", "аль", "ийм", "тийм", "энд", "тэнд", "одоо",
  "дараа", "маргааш", "заавал", "болох", "болно", "болсон", "болж", "гэж", "гэсэн", "гэх", "гэнэ", "гээд", "ч",
  "нь", "ба", "бас", "дахин", "дахиад", "тэгээд", "тэгвэл", "харин", "эсвэл", "магадгүй", "сайхан", "сайн", "муу",
  "бага", "маш", "шиг", "аваад", "авах", "ав", "явах", "яв", "ирэх", "ир", "хийх", "хий", "хэл",
  "хэлэх", "хэлээч", "хэлж", "харуул", "харах", "нээ", "нээх", "дуу", "дууг", "тоглуул", "тоглуулах", "хайх",
  "хай", "олох", "ол", "мэдэх", "мэдэхгүй", "мэдээ", "мэдээлэл", "цаг", "агаар", "агаарын", "цасан", "бороо",
  "хүйтэн", "дулаан", "халуун", "салхи", "зам", "замын", "автобус", "автобусны", "такси", "машин", "буудал",
  "буудлын", "хот", "хотын", "аймаг", "гудамж", "байр", "гэр", "ажил", "ажлын", "сургууль", "эмнэлэг", "дэлгүүр",
  "баярлалаа", "уучлаарай", "зүгээр", "тийм", "үгүй", "за", "заа", "хаха", "ээж", "аав", "эмээ", "ах", "эгч",
  "дүү", "найз", "мөнгө", "төгрөг", "хоол", "ус", "цай", "кино", "ном", "утас", "залга", "залгах", "мессеж",
  "илгээ", "илгээх", "бич", "бичих", "код", "програм", "сануул", "сануулах", "хуанли", "уулзалт", "хэдийд",
];
// Russian-only words and endings (not used in Mongolian).
const RU_MORE = [
  "что", "это", "как", "где", "когда", "почему", "зачем", "кто", "мне", "меня", "мой", "моя", "мои", "тебя", "тебе",
  "вас", "вам", "нам", "нас", "они", "она", "оно", "он", "его", "ее", "её", "их", "был", "была", "были", "будет",
  "есть", "нет", "да", "очень", "уже", "еще", "ещё", "только", "тоже", "также", "сейчас", "потом", "здесь", "там",
  "все", "всё", "весь", "можно", "нужно", "надо", "хочу", "хочешь", "пожалуйста", "спасибо", "привет", "погода",
  "сегодня", "завтра", "вчера", "время", "сколько", "какой", "какая", "какие", "который", "этот", "эта", "эти",
  "или", "но", "если", "чтобы", "потому", "для", "без", "под", "над", "при", "про", "через", "после", "перед",
  "напиши", "написать", "письмо", "маме", "мама", "папа", "включи", "позвони", "найди", "открой", "покажи",
  "скажи", "расскажи", "помоги", "сделай", "закажи", "поставь", "напомни", "давай", "хорошо", "ладно",
];
const MN_SET = new Set([...MN_WORDS, ...MN_MORE]);
const RU_SET = new Set([...RU_WORDS, ...RU_MORE]);
/** Mongolian morphology: case and verb endings, and the long vowels Russian words almost never have. */
const MN_SUFFIX = /(аар|ээр|оор|өөр|ын|ийн|ний|тай|тэй|той|гүй|лаа|лээ|лоо|сан|сэн|сон|даг|дэг|дог|аад|ээд|оод|нэ|аач|ээч|оорой|аарай|ээрэй|руу|рүү|луу|лүү|аас|ээс|оос|өөс)$/;
const MN_LONG_VOWEL = /аа|ээ|оо|уу|иа|иу|иэ/; // not "ий": Russian has it (который)
const RU_SUFFIX = /(ого|его|ому|ему|ться|тся|ешь|ишь|ете|ите|ают|яют|ует|ают|ость|ение|ание|ский|ская|ское|ные|ный|ная|ное|ыми|ими|ами|ями)$/;

/** Mongolian vs Russian for Cyrillic text: words, then grammar, then the person's own recent language. */
function cyrillicLanguage(t: string, tokens: string[], hint?: Lang): Lang {
  // ө and ү exist in Mongolian Cyrillic but not in Russian.
  if (/[өү]/.test(t)) return "mn";
  let mn = 0, ru = 0;
  for (const w of tokens) {
    if (MN_SET.has(w)) mn += 3;
    if (RU_SET.has(w)) ru += 3;
    if (w.length > 3 && MN_SUFFIX.test(w)) mn += 1;
    if (w.length > 4 && RU_SUFFIX.test(w)) ru += 1;
    if (MN_LONG_VOWEL.test(w)) mn += 1;
    if (/ы/.test(w) && !/ын$/.test(w)) ru += 1; // ы mid-word: Russian; Mongolian has it mostly in -ын
    if (/[щъ]/.test(w)) ru += 1;
  }
  if (mn > ru) return "mn";
  if (ru > mn) return "ru";
  // A tie: keep the language the person has been using; otherwise Mongolian (the home audience).
  return hint === "ru" ? "ru" : "mn";
}

/** Detect the language of typed or transcribed text. `hint`: the person's recent language, for close calls. */
export function detectTextLanguage(text: string, hint?: Lang): Lang {
  const greeting = greetingLanguage(text);
  if (greeting) return greeting;

  const t = text.toLowerCase();
  if (/\p{Script=Han}/u.test(t)) return "zh";

  const tokens = t.split(/[^\p{L}]+/u).filter(Boolean);

  if (/\p{Script=Cyrillic}/u.test(t)) return cyrillicLanguage(t, tokens, hint);

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
  hint?: Lang,
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
      return detectTextLanguage(transcript, hint);
    }
    if (best && bestP >= 0.3) return best;
  }
  return detectTextLanguage(transcript, hint);
}
