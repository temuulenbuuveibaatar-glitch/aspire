// Starter and follow-up chips built from what is happening around the person (spec 10.4), in
// any city: a rain question when rain is likely, an air question when the air is poor, the next
// bus from the nearest stop, the briefing in the morning, and a currency pair for the device's
// region. Plain text only: no emojis or symbols (the chip icon comes from the caller).
import type { Ambient, AqiCategory } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

export type SuggestionKind = "rain" | "air" | "bus" | "briefing" | "reminder" | "teach" | "currency" | "weather" | "route" | "places";

export interface Suggestion {
  label: string;
  kind: SuggestionKind;
}

interface Words {
  rain: string;
  snow: string;
  air: string;
  airBad: string;
  bus: string;
  busFrom: (stop: string) => string;
  briefing: string;
  reminder: string;
  teach: string;
  currency: (from: string, to: string) => string;
  tomorrow: string;
  walkThere: string;
  nearby: string;
  quiz: string;
  remindLater: string;
}

const W: Record<Lang, Words> = {
  mn: {
    rain: "Өнөөдөр бороо орох уу?",
    snow: "Өнөөдөр цас орох уу?",
    air: "Гадаа алхахад агаар цэвэр үү?",
    airBad: "Агаар бохир үед гадаа гарахад юу анхаарах вэ?",
    bus: "Хотын төв рүү автобусаар яаж очих вэ?",
    busFrom: (s) => `${s} буудлаас дараагийн автобус хэзээ ирэх вэ?`,
    briefing: "Өглөөний мэдээг минь уншаад өгөөч",
    reminder: "Маргааш 8 цагт сануулаарай",
    teach: "Надад шинэ зүйл зааж өгөөч",
    currency: (a, b) => `100 ${a} хэдэн ${b} вэ?`,
    tomorrow: "Маргааш цаг агаар ямар байх вэ?",
    walkThere: "Тийшээ явганаар хэр удах вэ?",
    nearby: "Ойролцоо кафе байна уу?",
    quiz: "Намайг шалгаад үзээч",
    remindLater: "Нэг цагийн дараа сануулаарай",
  },
  zh: {
    rain: "今天会下雨吗？",
    snow: "今天会下雪吗？",
    air: "空气适合出去散步吗？",
    airBad: "空气不好时出门要注意什么？",
    bus: "坐公交怎么去市中心？",
    busFrom: (s) => `${s}站的下一班公交什么时候到？`,
    briefing: "给我读今天的早间简报",
    reminder: "明天早上8点提醒我",
    teach: "教我一点新知识",
    currency: (a, b) => `100 ${a} 等于多少 ${b}？`,
    tomorrow: "明天天气怎么样？",
    walkThere: "走路过去要多久？",
    nearby: "附近有咖啡馆吗？",
    quiz: "考考我",
    remindLater: "一小时后提醒我",
  },
  en: {
    rain: "Will it rain today?",
    snow: "Will it snow today?",
    air: "Is the air good for a walk?",
    airBad: "What should I do about the poor air today?",
    bus: "How do I get to the city centre by bus?",
    busFrom: (s) => `Next bus from ${s}?`,
    briefing: "Read my morning briefing",
    reminder: "Remind me tomorrow at 8",
    teach: "Teach me something new",
    currency: (a, b) => `How much is 100 ${a} in ${b}?`,
    tomorrow: "What about tomorrow?",
    walkThere: "How long is it on foot?",
    nearby: "Is there a cafe nearby?",
    quiz: "Quiz me on it",
    remindLater: "Remind me in an hour",
  },
  ru: {
    rain: "Сегодня будет дождь?",
    snow: "Сегодня будет снег?",
    air: "Воздух подходит для прогулки?",
    airBad: "Что делать при плохом воздухе сегодня?",
    bus: "Как доехать до центра на автобусе?",
    busFrom: (s) => `Когда следующий автобус от остановки ${s}?`,
    briefing: "Прочитай мою утреннюю сводку",
    reminder: "Напомни завтра в 8",
    teach: "Научи меня чему-нибудь новому",
    currency: (a, b) => `Сколько будет 100 ${a} в ${b}?`,
    tomorrow: "А что завтра?",
    walkThere: "Сколько идти пешком?",
    nearby: "Есть рядом кафе?",
    quiz: "Проверь меня",
    remindLater: "Напомни через час",
  },
  de: {
    rain: "Regnet es heute?",
    snow: "Schneit es heute?",
    air: "Ist die Luft gut für einen Spaziergang?",
    airBad: "Was tun bei schlechter Luft heute?",
    bus: "Wie komme ich mit dem Bus ins Zentrum?",
    busFrom: (s) => `Nächster Bus ab ${s}?`,
    briefing: "Lies mir mein Morgenbriefing vor",
    reminder: "Erinnere mich morgen um 8",
    teach: "Bring mir etwas Neues bei",
    currency: (a, b) => `Wie viel sind 100 ${a} in ${b}?`,
    tomorrow: "Und morgen?",
    walkThere: "Wie lange zu Fuß?",
    nearby: "Gibt es ein Café in der Nähe?",
    quiz: "Frag mich ab",
    remindLater: "Erinnere mich in einer Stunde",
  },
};

