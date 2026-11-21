"use client";

// Ambient bar: the glanceable live strip under the top bar (spec sections 7.2, 7.6 and 8).
//
// Four separate buttons (Sky, Air, Road, Bus), never one button holding four abbreviated
// values (spec 1.2; the spec wins over the brief). Each has a one-sentence aria-label and
// aria-hidden children, so a screen reader hears one full sentence per button. Values use
// full words ("+6 min", never "+6m"). Four equal columns; when any line would overflow (long
// words, A++ text size, 200% zoom, a late web font) the bar measures itself and becomes 2 x 2
// instead of truncating.
//
// Colour is never the only cue: AQI and traffic carry an icon, a word, a number and a
// coloured marker. AQI and traffic colours only fill markers; text is always ink.
//
// Motion: layout and number changes use transform and opacity only, a spring with no
// bounce, and become instant under prefers-reduced-motion or Calm mode (data-calm on html).
//
// Trust boundary: `data` comes from GET /api/ambient. Every field is re-checked here
// (finite numbers, known enums, arrays), so a partial or malformed payload degrades to
// "Not available here" instead of crashing the screen.

import { memo, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bus,
  CarFront,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Footprints,
  Gauge,
  Leaf,
  MapPin,
  Moon,
  OctagonAlert,
  ShieldAlert,
  Sun,
  TrafficCone,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { aqiCategory, SKY_KINDS, type Ambient, type AqiCategory, type SkyKind, type TrafficLevel } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

/** The live panel sections, in the panel's own order. */
export type AmbientSection = "sky" | "air" | "road" | "transit";

export interface AmbientBarProps {
  data: Ambient | null;
  lang: Lang;
  loading: boolean;
  /** Opens the live panel. Called by every button unless `onOpenSection` is given. */
  onOpen: () => void;
  /** Optional: open the live panel at the tapped section instead. */
  onOpenSection?: (section: AmbientSection) => void;
  /** Optional: force units. Default follows `html[data-units]`, then the device region. */
  units?: "metric" | "imperial";
  /** Optional: show the place and update time above the buttons (default true). */
  showPlace?: boolean;
  /** Optional: share `layoutId`s (tile-sky, tile-air, tile-road, tile-bus) with the tiles (default true). */
  shareLayout?: boolean;
  /** Optional: override the urgency order (for example from lib/urgency.ts). Must name all four sections once. */
  order?: AmbientSection[];
  /** With `order`: whether order[0] is urgent. */
  urgent?: boolean;
  /**
   * Layout (spec 7.1, 7.4, 8):
   * - "bar" (default): the compact 64px strip (4 columns, 2 x 2 when a line overflows).
   * - "grid": the 2 x 2 tile sill under the greeting (urgent tile spans both columns; 4 columns from md).
   * - "rail": the desktop vertical stack of tall tiles with corner ticks.
   */
  variant?: "bar" | "grid" | "rail";
  /** Optional: render only these sections (in urgency order), e.g. the split desktop rails (spec 7.5). */
  only?: AmbientSection[];
}

// ---------------------------------------------------------------------------------------
// Strings (5 languages). Kept here because this unit does not own lib/ui-text.ts.
// ---------------------------------------------------------------------------------------

type AirScale = "us" | "uaqi" | "local";
type Towards = "centre" | "nearby";

type Strings = {
  group: (place: string | null) => string;
  loading: string;
  /** Spec 8: a module with no data still renders with this word and stays tappable. */
  notAvailable: string;
  /** Read first on the urgent tile, so the state is not visual only. */
  urgent: string;
  /** Uppercase tile label of the sky tile ("SKY NOW"). */
  skyNow: string;
  feels: (temp: string) => string;
  live: string;
  scheduled: string;
  walk: (n: number) => string;
  scaleUs: string;
  scaleUniversal: string;
  scaleLocal: string;
  updated: (time: string) => string;
  approx: string;
  air: string;
  road: string;
  bus: string;
  stop: string;
  now: string;
  noDelay: string;
  kind: Record<SkyKind, string>;
  aqiShort: Record<AqiCategory, string>;
  aqiLong: Record<AqiCategory, string>;
  trafficShort: Record<TrafficLevel, string>;
  trafficLong: Record<TrafficLevel, string>;
  /** Same words as the server's probe-route labels, so the bar can re-localise them. */
  towards: Record<Towards, string>;
  min: (n: number) => string;
  busLine: (route: string) => string;
  temp: (n: number, imperial: boolean) => string;
  skyAria: (word: string, temp: string | null, feels: string | null) => string;
  airAria: (long: string, aqi: number, scale: AirScale, dominant: string | null) => string;
  airNA: string;
  roadAria: (level: string, delayMin: number, towards: string) => string;
  roadNA: string;
  busAria: (route: string, when: string, stop: string, walk: number, live: boolean) => string;
  busWhen: (minutes: number, clock: string | null) => string;
  stopAria: (stop: string, distance: string | null, walk: number) => string;
  busNA: string;
};

function ruPlural(n: number, one: string, few: string, many: string): string {
  const r = new Intl.PluralRules("ru").select(Math.abs(n));
  return r === "one" ? one : r === "few" ? few : many;
}
/** Accusative after "через" / "на": 1 минуту, 2 минуты, 5 минут. */
const ruMinAcc = (n: number) => ruPlural(n, "минуту", "минуты", "минут");
/** Nominative: 1 минута, 2 минуты, 5 минут. */
const ruMinNom = (n: number) => ruPlural(n, "минута", "минуты", "минут");

const S: Record<Lang, Strings> = {
  en: {
    group: (p) => (p ? `Live conditions in ${p}` : "Live conditions"),
    loading: "Loading live conditions",
    notAvailable: "Not available here",
    urgent: "Needs attention.",
    skyNow: "Sky now",
    feels: (t) => `Feels ${t}`,
    live: "Live",
    scheduled: "Scheduled",
    walk: (n) => `${n} min walk`,
    scaleUs: "US AQI",
    scaleUniversal: "Universal AQI",
    scaleLocal: "Local AQI",
    updated: (t) => `Updated ${t}`,
    approx: "approximate",
    air: "Air",
    road: "Road",
    bus: "Bus",
    stop: "Stop",
    now: "Now",
    noDelay: "No delay",
    kind: {
      clear: "Clear",
      partly: "Partly cloudy",
      cloudy: "Cloudy",
      fog: "Fog",
      drizzle: "Drizzle",
      rain: "Rain",
      storm: "Storm",
      snow: "Snow",
      sleet: "Sleet",
      hail: "Hail",
    },
    aqiShort: {
      good: "Good",
      moderate: "Moderate",
      sensitive: "Sensitive",
      unhealthy: "Unhealthy",
      very_unhealthy: "Very poor",
      hazardous: "Hazardous",
    },
    aqiLong: {
      good: "good",
      moderate: "moderate",
      sensitive: "unhealthy for sensitive groups",
      unhealthy: "unhealthy",
      very_unhealthy: "very unhealthy",
      hazardous: "hazardous",
    },
    trafficShort: { light: "Light", moderate: "Moderate", heavy: "Heavy" },
    trafficLong: { light: "light", moderate: "moderate", heavy: "heavy" },
    towards: { centre: "to the city centre", nearby: "on nearby roads" },
    min: (n) => `${n} min`,
    busLine: (r) => `Bus ${r}`,
    temp: (n, f) => `${n < 0 ? "minus " : ""}${Math.abs(n)} ${Math.abs(n) === 1 ? "degree" : "degrees"}${f ? " Fahrenheit" : ""}`,
    skyAria: (w, t, fl) =>
      t ? `Weather: ${w.toLowerCase()}, ${t}${fl ? `, feels like ${fl}` : ""}.` : `Weather: ${w.toLowerCase()}. Temperature not available here.`,
    airAria: (l, a, sc, d) =>
      `Air quality ${l}, ${a} ${sc === "us" ? "on the US scale" : sc === "uaqi" ? "on the universal index" : "on the local index"}.${
        d ? ` Main pollutant ${d}.` : ""
      }`,
    airNA: "Air quality not available here.",
    roadAria: (l, d, to) =>
      d > 0 ? `Traffic ${l}, about ${d} ${d === 1 ? "minute" : "minutes"} extra${to ? ` ${to}` : ""}.` : `Traffic ${l}, no delay${to ? ` ${to}` : ""}.`,
    roadNA: "Traffic not available here.",
    busAria: (r, when, s, w, live) => `Bus ${r} ${when} from ${s}, ${live ? "live time" : "scheduled time"}, ${w} minute walk.`,
    busWhen: (m, c) => (m < 1 ? "arriving now" : c ? `at ${c}` : `in ${m} ${m === 1 ? "minute" : "minutes"}`),
    stopAria: (s, d, w) => `Nearest stop ${s}${d ? `, ${d}` : ""}, ${w} minute walk. Live times are not available here.`,
    busNA: "No stops close by.",
  },
  mn: {
    group: (p) => (p ? `${p} орчны мэдээлэл` : "Орчны мэдээлэл"),
    loading: "Орчны мэдээллийг ачаалж байна",
    notAvailable: "Энд мэдээлэл алга",
    urgent: "Анхаарах.",
    skyNow: "Тэнгэр одоо",
    feels: (t) => `Мэдрэгдэх ${t}`,
    live: "Шууд",
    scheduled: "Хуваарьт",
    walk: (n) => `Алхахад ${n} мин`,
    scaleUs: "АНУ-ын AQI",
    scaleUniversal: "Олон улсын AQI",
    scaleLocal: "Орон нутгийн AQI",
    updated: (t) => `${t}-д шинэчилсэн`,
    approx: "ойролцоо",
    air: "Агаар",
    road: "Зам",
    bus: "Автобус",
    stop: "Буудал",
    now: "Одоо",
    noDelay: "Саадгүй",
    kind: {
      clear: "Цэлмэг",
      partly: "Багавтар үүлтэй",
      cloudy: "Үүлэрхэг",
      fog: "Манан",
      drizzle: "Шиврээ",
      rain: "Бороо",
      storm: "Аадар",
      snow: "Цас",
      sleet: "Нойтон цас",
      hail: "Мөндөр",
    },
    aqiShort: {
      good: "Сайн",
      moderate: "Дунд",
      sensitive: "Эмзэг",
      unhealthy: "Муу",
      very_unhealthy: "Маш муу",
      hazardous: "Аюултай",
    },
    aqiLong: {
      good: "сайн",
      moderate: "дунд зэрэг",
      sensitive: "эмзэг бүлэгт хортой",
      unhealthy: "эрүүл мэндэд хортой",
      very_unhealthy: "маш хортой",
      hazardous: "аюултай",
    },
    trafficShort: { light: "Чөлөөтэй", moderate: "Дунд", heavy: "Түгжрэл" },
    trafficLong: {
      light: "чөлөөтэй",
      moderate: "дунд зэрэг",
      heavy: "их түгжрэлтэй",
    },
    towards: { centre: "хотын төв рүү", nearby: "ойролцоох замд" },
    min: (n) => `${n} мин`,
    busLine: (r) => `${r} автобус`,
    temp: (n, f) => `${n < 0 ? "хасах " : ""}${Math.abs(n)} хэм${f ? " Фаренгейт" : ""}`,
    skyAria: (w, t, fl) =>
      t ? `Цаг агаар: ${w.toLowerCase()}, ${t}${fl ? `, мэдрэгдэх нь ${fl}` : ""}.` : `Цаг агаар: ${w.toLowerCase()}. Температурын мэдээлэл алга.`,
    airAria: (l, a, sc, d) =>
      `Агаарын чанар ${l}, ${sc === "us" ? "АНУ-ын индексээр" : sc === "uaqi" ? "олон улсын индексээр" : "орон нутгийн индексээр"} ${a}.${
        d ? ` Гол бохирдуулагч ${d}.` : ""
      }`,
    airNA: "Агаарын чанарын мэдээлэл алга.",
    roadAria: (l, d, to) =>
      d > 0 ? `Замын хөдөлгөөн ${l}, ${to ? `${to} ` : ""}ойролцоогоор ${d} минут нэмэгдэнэ.` : `Замын хөдөлгөөн ${l}, ${to ? `${to} ` : ""}саатал алга.`,
    roadNA: "Замын хөдөлгөөний мэдээлэл алга.",
    busAria: (r, when, s, w, live) => `${r} автобус ${s} буудлаас ${when} хөдөлнө, ${live ? "шууд мэдээгээр" : "хуваарийн дагуу"}, алхахад ${w} минут.`,
    busWhen: (m, c) => (m < 1 ? "яг одоо" : c ? `${c}-д` : `${m} минутын дараа`),
    stopAria: (s, d, w) => `Хамгийн ойр буудал ${s}${d ? `, ${d}` : ""}, алхахад ${w} минут. Шууд цагийн мэдээлэл алга.`,
    busNA: "Ойролцоо буудал алга.",
  },
  zh: {
    group: (p) => (p ? `${p}实时状况` : "实时状况"),
    loading: "正在加载实时状况",
    notAvailable: "此处暂无数据",
    urgent: "请注意。",
    skyNow: "当前天气",
    feels: (t) => `体感 ${t}`,
    live: "实时",
    scheduled: "时刻表",
    walk: (n) => `步行 ${n} 分钟`,
    scaleUs: "美国 AQI",
    scaleUniversal: "通用 AQI",
    scaleLocal: "本地 AQI",
    updated: (t) => `${t} 更新`,
    approx: "大致位置",
    air: "空气",
    road: "路况",
    bus: "公交",
    stop: "车站",
    now: "即将到站",
    noDelay: "无延误",
    kind: {
      clear: "晴",
      partly: "多云",
      cloudy: "阴",
      fog: "雾",
      drizzle: "毛毛雨",
      rain: "雨",
      storm: "雷雨",
      snow: "雪",
      sleet: "雨夹雪",
      hail: "冰雹",
    },
    aqiShort: {
      good: "良好",
      moderate: "中等",
      sensitive: "敏感不宜",
      unhealthy: "不健康",
      very_unhealthy: "很不健康",
      hazardous: "危险",
    },
    aqiLong: {
      good: "良好",
      moderate: "中等",
      sensitive: "对敏感人群不健康",
      unhealthy: "不健康",
      very_unhealthy: "非常不健康",
      hazardous: "危险",
    },
    trafficShort: { light: "畅通", moderate: "缓行", heavy: "拥堵" },
    trafficLong: { light: "畅通", moderate: "缓行", heavy: "拥堵" },
    towards: { centre: "前往市中心", nearby: "附近道路" },
    min: (n) => `${n} 分钟`,
    busLine: (r) => `${r} 路`,
    temp: (n, f) => `${f ? "华氏" : ""}${n < 0 ? "零下" : ""}${Math.abs(n)}度`,
    skyAria: (w, t, fl) => (t ? `天气：${w}，${t}${fl ? `，体感${fl}` : ""}。` : `天气：${w}。暂无气温数据。`),
    airAria: (l, a, sc, d) => `空气质量${l}，${sc === "us" ? "美国标准指数" : sc === "uaqi" ? "通用指数" : "本地指数"} ${a}。${d ? `主要污染物 ${d}。` : ""}`,
    airNA: "暂无空气质量数据。",
    roadAria: (l, d, to) => (d > 0 ? `路况${l}，${to ? `${to}` : ""}约多花 ${d} 分钟。` : `路况${l}，${to ? `${to}` : ""}无延误。`),
    roadNA: "暂无路况数据。",
    busAria: (r, when, s, w, live) => `${r} 路公交${when}从${s}发车，${live ? "实时" : "时刻表"}时间，步行 ${w} 分钟。`,
    busWhen: (m, c) => (m < 1 ? "即将" : c ? `${c} ` : `${m} 分钟后`),
    stopAria: (s, d, w) => `最近的车站：${s}${d ? `，${d}` : ""}，步行 ${w} 分钟。暂无实时到站信息。`,
    busNA: "附近没有车站。",
  },
  ru: {
    group: (p) => (p ? `Обстановка: ${p}` : "Обстановка рядом"),
    loading: "Загружаю обстановку",
    notAvailable: "Здесь нет данных",
    urgent: "Требует внимания.",
    skyNow: "Небо сейчас",
    feels: (t) => `Ощущается ${t}`,
    live: "Онлайн",
    scheduled: "По расписанию",
    walk: (n) => `${n} мин пешком`,
    scaleUs: "AQI США",
    scaleUniversal: "Универсальный AQI",
    scaleLocal: "Местный AQI",
    updated: (t) => `Обновлено в ${t}`,
    approx: "приблизительно",
    air: "Воздух",
    road: "Дорога",
    bus: "Автобус",
    stop: "Остановка",
    now: "Сейчас",
    noDelay: "Без задержек",
    kind: {
      clear: "Ясно",
      partly: "Малооблачно",
      cloudy: "Облачно",
      fog: "Туман",
      drizzle: "Морось",
      rain: "Дождь",
      storm: "Гроза",
      snow: "Снег",
      sleet: "Мокрый снег",
      hail: "Град",
    },
    aqiShort: {
      good: "Хороший",
      moderate: "Умеренный",
      sensitive: "Повышенный",
      unhealthy: "Вредный",
      very_unhealthy: "Очень вредный",
      hazardous: "Опасный",
    },
    aqiLong: {
      good: "хорошее",
      moderate: "умеренное",
      sensitive: "вредное для чувствительных групп",
      unhealthy: "вредное",
      very_unhealthy: "очень вредное",
      hazardous: "опасное",
    },
    trafficShort: { light: "Свободно", moderate: "Умеренно", heavy: "Пробки" },
    trafficLong: {
      light: "свободное",
      moderate: "умеренное",
      heavy: "плотное",
    },
    towards: { centre: "до центра города", nearby: "на ближайших дорогах" },
    min: (n) => `${n} мин`,
    busLine: (r) => `Автобус ${r}`,
    temp: (n, f) => `${n < 0 ? "минус " : ""}${Math.abs(n)} ${ruPlural(n, "градус", "градуса", "градусов")}${f ? " по Фаренгейту" : ""}`,
    skyAria: (w, t, fl) =>
      t ? `Погода: ${w.toLowerCase()}, ${t}${fl ? `, ощущается как ${fl}` : ""}.` : `Погода: ${w.toLowerCase()}. Температура здесь недоступна.`,
    airAria: (l, a, sc, d) =>
      `Качество воздуха ${l}, индекс ${a}${sc === "us" ? " по шкале США" : sc === "uaqi" ? " по универсальной шкале" : " по местной шкале"}.${
        d ? ` Основной загрязнитель ${d}.` : ""
      }`,
    airNA: "Качество воздуха здесь недоступно.",
    roadAria: (l, d, to) =>
      d > 0 ? `Движение ${l}, ${to ? `${to} ` : ""}примерно на ${d} ${ruMinAcc(d)} дольше.` : `Движение ${l}, ${to ? `${to} ` : ""}без задержек.`,
    roadNA: "Данные о движении здесь недоступны.",
    busAria: (r, when, s, w, live) => `Автобус ${r} ${when} от остановки ${s}, ${live ? "в реальном времени" : "по расписанию"}, ${w} ${ruMinNom(w)} пешком.`,
    busWhen: (m, c) => (m < 1 ? "прибывает сейчас" : c ? `в ${c}` : `через ${m} ${ruMinAcc(m)}`),
    stopAria: (s, d, w) => `Ближайшая остановка ${s}${d ? `, ${d}` : ""}, ${w} ${ruMinNom(w)} пешком. Время прибытия здесь недоступно.`,
    busNA: "Поблизости нет остановок.",
  },
  de: {
    group: (p) => (p ? `Aktuelle Lage in ${p}` : "Aktuelle Lage"),
    loading: "Lade aktuelle Lage",
    notAvailable: "Hier nicht verfügbar",
    urgent: "Beachten.",
    skyNow: "Himmel jetzt",
    feels: (t) => `Gefühlt ${t}`,
    live: "Live",
    scheduled: "Fahrplan",
    walk: (n) => `${n} Min. zu Fuß`,
    scaleUs: "US-AQI",
    scaleUniversal: "Universeller AQI",
    scaleLocal: "Lokaler AQI",
    updated: (t) => `Aktualisiert ${t}`,
    approx: "ungefähr",
    air: "Luft",
    road: "Straße",
    bus: "Bus",
    stop: "Haltestelle",
    now: "Jetzt",
    noDelay: "Kein Verzug",
    kind: {
      clear: "Klar",
      partly: "Leicht bewölkt",
      cloudy: "Bewölkt",
      fog: "Nebel",
      drizzle: "Niesel",
      rain: "Regen",
      storm: "Gewitter",
      snow: "Schnee",
      sleet: "Schneeregen",
      hail: "Hagel",
    },
    aqiShort: {
      good: "Gut",
      moderate: "Mäßig",
      sensitive: "Erhöht",
      unhealthy: "Ungesund",
      very_unhealthy: "Sehr ungesund",
      hazardous: "Gefährlich",
    },
    aqiLong: {
      good: "gut",
      moderate: "mäßig",
      sensitive: "ungesund für empfindliche Gruppen",
      unhealthy: "ungesund",
      very_unhealthy: "sehr ungesund",
      hazardous: "gefährlich",
    },
    trafficShort: { light: "Frei", moderate: "Mäßig", heavy: "Stau" },
    trafficLong: { light: "flüssig", moderate: "mäßig", heavy: "dicht" },
    towards: { centre: "ins Stadtzentrum", nearby: "auf Straßen in der Nähe" },
    min: (n) => `${n} Min.`,
    busLine: (r) => `Bus ${r}`,
    temp: (n, f) => `${n < 0 ? "minus " : ""}${Math.abs(n)} Grad${f ? " Fahrenheit" : ""}`,
    skyAria: (w, t, fl) => (t ? `Wetter: ${w}, ${t}${fl ? `, gefühlt ${fl}` : ""}.` : `Wetter: ${w}. Temperatur hier nicht verfügbar.`),
    airAria: (l, a, sc, d) =>
      `Luftqualität ${l}, ${a} ${sc === "us" ? "auf der US-Skala" : sc === "uaqi" ? "auf dem universellen Index" : "auf dem lokalen Index"}.${
        d ? ` Hauptschadstoff ${d}.` : ""
      }`,
    airNA: "Luftqualität hier nicht verfügbar.",
    roadAria: (l, d, to) =>
      d > 0 ? `Verkehr ${l}, ${to ? `${to} ` : ""}etwa ${d} ${d === 1 ? "Minute" : "Minuten"} länger.` : `Verkehr ${l}, ${to ? `${to} ` : ""}ohne Verzögerung.`,
    roadNA: "Verkehrslage hier nicht verfügbar.",
    busAria: (r, when, s, w, live) => `Bus ${r} ${when} ab ${s}, ${live ? "Echtzeit" : "laut Fahrplan"}, ${w} ${w === 1 ? "Minute" : "Minuten"} Fußweg.`,
    busWhen: (m, c) => (m < 1 ? "kommt jetzt" : c ? `um ${c}` : `in ${m} ${m === 1 ? "Minute" : "Minuten"}`),
    stopAria: (s, d, w) => `Nächste Haltestelle ${s}${d ? `, ${d}` : ""}, ${w} ${w === 1 ? "Minute" : "Minuten"} zu Fuß. Echtzeitdaten hier nicht verfügbar.`,
    busNA: "Keine Haltestellen in der Nähe.",
  },
};

const BCP47: Record<Lang, string> = {
  mn: "mn",
  zh: "zh-Hans",
  en: "en",
  ru: "ru",
  de: "de",
};

/** Any probe-route label the server may send, in any language, back to its meaning. */
const TOWARDS_KEY: ReadonlyMap<string, Towards> = new Map(
  Object.values(S).flatMap((s) => [
    [s.towards.centre.toLowerCase(), "centre" as const],
    [s.towards.nearby.toLowerCase(), "nearby" as const],
  ]),
);

/** Google pollutant codes ("pm25") to the names people know. */
const POLLUTANT: Record<string, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  o3: "O3",
  no2: "NO2",
  so2: "SO2",
  co: "CO",
};

const has = <K extends string>(rec: Record<K, unknown>, k: unknown): k is K => typeof k === "string" && Object.hasOwn(rec, k);

// ---------------------------------------------------------------------------------------
// Environment: Calm mode, unit override (html data attributes) and the device languages.
// All read through useSyncExternalStore with a fixed server snapshot, so SSR and hydration
// agree and the client corrects itself right after.
// ---------------------------------------------------------------------------------------

function subscribeHtml(cb: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-calm", "data-units"],
  });
  return () => mo.disconnect();
}

function subscribeLanguages(cb: () => void): () => void {
  window.addEventListener("languagechange", cb);
  return () => window.removeEventListener("languagechange", cb);
}

const useCalm = () =>
  useSyncExternalStore(
    subscribeHtml,
    () => document.documentElement.dataset.calm === "true",
    () => false,
  );

const useUnitsAttr = () =>
  useSyncExternalStore(
    subscribeHtml,
    () => document.documentElement.dataset.units ?? "",
    () => "",
  );

/** The device's preferred languages as one stable string ("" on the server). */
const useDeviceLanguages = () =>
  useSyncExternalStore(
    subscribeLanguages,
    () => (navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]).join(","),
    () => "",
  );

/** Spec 12: the US, Liberia and Myanmar use Fahrenheit. Only an explicit region counts, so a
 *  bare "en" (common worldwide) is not assumed to be American. */