const RAINY = new Set(["drizzle", "rain", "sleet", "hail", "storm"]);
const BAD_AIR: readonly AqiCategory[] = ["sensitive", "unhealthy", "very_unhealthy", "hazardous"];

// The device region's currency (a small table; anything else pairs USD with EUR).
const CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  MN: "MNT",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  RU: "RUB",
  JP: "JPY",
  KR: "KRW",
  IN: "INR",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  TR: "TRY",
  BR: "BRL",
  MX: "MXN",
  ZA: "ZAR",
  NG: "NGN",
  KZ: "KZT",
  UA: "UAH",
  SG: "SGD",
  TH: "THB",
  ID: "IDR",
  DE: "EUR",
  AT: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  IE: "EUR",
  PT: "EUR",
  FI: "EUR",
  GR: "EUR",
};

/** The device's region from its language tags ("de-AT" -> "AT"), or null. */
export function deviceRegion(tags: readonly string[]): string | null {
  for (const tag of tags) {
    try {
      const r = new Intl.Locale(tag).maximize().region;
      if (r && /^[A-Z]{2}$/.test(r)) return r;
    } catch {
      /* bad tag */
    }
  }
  return null;
}

/** "MNT" and "USD" style pair for the region (local first), never the same code twice. */
export function currencyPair(region: string | null): [string, string] {
  const local = (region && CURRENCY[region]) || "USD";
  return [local, local === "USD" ? "EUR" : "USD"];
}

export interface SuggestionContext {
  ambient: Ambient | null;
  /** 0..23 at the place. */
  hour: number | null;
  lang: Lang;
  /** Device language tags (navigator.languages), for the currency pair. */
  tags?: readonly string[];
  max?: number;
}

/** Up to `max` (default 4) starters, most relevant first. */
export function buildSuggestions({ ambient, hour, lang, tags = [], max = 4 }: SuggestionContext): Suggestion[] {
  const w = W[lang] ?? W.en;
  const out: Suggestion[] = [];
  const add = (label: string, kind: SuggestionKind) => {
    if (out.length < max && !out.some((s) => s.kind === kind)) out.push({ label, kind });
  };
  const today = ambient?.weather?.days?.[0];
  const known = ambient?.sky && ambient.sky.known !== false && ambient.weather != null;
  const kind = known ? ambient?.sky.kind : null;
  const wet = (kind != null && RAINY.has(kind)) || (today?.precipChance ?? 0) >= 40;
  if (kind === "snow") add(w.snow, "rain");
  else if (wet) add(w.rain, "rain");
  if (ambient?.air && BAD_AIR.includes(ambient.air.category)) add(w.airBad, "air");
  const morning = hour != null && hour >= 5 && hour < 11;
  if (morning) add(w.briefing, "briefing");
  const stop = ambient?.stops?.find((s) => s && typeof s.name === "string" && s.name.trim());
  if (stop) add(w.busFrom(stop.name.trim().slice(0, 40)), "bus");
  if (!out.some((s) => s.kind === "rain")) add(w.rain, "rain");
  if (!out.some((s) => s.kind === "air")) add(w.air, "air");
  if (!stop) add(w.bus, "bus");
  add(w.briefing, "briefing");
  const [a, b] = currencyPair(deviceRegion(tags));
  add(w.currency(a, b), "currency");
  add(w.reminder, "reminder");
  add(w.teach, "teach");
  return out;
}

/** 2-3 follow-up chips for the last reply, keyed on the first tool it used. */
export function followUps(tool: string | null | undefined, lang: Lang): Suggestion[] {
  const w = W[lang] ?? W.en;
  switch (tool) {
    case "get_weather":
      return [
        { label: w.tomorrow, kind: "weather" },
        { label: w.air, kind: "air" },
      ];
    case "get_air_quality":
      return [
        { label: w.rain, kind: "rain" },
        { label: w.airBad, kind: "air" },
      ];
    case "get_next_bus":
    case "plan_trip":
    case "get_directions":
      return [
        { label: w.walkThere, kind: "route" },
        { label: w.rain, kind: "rain" },
      ];
    case "find_places":
      return [
        { label: w.walkThere, kind: "route" },
        { label: w.nearby, kind: "places" },
      ];
    case "start_lesson":
    case "save_progress":
      return [
        { label: w.quiz, kind: "teach" },
        { label: w.remindLater, kind: "reminder" },
      ];
    case "set_reminder":
      return [{ label: w.briefing, kind: "briefing" }];
    default:
      return [];
  }
}