function regionIsImperial(langs: string): boolean {
  for (const tag of langs.split(",")) {
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).region;
      if (region) return region === "US" || region === "LR" || region === "MM";
    } catch {
      /* invalid tag: try the next one */
    }
  }
  return false;
}

/** The user's own locale when it matches the reply language (gives the right 12h or 24h clock). */
function intlLocale(lang: Lang, langs: string): string {
  for (const tag of langs.split(",")) {
    if (tag && tag.toLowerCase().split("-")[0] === lang) return tag;
  }
  return BCP47[lang];
}

// ---------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------

const MINUS = "−";

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function text(v: unknown, max = 80): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function toUnit(c: number, imperial: boolean): number {
  const v = Math.round(imperial ? c * 1.8 + 32 : c);
  return Object.is(v, -0) ? 0 : v;
}

function tempText(c: number, imperial: boolean): string {
  const v = toUnit(c, imperial);
  return `${v < 0 ? MINUS : ""}${Math.abs(v)}°${imperial ? "F" : "C"}`;
}

function distanceText(m: number, imperial: boolean, locale: string): string {
  let value: number;
  let unit: "meter" | "kilometer" | "foot" | "mile";
  if (imperial) {
    const ft = m * 3.28084;
    if (ft < 1000) {
      value = Math.max(10, Math.round(ft / 10) * 10);
      unit = "foot";
    } else {
      value = Math.round((m / 1609.344) * 10) / 10;
      unit = "mile";
    }
  } else if (m < 1000) {
    value = Math.max(10, Math.round(m / 10) * 10);
    unit = "meter";
  } else {
    value = Math.round(m / 100) / 10;
    unit = "kilometer";
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "long",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${value} ${unit === "meter" ? "m" : unit === "kilometer" ? "km" : unit === "foot" ? "ft" : "mi"}`;
  }
}

function clockText(ms: number, timeZone: string | null, locale: string): string | null {
  if (!Number.isFinite(ms)) return null;
  const at = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...opts, timeZone } : opts).format(at);
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, opts).format(at);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------------------
// Icons and colours (spec section 8)
// ---------------------------------------------------------------------------------------

const SKY_ICON: Record<SkyKind, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  storm: [CloudLightning, CloudLightning],
  snow: [CloudSnow, CloudSnow],
  sleet: [CloudHail, CloudHail],
  hail: [CloudHail, CloudHail],
};

type Severity = 1 | 2 | 3 | 4 | 5 | 6;

const AQI_SEVERITY: Record<AqiCategory, Severity> = {
  good: 1,
  moderate: 2,
  sensitive: 3,
  unhealthy: 4,
  very_unhealthy: 5,
  hazardous: 6,
};

const AQI_ICON: Record<Severity, LucideIcon> = {
  1: Leaf,
  2: Wind,
  3: TriangleAlert,
  4: ShieldAlert,
  5: ShieldAlert,
  6: OctagonAlert,
};

const AQI_FILL: Record<Severity, string> = {
  1: "bg-aqi-1",
  2: "bg-aqi-2",
  3: "bg-aqi-3",
  4: "bg-aqi-4",
  5: "bg-aqi-5",
  6: "bg-aqi-6",
};

const TRAFFIC_ICON: Record<TrafficLevel, LucideIcon> = {
  light: CarFront,
  moderate: Gauge,
  heavy: TrafficCone,
};

// Strip cell look per level (spec "Traffic strip"): free solid, slow long dash, jam short dash.
const TRAFFIC_SWATCH: Record<TrafficLevel, string> = {
  light: "var(--color-traffic-free)",
  moderate: "repeating-linear-gradient(90deg, var(--color-traffic-slow) 0 6px, transparent 6px 9px)",
  heavy: "repeating-linear-gradient(90deg, var(--color-traffic-jam) 0 3px, transparent 3px 6px)",
};

const PRECIP: ReadonlySet<SkyKind> = new Set<SkyKind>(["drizzle", "rain", "storm", "snow", "sleet", "hail"]);

const SECTIONS: readonly AmbientSection[] = ["sky", "air", "road", "transit"];

// ---------------------------------------------------------------------------------------
// Data: re-validated at the trust boundary
// ---------------------------------------------------------------------------------------

type Line = { route: string; minutes: number; live: boolean };
type Stop = {
  name: string;
  distanceM: number | null;
  walkMin: number;
  lines: Line[];
};

type Clean = {
  place: string | null;
  approx: boolean;
  kind: SkyKind;
  isDay: boolean;
  /** False when the server had no weather at all (its sky is then a placeholder, not a claim). */
  known: boolean;
  tempC: number | null;
  feelsC: number | null;
  air: {
    aqi: number;
    category: AqiCategory;
    scale: AirScale;
    dominant: string | null;
  } | null;
  traffic: {
    level: TrafficLevel;
    delay: number;
    towards: string | null;
  } | null;
  stops: Stop[];
  timeZone: string | null;
  updatedMs: number;
};

function clean(d: Ambient): Clean {
  const sky = (d.sky ?? {}) as Partial<Ambient["sky"]>;
  const kind: SkyKind = (SKY_KINDS as readonly unknown[]).includes(sky.kind) ? (sky.kind as SkyKind) : "cloudy";
  const w = d.weather;

  let air: Clean["air"] = null;
  if (d.air && fin(d.air.aqi) && d.air.aqi >= 0) {
    const aqi = Math.round(d.air.aqi);
    const scaleRaw = (d.air as { scale?: unknown }).scale;
    const scale: AirScale = scaleRaw == null || scaleRaw === "US_AQI" ? "us" : String(scaleRaw).toUpperCase() === "UAQI" ? "uaqi" : "local";
    const dom = text(d.air.dominant, 20);
    air = {
      aqi,
      category: has(AQI_SEVERITY, d.air.category) ? d.air.category : aqiCategory(aqi),
      scale,
      dominant: dom ? (POLLUTANT[dom.toLowerCase()] ?? dom.toUpperCase()) : null,
    };
  }

  let traffic: Clean["traffic"] = null;
  if (d.traffic && has(TRAFFIC_ICON, d.traffic.level)) {
    traffic = {
      level: d.traffic.level,
      delay: fin(d.traffic.delayMin) ? Math.max(0, Math.round(d.traffic.delayMin)) : 0,
      towards: text(d.traffic.towards, 60),
    };
  }

  const stops: Stop[] = [];
  for (const s of Array.isArray(d.stops) ? d.stops : []) {
    const name = text(s?.name);
    if (!name || !fin(s.walkMin) || s.walkMin < 0) continue;
    const lines: Line[] = [];
    for (const l of Array.isArray(s.lines) ? s.lines : []) {
      const route = text(l?.route, 16);
      if (!route || !fin(l.minutes) || l.minutes < 0) continue;
      lines.push({
        route,
        minutes: l.minutes,
        live: (l as { live?: unknown }).live === true,
      });
    }
    stops.push({
      name,
      distanceM: fin(s.distanceM) && s.distanceM >= 0 ? s.distanceM : null,
      walkMin: s.walkMin,
      lines,
    });
  }

  return {
    place: text(d.place, 120),
    approx: d.locatedBy === "network",
    kind,
    isDay: sky.isDay !== false,
    known: w != null,
    tempC: w && fin(w.tempC) ? w.tempC : null,
    feelsC: w && fin(w.feelsC) ? w.feelsC : null,
    air,
    traffic,
    stops,
    timeZone: text(d.timeZone, 64),
    updatedMs: typeof d.updatedAt === "string" ? Date.parse(d.updatedAt) : NaN,
  };
}

/** No data at all (the request failed or returned nothing): every tile still renders and opens its section. */
const EMPTY: Clean = {
  place: null,
  approx: false,
  kind: "cloudy",
  isDay: true,
  known: false,
  tempC: null,
  feelsC: null,
  air: null,
  traffic: null,
  stops: [],
  timeZone: null,
  updatedMs: Number.NaN,
};

type NextBus = Line & { stop: Stop };

/** Soonest departure you can still walk to; falls back to the soonest overall. */
function pickNextBus(stops: Stop[]): NextBus | null {
  let catchable: NextBus | null = null;
  let any: NextBus | null = null;
  for (const stop of stops) {
    for (const line of stop.lines) {
      const cand: NextBus = { ...line, stop };
      if (!any || cand.minutes < any.minutes) any = cand;
      if (line.minutes >= stop.walkMin && (!catchable || cand.minutes < catchable.minutes)) catchable = cand;
    }
  }
  return catchable ?? any;
}

function nearestStop(stops: Stop[]): Stop | null {
  let best: Stop | null = null;
  for (const s of stops) if (!best || s.walkMin < best.walkMin) best = s;
  return best;
}

/** Spec 7.6 urgency rules, evaluated locally so the bar works before lib/urgency.ts lands. */
function urgencyOrder(c: Clean): { order: AmbientSection[]; urgent: boolean } {
  const first = (s: AmbientSection) => ({
    order: [s, ...SECTIONS.filter((x) => x !== s)],
    urgent: true,
  });
  if (c.air && AQI_SEVERITY[c.air.category] >= 4) return first("air");
  if (c.known && PRECIP.has(c.kind)) return first("sky");
  if (c.stops.some((s) => s.lines.some((l) => l.minutes <= 10))) return first("transit");
  if (c.traffic && (c.traffic.level === "heavy" || c.traffic.delay >= 10)) return first("road");
  return { order: [...SECTIONS], urgent: false };
}

/** A caller's order is used only when it names each of the four sections exactly once. */
function validOrder(o: AmbientSection[] | undefined): o is AmbientSection[] {
  return Array.isArray(o) && o.length === SECTIONS.length && SECTIONS.every((s) => o.includes(s));
}

// ---------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------

type Cell = {
  section: AmbientSection;
  layoutId: string;
  Icon: LucideIcon;
  word: string;
  /** Text of the value line; also the key for the number roll. Null renders "Not available here". */
  value: string | null;
  /** Small inline marker before the value (AQI colour, traffic pattern, walking icon). */
  marker?: ReactNode;
  /** Small trailing tag after the value ("AQI"). */
  tag?: string;
  /** Tile layouts only: the uppercase label above the value ("SKY NOW", "AIR"). */
  label: string;
  /** Tile layouts only: one quieter line under the word (feels like, scale, towards, stop and walk). */
  secondary?: string;
  /** Air tile: the AQI severity (1-6) for the 6-segment meter. */
  severity?: Severity;
  aria: string;
};

const MARKER_RING = "ring-1 ring-line-strong";

function buildCells(c: Clean, t: Strings, lang: Lang, imperial: boolean, locale: string): Record<AmbientSection, Cell> {
  // Sky
  const kindWord = t.kind[c.kind];
  const sameFeel = c.tempC === null || c.feelsC === null || toUnit(c.feelsC, imperial) === toUnit(c.tempC, imperial);
  // No weather behind the sky (no location, or every provider failed): never claim "Clear".
  const sky: Cell = c.known
    ? {
        section: "sky",
        layoutId: "tile-sky",
        Icon: SKY_ICON[c.kind][c.isDay ? 0 : 1],
        word: kindWord,
        label: t.skyNow,
        value: c.tempC !== null ? tempText(c.tempC, imperial) : null,
        secondary: !sameFeel && c.feelsC !== null ? t.feels(tempText(c.feelsC, imperial)) : undefined,
        aria: t.skyAria(
          kindWord,
          c.tempC !== null ? t.temp(toUnit(c.tempC, imperial), imperial) : null,
          !sameFeel && c.feelsC !== null ? t.temp(toUnit(c.feelsC, imperial), imperial) : null,
        ),
      }
    : {
        section: "sky",
        layoutId: "tile-sky",
        Icon: Cloud,
        word: t.skyNow,
        label: t.skyNow,
        value: null,
        aria: t.notAvailable,
      };

  // Air
  let air: Cell;
  if (c.air) {
    const sev = AQI_SEVERITY[c.air.category];
    air = {
      section: "air",
      layoutId: "tile-air",
      Icon: AQI_ICON[sev],
      word: t.aqiShort[c.air.category],
      value: String(c.air.aqi),
      tag: c.air.scale === "uaqi" ? "UAQI" : "AQI",
      label: t.air,
      secondary: c.air.scale === "us" ? t.scaleUs : c.air.scale === "uaqi" ? t.scaleUniversal : t.scaleLocal,
      severity: sev,
      marker: <span className={`inline-block size-3 shrink-0 rounded-[3px] ${MARKER_RING} ${AQI_FILL[sev]}`} />,
      aria: t.airAria(t.aqiLong[c.air.category], c.air.aqi, c.air.scale, c.air.dominant),
    };
  } else {
    air = {
      section: "air",
      layoutId: "tile-air",
      Icon: Leaf,
      word: t.air,
      label: t.air,
      value: null,
      aria: t.airNA,
    };
  }

  // Road
  let road: Cell;
  if (c.traffic) {
    const tr = c.traffic;
    // The server localises `towards` for the language it was fetched in; re-localise known
    // labels for the current language, and read unknown text only in English.
    const key = tr.towards ? TOWARDS_KEY.get(tr.towards.toLowerCase()) : undefined;
    const towards = key ? t.towards[key] : lang === "en" ? (tr.towards ?? "") : "";
    road = {
      section: "road",
      layoutId: "tile-road",
      Icon: TRAFFIC_ICON[tr.level],
      word: t.trafficShort[tr.level],
      value: tr.delay > 0 ? `+${t.min(tr.delay)}` : t.noDelay,
      label: t.road,
      secondary: towards || undefined,
      marker: <span className={`inline-block h-2 w-4 shrink-0 rounded-[2px] ${MARKER_RING}`} style={{ background: TRAFFIC_SWATCH[tr.level] }} />,
      aria: t.roadAria(t.trafficLong[tr.level], tr.delay, towards),
    };
  } else {
    road = {
      section: "road",
      layoutId: "tile-road",
      Icon: CarFront,
      word: t.road,
      label: t.road,
      value: null,
      aria: t.roadNA,
    };
  }

  // Bus
  const nb = pickNextBus(c.stops);
  const near = nearestStop(c.stops);
  let transit: Cell;
  if (nb) {
    // Spec 9: under 1 minute reads "Now"; over 60 reads as the clock time.
    const mins = nb.minutes < 1 ? 0 : Math.round(nb.minutes);
    const clock = mins > 60 ? clockText(c.updatedMs + mins * 60_000, c.timeZone, locale) : null;
    transit = {
      section: "transit",
      layoutId: "tile-bus",
      Icon: Bus,
      word: t.busLine(nb.route),
      label: t.bus,
      value: mins < 1 ? t.now : (clock ?? t.min(mins)),
      secondary: `${nb.stop.name}, ${t.walk(Math.max(1, Math.round(nb.stop.walkMin)))}. ${nb.live ? t.live : t.scheduled}`,
      aria: t.busAria(nb.route, t.busWhen(mins, clock), nb.stop.name, Math.max(1, Math.round(nb.stop.walkMin)), nb.live),
    };
  } else if (near) {
    const walk = Math.max(1, Math.round(near.walkMin));
    const dist = near.distanceM !== null ? distanceText(near.distanceM, imperial, locale) : null;
    transit = {
      section: "transit",
      layoutId: "tile-bus",
      Icon: Bus,
      word: t.stop,
      label: t.bus,
      value: t.min(walk),
      secondary: near.name,
      marker: <Footprints size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />,
      aria: t.stopAria(near.name, dist, walk),
    };
  } else {
    transit = {
      section: "transit",
      layoutId: "tile-bus",
      Icon: Bus,
      word: t.bus,
      label: t.bus,
      value: null,
      aria: t.busNA,
    };
  }

  return { sky, air, road, transit };
}

// ---------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------

// `.panel` lives in @layer components (globals.css) and already handles reduced transparency
// and Calm mode. Do not add bg-/border-/shadow- utilities here: utilities beat the layer and
// would keep the bar translucent in Calm mode.
const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;

/** Number roll: opacity plus a 6px translateY, 180ms (exit 65%); instant when motion is reduced. */
function RollValue({ value, reduced }: { value: string; reduced: boolean }) {
  if (reduced) return <span className="block">{value}</span>;
  return (
    <span className="relative block overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="block"
          initial={{ opacity: 0, y: 6 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
          }}
          exit={{
            opacity: 0,
            y: -6,
            transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Spec 8 AqiMeter, tile size: six 12px segments with a 3px gap, the current band at full strength. */
function AqiSegments({ severity }: { severity: Severity }) {
  return (
    <span aria-hidden className="mt-1 flex w-full gap-[3px]">
      {([1, 2, 3, 4, 5, 6] as const).map((n) => (
        <span key={n} className={`h-3 flex-1 rounded-sm ${AQI_FILL[n]} ${n === severity ? "ring-1 ring-ink" : "opacity-25"}`} />
      ))}
    </span>
  );
}

function SkeletonCell({ tall = false }: { tall?: boolean }) {
  const block = "rounded-[6px] bg-ink-faint/40";
  return (
    <div className={`panel flex flex-col justify-center gap-2 rounded-[22px] px-2.5 py-2 ${tall ? "min-h-[104px]" : "min-h-16"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`${block} size-5`} />
        <span className={`${block} h-3 w-12 max-w-full`} />
      </div>
      <span className={`${block} h-4 w-10 max-w-full`} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------------------

function AmbientBarImpl({
  data,
  lang: langProp,
  loading,
  onOpen,
  onOpenSection,
  units,
  showPlace = true,
  shareLayout = true,
  order: orderProp,
  urgent: urgentProp,
  variant = "bar",
  only,
}: AmbientBarProps) {
  const lang: Lang = has(S, langProp) ? langProp : "en";
  const t = S[lang];
  const prefersReduced = useReducedMotion();
  const calm = useCalm();
  const reduced = Boolean(prefersReduced) || calm;
  const unitsAttr = useUnitsAttr();
  const deviceLangs = useDeviceLanguages();
  const imperial = units ? units === "imperial" : unitsAttr === "imperial" ? true : unitsAttr === "metric" ? false : regionIsImperial(deviceLangs);
  const locale = intlLocale(lang, deviceLangs);

  // Spec 8: with no data at all the tiles still render ("Not available here") and stay tappable.
  const c = data ? clean(data) : loading ? null : EMPTY;
  const cells = c ? buildCells(c, t, lang, imperial, locale) : null;
  const auto = c ? urgencyOrder(c) : null;
  const custom = validOrder(orderProp);
  const fullOrder = custom ? orderProp : (auto?.order ?? [...SECTIONS]);
  const fullUrgent = custom ? Boolean(urgentProp) : Boolean(auto?.urgent);
  const order = only?.length ? fullOrder.filter((s) => only.includes(s)) : fullOrder;
  // The urgent section keeps its mark only when it is still shown first.
  const urgent = fullUrgent && order[0] === fullOrder[0];

  // Four columns unless a line overflows; then 2 x 2. Retry four when the bar gets wider,
  // the root font size changes (text-size control), a web font lands or the content changes.
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<4 | 2>(4);
  const failed = useRef<{ w: number; f: string; key: string } | null>(null);
  const contentKey = cells ? `${lang}|${order.map((s) => `${cells[s].word}/${cells[s].value ?? ""}`).join("|")}` : `${lang}|skeleton`;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const check = () => {
      const w = grid.clientWidth;
      const f = getComputedStyle(document.documentElement).fontSize;
      if (variant !== "bar") return;
      if (cols === 4) {
        let over = false;
        grid.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) over = true;
        });
        if (over) {
          failed.current = { w, f, key: contentKey };
          setCols(2);
        }
      } else {
        const fl = failed.current;
        if (!fl || w > fl.w || f !== fl.f || fl.key !== contentKey) setCols(4);
      }
    };
    check();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(check);
      ro.observe(grid);
      // The content spans change size when the text size or the font changes even though the
      // grid itself keeps its width.
      grid.querySelectorAll<HTMLElement>("[data-fit] > *").forEach((el) => ro?.observe(el));
    }
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", check);
    return () => {
      ro?.disconnect();
      fonts?.removeEventListener?.("loadingdone", check);
    };
  }, [cols, contentKey, variant]);

  const tiles = variant !== "bar";
  const gridCols =
    variant === "rail" ? "flex flex-col" : variant === "grid" ? "grid grid-cols-2 md:grid-cols-4" : cols === 4 ? "grid grid-cols-4" : "grid grid-cols-2";
  const fit = cols === 4 ? "whitespace-nowrap overflow-hidden" : "flex-wrap";
  const wordWrap = cols === 4 ? "whitespace-nowrap" : "min-w-0 break-words";

  if (!c || !cells) {
    return (
      <div role="group" aria-label={t.loading} aria-busy="true" lang={BCP47[lang]} className="w-full">
        <div ref={gridRef} className={`gap-2 ${gridCols}`}>
          {(only?.length ? only : SECTIONS).map((s) => (
            <SkeletonCell key={s} tall={tiles} />
          ))}
        </div>
      </div>
    );
  }

  const updated = clockText(c.updatedMs, c.timeZone, locale);
  const layoutTransition = reduced ? { duration: 0 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  const open = (s: AmbientSection) => {
    if (onOpenSection) onOpenSection(s);
    else onOpen();
  };

  return (
    <div role="group" aria-label={t.group(c.place)} aria-busy={loading || undefined} lang={BCP47[lang]} className="flex w-full flex-col gap-2">
      {showPlace && (c.place || updated) && (
        <div className="panel flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 self-start rounded-[16px] px-3 py-1.5 text-[1rem] leading-[1.3]">
          <MapPin size={18} strokeWidth={2} aria-hidden className="shrink-0 text-accent" />
          {c.place && (
            <span className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">
              {c.place}
              {c.approx && <span className="sr-only">, {t.approx}</span>}
            </span>
          )}
          {updated && <span className="shrink-0 tabular-nums text-ink-muted">{t.updated(updated)}</span>}
        </div>
      )}

      <div className="relative">
        <div ref={gridRef} className={`gap-2 ${gridCols}`}>
          {order.map((s, i) => {
            const cell = cells[s];
            const isUrgent = urgent && i === 0;
            // Label in name (WCAG 2.5.3): the visible word comes first, then "Needs attention."
            // on the urgent tile (otherwise a visual-only state), then the full sentence.
            const name = `${cell.word}. ${isUrgent ? `${t.urgent} ` : ""}${cell.aria}`;
            const base = {
              type: "button" as const,
              // "position": a column switch moves tiles without scaling (no stretched text), and
              // layoutDependency limits projection snapshots to real layout changes, not every render.
              layout: reduced ? false : ("position" as const),
              layoutDependency: `${order.join(",")}|${cols}|${variant}`,
              layoutId: shareLayout ? cell.layoutId : undefined,
              transition: { ...SPRING, layout: layoutTransition },
              whileTap: reduced ? undefined : { scale: 0.97, transition: { duration: 0.1 } },
              onClick: () => open(cell.section),
              "aria-label": name,
              "data-sky-surface": "edge",
              "data-urgent": isUrgent || undefined,
            };
            if (tiles) {
              const wide = variant === "grid" && isUrgent;
              return (
                <motion.button
                  key={cell.section}
                  {...base}
                  className={`panel relative flex min-w-0 flex-col justify-between gap-1 rounded-[22px] px-4 py-3 text-left text-ink [touch-action:manipulation] active:bg-panel-3 ${
                    variant === "rail" ? "ticks min-h-[112px]" : wide ? "col-span-2 min-h-[112px] md:col-span-1" : "min-h-[104px]"
                  }`}
                >
                  {isUrgent && <span aria-hidden className="pointer-events-none absolute inset-y-3 left-0 w-0.5 rounded-full bg-signal" />}
                  <span aria-hidden className="flex items-start justify-between gap-2">
                    <span className="text-label tracking-[0.08em] text-ink-faint uppercase">
                      {cell.label}
                      {isUrgent && <span className="ml-2 font-semibold text-signal">{t.now}</span>}
                    </span>
                    <cell.Icon size={24} strokeWidth={2} className="shrink-0 text-ink-muted" />
                  </span>
                  <span aria-hidden className={wide ? "flex flex-wrap items-end gap-x-3 gap-y-1" : "flex flex-col gap-0.5"}>
                    {cell.value === null ? (
                      <span className="text-body text-ink-muted">{t.notAvailable}</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {cell.marker}
                        <span className="font-display text-value tabular-nums [font-variation-settings:'wdth'_88]">
                          <RollValue value={cell.value} reduced={reduced} />
                        </span>
                      </span>
                    )}
                    {cell.value !== null && <span className="text-body font-medium [overflow-wrap:anywhere]">{cell.word}</span>}
                  </span>
                  {cell.secondary && (
                    <span aria-hidden className="text-small text-ink-muted [overflow-wrap:anywhere]">
                      {cell.secondary}
                    </span>
                  )}
                  {cell.severity && <AqiSegments severity={cell.severity} />}
                </motion.button>
              );
            }
            return (
              <motion.button
                key={cell.section}
                {...base}
                className="panel relative flex min-h-16 min-w-0 flex-col justify-center gap-1 rounded-[22px] px-2.5 py-2 text-left text-ink [touch-action:manipulation] active:bg-panel-3"
              >
                {isUrgent && (
                  // Spec 7.5: the urgent tile gets a 2px signal-colour left rule. A child, not a
                  // box-shadow, so it does not fight the panel's own shadow.
                  <span aria-hidden className="pointer-events-none absolute inset-y-3 left-0 w-0.5 rounded-full bg-signal" />
                )}
                <span aria-hidden data-fit className={`flex min-w-0 items-center gap-1.5 ${fit}`}>
                  <cell.Icon size={20} strokeWidth={2} className="shrink-0" />
                  <span className={`text-[1rem] font-medium leading-[1.3] ${wordWrap}`}>{cell.word}</span>
                </span>
                <span aria-hidden data-fit className={`flex min-w-0 items-center gap-1.5 ${fit}`}>
                  {cell.value === null ? (
                    // Wraps at spaces; a single word that is too long still trips the 2 x 2 switch.
                    <span className="whitespace-normal text-[1rem] leading-[1.3] text-ink-muted">{t.notAvailable}</span>
                  ) : (
                    <>
                      {cell.marker}
                      <span className="font-display text-value-sm tabular-nums [font-variation-settings:'wdth'_88]">
                        <RollValue value={cell.value} reduced={reduced} />
                      </span>
                      {cell.tag && <span className="shrink-0 text-[1rem] leading-[1.3] text-ink-muted">{cell.tag}</span>}
                    </>
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* New data sweep: one 1px accent line, top to bottom, once per update. */}
        {!reduced && data && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[22px]">
            <motion.div
              key={data?.updatedAt}
              className="absolute inset-0"
              initial={{ y: "0%", opacity: 1 }}
              animate={{ y: "100%", opacity: [1, 1, 0] }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
                opacity: { duration: 0.7, times: [0, 0.75, 1] },
              }}
            >
              <div className="h-px w-full bg-accent opacity-70" />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Memoised: the shell re-renders on every keystroke and minute tick; the bar only on its own props. */
export const AmbientBar = memo(AmbientBarImpl);

export default AmbientBar;
