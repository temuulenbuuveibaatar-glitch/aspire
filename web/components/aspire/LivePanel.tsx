"use client";

// Content of the "Live" sheet: weather now and the next days, air quality, traffic and
// nearby stops for wherever the user is, in any country or city. Every value is spelled
// out in words next to its icon and colour, so nothing depends on colour alone.

import {
  Bus,
  CarFront,
  Clock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  ExternalLink,
  Footprints,
  Gauge,
  Leaf,
  LocateFixed,
  MapPin,
  MessageCircleQuestion,
  Moon,
  OctagonAlert,
  Radio,
  Route,
  ShieldAlert,
  Sun,
  Thermometer,
  TrafficCone,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { createElement, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { Ambient, AmbientAir, AmbientDay, AmbientStop, AmbientTraffic, AqiCategory, SkyKind, TrafficLevel } from "@/lib/ambient-types";
import { aqiCategory } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

export type LiveSection = "sky" | "air" | "road" | "transit";
export type LiveUnits = "metric" | "imperial";

export interface LivePanelProps {
  data: Ambient | null;
  lang: Lang;
  locationShared: boolean;
  onShareLocation: () => void;
  onAsk: (prompt: string) => void;
  /** Section to scroll to (and focus) when the panel opens from a tile. */
  section?: LiveSection;
  /** Override the locale-based unit choice (Settings). */
  units?: LiveUnits;
}

const SECTIONS: readonly LiveSection[] = ["sky", "air", "road", "transit"];
const AQI_CATS: readonly AqiCategory[] = ["good", "moderate", "sensitive", "unhealthy", "very_unhealthy", "hazardous"];
/** US EPA breakpoints; each band gets an equal slice of the gauge. */
const AQI_BREAKS = [0, 50, 100, 150, 200, 300, 500] as const;
const AQI_FALLBACK = ["#5BE3A4", "#F5D76B", "#F5A66B", "#FF8A8A", "#C99BFF", "#E0457B"] as const;
const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
const NUM = "font-display tabular-nums [font-variation-settings:'wdth'_88]";
const CARD = "rounded-lg border border-line bg-panel-2 p-4";
const BTN =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-3 px-4 text-body font-medium text-ink hover:bg-panel-3/80 [overflow-wrap:anywhere]";

/* ------------------------------------------------------------------ copy (5 languages) */

interface Copy {
  nav: Record<LiveSection, string>;
  navLabel: string;
  heads: {
    sky: string;
    forecast: string;
    air: string;
    road: string;
    transit: string;
  };
  kinds: Record<SkyKind, string>;
  feels: (t: string) => string;
  humidity: (p: string) => string;
  wind: (v: string) => string;
  today: string;
  rainChance: (p: string) => string;
  dayAria: (day: string, kind: string, min: string, max: string, rain: string | null) => string;
  nowAria: (t: string) => string;
  noWeather: string;
  aqiCat: Record<AqiCategory, string>;
  advice: readonly [string, string, string, string, string, string];
  aqiAria: (aqi: number, cat: string, scale: string) => string;
  higherBetter: string;
  /** Scale names under the meter and inside the AQI sentence (never the bare English "US AQI"). */
  scaleUs: string;
  scaleUniversal: string;
  mainPollutant: (p: string) => string;
  noAir: string;
  traffic: Record<TrafficLevel, string>;
  delay: (min: number) => string;
  noDelay: string;
  measured: (towards: string) => string;
  ratio: (pct: number) => string;
  trafficMap: string;
  noTraffic: string;
  walk: (dist: string, min: number) => string;
  arrivals: string;
  now: string;
  inMin: (n: number) => string;
  live: string;
  scheduled: string;
  delayed: (n: number) => string;
  last: string;
  lineAria: (r: string) => string;
  towardsStop: (h: string) => string;
  noLive: (min: number) => string;
  noStops: string;
  planRoute: string;
  planPrompt: string;
  askBus: string;
  busPrompt: (stop: string) => string;
  openMaps: string;
  newTab: string;
  u: {
    m: string;
    km: string;
    ft: string;
    mi: string;
    kmh: string;
    mph: string;
  };
  loc: {
    device: string;
    network: string;
    none: string;
    use: string;
    waiting: string;
  };
  footer: (weather: string, air: string, time: string) => string;
  na: string;
  loading: string;
}

const T: Record<Lang, Copy> = {
  en: {
    nav: { sky: "Weather", air: "Air", road: "Traffic", transit: "Stops" },
    navLabel: "Jump to a section",
    heads: {
      sky: "Weather now",
      forecast: "3-day forecast",
      air: "Air quality",
      road: "Traffic",
      transit: "Nearby stops",
    },
    kinds: {
      clear: "Clear",
      partly: "Partly cloudy",
      cloudy: "Cloudy",
      fog: "Fog",
      drizzle: "Drizzle",
      rain: "Rain",
      storm: "Thunderstorm",
      snow: "Snow",
      sleet: "Sleet",
      hail: "Hail",
    },
    feels: (t) => `Feels like ${t}`,
    humidity: (p) => `Humidity ${p}`,
    wind: (v) => `Wind ${v}`,
    today: "Today",
    rainChance: (p) => `Chance of rain or snow ${p}`,
    dayAria: (d, k, mn, mx, r) => `${d}: ${k}, low ${mn}, high ${mx}${r ? `, chance of rain or snow ${r}` : ""}.`,
    nowAria: (t) => `Now ${t}`,
    noWeather: "Weather is not available here right now.",
    aqiCat: {
      good: "Good",
      moderate: "Moderate",
      sensitive: "Unhealthy for sensitive groups",
      unhealthy: "Unhealthy",
      very_unhealthy: "Very unhealthy",
      hazardous: "Hazardous",
    },
    advice: [
      "The air is clean. A good time for a walk.",
      "The air is acceptable. Very sensitive people may wish to take it easy outdoors.",
      "Children, older people and sensitive groups should limit long exertion outdoors.",
      "The air is unhealthy. I would keep the windows closed and limit time outside.",
      "The air is very unhealthy. Best to stay indoors with the windows closed.",
      "The air is hazardous. Please stay indoors and avoid all outdoor activity.",
    ],
    aqiAria: (a, c, s) => `Air quality ${c.toLowerCase()}, ${a} on the ${s} scale.`,
    mainPollutant: (p) => `Main pollutant: ${p}`,
    higherBetter: "higher is better",
    scaleUs: "US AQI",
    scaleUniversal: "Universal AQI",
    noAir: "Air quality is not available here.",
    traffic: {
      light: "Light traffic",
      moderate: "Moderate traffic",
      heavy: "Heavy traffic",
    },
    delay: (n) => `+${n} min`,
    noDelay: "Clear, no delay",
    measured: (t) => `Measured while driving ${t}`,
    ratio: (p) => `The trip takes ${p}% of the usual time`,
    trafficMap: "Open the live traffic map",
    noTraffic: "Traffic is not available here.",
    walk: (d, m) => `${d}, ${m} min walk`,
    arrivals: "Next departures",
    now: "Now",
    inMin: (n) => `${n} min`,
    live: "Live",
    scheduled: "Scheduled",
    delayed: (n) => `Delayed ${n} min`,
    last: "Last",
    lineAria: (r) => `Line ${r}`,
    towardsStop: (h) => `to ${h}`,
    noLive: (m) => `Live times are not available here. The nearest stop is a ${m} minute walk.`,
    noStops: "No stops close by. I can plan a route if you tell me where you are going.",
    planRoute: "Plan a route",
    planPrompt: "Please plan a route for me.",
    askBus: "Ask about the next bus",
    busPrompt: (s) => `When is the next bus from ${s}?`,
    openMaps: "Open in Google Maps",
    newTab: "(opens in a new tab)",
    u: { m: "m", km: "km", ft: "ft", mi: "mi", kmh: "km/h", mph: "mph" },
    loc: {
      device: "Precise location from this device.",
      network: "Approximate location, based on your network.",
      none: "Location is off.",
      use: "Use my precise location",
      waiting: "Waiting for this device's location.",
    },
    footer: (w, a, t) => `Weather: ${w}. Air: ${a}. Updated ${t}.`,
    na: "not available",
    loading: "Gathering the latest conditions.",
  },
  mn: {
    nav: { sky: "Цаг агаар", air: "Агаар", road: "Зам", transit: "Буудал" },
    navLabel: "Хэсэг рүү шилжих",
    heads: {
      sky: "Одоогийн цаг агаар",
      forecast: "3 хоногийн төлөв",
      air: "Агаарын чанар",
      road: "Замын хөдөлгөөн",
      transit: "Ойролцоох буудлууд",
    },
    kinds: {
      clear: "Цэлмэг",
      partly: "Багавтар үүлтэй",
      cloudy: "Үүлэрхэг",
      fog: "Манантай",
      drizzle: "Шиврээ бороо",
      rain: "Бороо",
      storm: "Аянгатай бороо",
      snow: "Цас",
      sleet: "Нойтон цас",
      hail: "Мөндөр",
    },
    feels: (t) => `Мэдрэгдэх ${t}`,
    humidity: (p) => `Чийгшил ${p}`,
    wind: (v) => `Салхи ${v}`,
    today: "Өнөөдөр",
    rainChance: (p) => `Хур тунадасны магадлал ${p}`,
    dayAria: (d, k, mn, mx, r) => `${d}: ${k}, хамгийн бага ${mn}, хамгийн их ${mx}${r ? `, хур тунадасны магадлал ${r}` : ""}.`,
    nowAria: (t) => `Одоо ${t}`,
    noWeather: "Одоогоор цаг агаарын мэдээлэл алга.",
    aqiCat: {
      good: "Сайн",
      moderate: "Дунд зэрэг",
      sensitive: "Мэдрэг бүлэгт хортой",
      unhealthy: "Эрүүл мэндэд хортой",
      very_unhealthy: "Маш хортой",
      hazardous: "Аюултай",
    },
    advice: [
      "Агаар цэвэр байна. Алхахад тохиромжтой цаг.",
      "Агаар хүлцэхүйц байна. Маш мэдрэг хүмүүс гадаа удаан байхгүй байсан нь дээр.",
      "Хүүхэд, өндөр настан, мэдрэг хүмүүс гадаа удаан хүч гаргахгүй байхыг зөвлөе.",
      "Агаар эрүүл мэндэд хортой байна. Цонхоо хааж, гадаа бага байхыг зөвлөе.",
      "Агаар маш хортой байна. Цонхоо хаагаад гэртээ байсан нь дээр.",
      "Агаар аюултай байна. Гэртээ байж, гадаа гарахаас татгалзана уу.",
    ],
    aqiAria: (a, c, s) => `Агаарын чанар: ${c}, ${s} индексээр ${a}.`,
    mainPollutant: (p) => `Гол бохирдуулагч: ${p}`,
    higherBetter: "өндөр нь сайн",
    scaleUs: "АНУ-ын AQI",
    scaleUniversal: "Олон улсын AQI",
    noAir: "Энд агаарын чанарын мэдээлэл алга.",
    traffic: {
      light: "Хөдөлгөөн чөлөөтэй",
      moderate: "Хөдөлгөөн дунд зэрэг",
      heavy: "Түгжрэл ихтэй",
    },
    delay: (n) => `+${n} мин`,
    noDelay: "Чөлөөтэй, саатал алга",
    measured: (t) => `Хэмжсэн чиглэл: ${t}`,
    ratio: (p) => `Аялал ердийн хугацааны ${p}% болж байна`,
    trafficMap: "Замын түгжрэлийн газрын зураг нээх",
    noTraffic: "Энд замын хөдөлгөөний мэдээлэл алга.",
    walk: (d, m) => `${d}, явганаар ${m} мин`,
    arrivals: "Дараагийн ирэлт",
    now: "Одоо",
    inMin: (n) => `${n} мин`,
    live: "Шууд",
    scheduled: "Хуваарийн дагуу",
    delayed: (n) => `${n} мин хоцорсон`,
    last: "Сүүлийнх",
    lineAria: (r) => `${r} чиглэл`,
    towardsStop: (h) => `${h} руу`,
    noLive: (m) => `Энд шууд цагийн мэдээлэл байхгүй. Хамгийн ойр буудал явганаар ${m} минут.`,
    noStops: "Ойролцоо буудал алга. Хаашаа явахаа хэлбэл би маршрут гаргаж өгье.",
    planRoute: "Маршрут төлөвлөх",
    planPrompt: "Надад маршрут төлөвлөж өгөөч.",
    askBus: "Дараагийн автобусыг асуух",
    busPrompt: (s) => `${s} буудлаас дараагийн автобус хэзээ ирэх вэ?`,
    openMaps: "Google Maps-д нээх",
    newTab: "(шинэ цонхонд нээгдэнэ)",
    u: { m: "м", km: "км", ft: "фут", mi: "миль", kmh: "км/ц", mph: "миль/ц" },
    loc: {
      device: "Энэ төхөөрөмжийн яг байршил.",
      network: "Ойролцоо байршил, сүлжээгээр тодорхойлсон.",
      none: "Байршил унтраалттай байна.",
      use: "Яг байршлаа ашиглах",
      waiting: "Төхөөрөмжийн байршлыг хүлээж байна.",
    },
    footer: (w, a, t) => `Цаг агаар: ${w}. Агаар: ${a}. Шинэчилсэн ${t}.`,
    na: "байхгүй",
    loading: "Сүүлийн мэдээллийг цуглуулж байна.",
  },
  zh: {
    nav: { sky: "天气", air: "空气", road: "路况", transit: "车站" },
    navLabel: "跳转到栏目",
    heads: {
      sky: "当前天气",
      forecast: "未来三天",
      air: "空气质量",
      road: "路况",
      transit: "附近车站",
    },
    kinds: {
      clear: "晴",
      partly: "局部多云",
      cloudy: "阴",
      fog: "雾",
      drizzle: "毛毛雨",
      rain: "雨",
      storm: "雷暴",
      snow: "雪",
      sleet: "雨夹雪",
      hail: "冰雹",
    },
    feels: (t) => `体感 ${t}`,
    humidity: (p) => `湿度 ${p}`,
    wind: (v) => `风速 ${v}`,
    today: "今天",
    rainChance: (p) => `降水概率 ${p}`,
    dayAria: (d, k, mn, mx, r) => `${d}：${k}，最低 ${mn}，最高 ${mx}${r ? `，降水概率 ${r}` : ""}。`,
    nowAria: (t) => `现在 ${t}`,
    noWeather: "暂时无法获取天气信息。",
    aqiCat: {
      good: "优",
      moderate: "良",
      sensitive: "对敏感人群不健康",
      unhealthy: "不健康",
      very_unhealthy: "非常不健康",
      hazardous: "危险",
    },
    advice: [
      "空气清新，正适合散步。",
      "空气尚可。特别敏感的人请减少长时间户外活动。",
      "儿童、老人和敏感人群请减少长时间的户外剧烈活动。",
      "空气不健康。建议关好窗户，减少外出。",
      "空气非常不健康。最好待在室内并关好窗户。",
      "空气质量危险。请留在室内，避免一切户外活动。",
    ],
    aqiAria: (a, c, s) => `空气质量${c}，${s} 指数 ${a}。`,
    mainPollutant: (p) => `首要污染物：${p}`,
    higherBetter: "越高越好",
    scaleUs: "美国 AQI",
    scaleUniversal: "通用 AQI",
    noAir: "此处暂无空气质量数据。",
    traffic: { light: "交通畅通", moderate: "交通缓慢", heavy: "交通拥堵" },
    delay: (n) => `+${n} 分钟`,
    noDelay: "畅通，无延误",
    measured: (t) => `测量路线：${t}`,
    ratio: (p) => `行程用时为平时的 ${p}%`,
    trafficMap: "打开实时路况地图",
    noTraffic: "此处暂无路况数据。",
    walk: (d, m) => `${d}，步行 ${m} 分钟`,
    arrivals: "即将发车",
    now: "即将到站",
    inMin: (n) => `${n} 分钟`,
    live: "实时",
    scheduled: "按时刻表",
    delayed: (n) => `晚点 ${n} 分钟`,
    last: "末班",
    lineAria: (r) => `${r} 路`,
    towardsStop: (h) => `开往 ${h}`,
    noLive: (m) => `此处暂无实时到站信息。最近的车站步行约 ${m} 分钟。`,
    noStops: "附近没有车站。告诉我您要去哪里，我可以为您规划路线。",
    planRoute: "规划路线",
    planPrompt: "请帮我规划一条路线。",
    askBus: "询问下一班车",
    busPrompt: (s) => `${s}站的下一班公交车什么时候到？`,
    openMaps: "在 Google 地图中打开",
    newTab: "（在新标签页中打开）",
    u: {
      m: "米",
      km: "公里",
      ft: "英尺",
      mi: "英里",
      kmh: "公里/小时",
      mph: "英里/小时",
    },
    loc: {
      device: "来自本设备的精确位置。",
      network: "大致位置（根据网络判断）。",
      none: "位置已关闭。",
      use: "使用我的精确位置",
      waiting: "正在等待本设备的位置。",
    },
    footer: (w, a, t) => `天气：${w}。空气：${a}。更新于 ${t}。`,
    na: "无",
    loading: "正在获取最新情况。",
  },
  ru: {
    nav: { sky: "Погода", air: "Воздух", road: "Дороги", transit: "Остановки" },
    navLabel: "Перейти к разделу",
    heads: {
      sky: "Погода сейчас",
      forecast: "Прогноз на 3 дня",
      air: "Качество воздуха",
      road: "Дороги",
      transit: "Остановки рядом",
    },
    kinds: {
      clear: "Ясно",
      partly: "Переменная облачность",
      cloudy: "Облачно",
      fog: "Туман",
      drizzle: "Морось",
      rain: "Дождь",
      storm: "Гроза",
      snow: "Снег",
      sleet: "Мокрый снег",
      hail: "Град",
    },
    feels: (t) => `Ощущается как ${t}`,
    humidity: (p) => `Влажность ${p}`,
    wind: (v) => `Ветер ${v}`,
    today: "Сегодня",
    rainChance: (p) => `Вероятность осадков ${p}`,
    dayAria: (d, k, mn, mx, r) => `${d}: ${k}, минимум ${mn}, максимум ${mx}${r ? `, вероятность осадков ${r}` : ""}.`,
    nowAria: (t) => `Сейчас ${t}`,
    noWeather: "Данные о погоде сейчас недоступны.",
    aqiCat: {
      good: "Хорошее",
      moderate: "Умеренное",
      sensitive: "Вредно для чувствительных групп",
      unhealthy: "Вредное",
      very_unhealthy: "Очень вредное",
      hazardous: "Опасное",
    },
    advice: [
      "Воздух чистый. Хорошее время для прогулки.",
      "Воздух приемлемый. Очень чувствительным людям лучше не задерживаться на улице.",
      "Детям, пожилым и чувствительным людям стоит ограничить долгие нагрузки на улице.",
      "Воздух вредный. Советую закрыть окна и реже выходить на улицу.",
      "Воздух очень вредный. Лучше оставаться дома с закрытыми окнами.",
      "Воздух опасен. Пожалуйста, оставайтесь дома и избегайте любой активности на улице.",
    ],
    aqiAria: (a, c, s) => `Качество воздуха: ${c.toLowerCase()}, ${a} по шкале ${s}.`,
    mainPollutant: (p) => `Основной загрязнитель: ${p}`,
    higherBetter: "чем выше, тем лучше",
    scaleUs: "AQI США",
    scaleUniversal: "Универсальный AQI",
    noAir: "Данные о качестве воздуха здесь недоступны.",
    traffic: {
      light: "Дороги свободны",
      moderate: "Умеренные пробки",
      heavy: "Сильные пробки",
    },
    delay: (n) => `+${n} мин`,
    noDelay: "Свободно, без задержек",
    measured: (t) => `Измерено по маршруту: ${t}`,
    ratio: (p) => `Поездка занимает ${p}% обычного времени`,
    trafficMap: "Открыть карту пробок",
    noTraffic: "Данные о пробках здесь недоступны.",
    walk: (d, m) => `${d}, ${m} мин пешком`,
    arrivals: "Ближайшие отправления",
    now: "Сейчас",
    inMin: (n) => `${n} мин`,
    live: "Онлайн",
    scheduled: "По расписанию",
    delayed: (n) => `Задержка ${n} мин`,
    last: "Последний",
    lineAria: (r) => `Маршрут ${r}`,
    towardsStop: (h) => `до ${h}`,
    noLive: (m) => `Здесь нет данных о прибытии в реальном времени. До ближайшей остановки ${m} мин пешком.`,
    noStops: "Поблизости нет остановок. Скажите, куда вы едете, и я проложу маршрут.",
    planRoute: "Проложить маршрут",
    planPrompt: "Пожалуйста, проложи мне маршрут.",
    askBus: "Спросить о следующем автобусе",
    busPrompt: (s) => `Когда следующий автобус от остановки «${s}»?`,
    openMaps: "Открыть в Google Картах",
    newTab: "(откроется в новой вкладке)",
    u: { m: "м", km: "км", ft: "фт", mi: "миль", kmh: "км/ч", mph: "миль/ч" },
    loc: {
      device: "Точное местоположение с этого устройства.",
      network: "Примерное местоположение по данным сети.",
      none: "Местоположение выключено.",
      use: "Использовать точное местоположение",
      waiting: "Ожидаю местоположение этого устройства.",
    },
    footer: (w, a, t) => `Погода: ${w}. Воздух: ${a}. Обновлено в ${t}.`,
    na: "нет данных",
    loading: "Собираю свежие данные.",
  },
  de: {
    nav: {
      sky: "Wetter",
      air: "Luft",
      road: "Verkehr",
      transit: "Haltestellen",
    },
    navLabel: "Zu einem Abschnitt springen",
    heads: {
      sky: "Wetter jetzt",
      forecast: "3-Tage-Vorhersage",
      air: "Luftqualität",
      road: "Verkehr",
      transit: "Haltestellen in der Nähe",
    },
    kinds: {
      clear: "Klar",
      partly: "Teilweise bewölkt",
      cloudy: "Bewölkt",
      fog: "Nebel",
      drizzle: "Nieselregen",
      rain: "Regen",
      storm: "Gewitter",
      snow: "Schnee",
      sleet: "Schneeregen",
      hail: "Hagel",
    },
    feels: (t) => `Gefühlt ${t}`,
    humidity: (p) => `Luftfeuchte ${p}`,
    wind: (v) => `Wind ${v}`,
    today: "Heute",
    rainChance: (p) => `Niederschlagswahrscheinlichkeit ${p}`,
    dayAria: (d, k, mn, mx, r) => `${d}: ${k}, Tiefstwert ${mn}, Höchstwert ${mx}${r ? `, Niederschlagswahrscheinlichkeit ${r}` : ""}.`,
    nowAria: (t) => `Jetzt ${t}`,
    noWeather: "Wetterdaten sind gerade nicht verfügbar.",
    aqiCat: {
      good: "Gut",
      moderate: "Mäßig",
      sensitive: "Ungesund für empfindliche Gruppen",
      unhealthy: "Ungesund",
      very_unhealthy: "Sehr ungesund",
      hazardous: "Gefährlich",
    },
    advice: [
      "Die Luft ist sauber. Eine gute Zeit für einen Spaziergang.",
      "Die Luft ist annehmbar. Sehr empfindliche Menschen sollten es draußen ruhig angehen.",
      "Kinder, ältere und empfindliche Menschen sollten lange Anstrengung im Freien meiden.",
      "Die Luft ist ungesund. Ich empfehle, die Fenster zu schließen und weniger draußen zu sein.",
      "Die Luft ist sehr ungesund. Bleiben Sie am besten drinnen, bei geschlossenen Fenstern.",
      "Die Luft ist gefährlich. Bitte bleiben Sie drinnen und meiden Sie jede Aktivität im Freien.",
    ],
    aqiAria: (a, c, s) => `Luftqualität ${c.toLowerCase()}, ${a} auf der ${s}-Skala.`,
    mainPollutant: (p) => `Hauptschadstoff: ${p}`,
    higherBetter: "höher ist besser",
    scaleUs: "US-AQI",
    scaleUniversal: "Universeller AQI",
    noAir: "Luftqualitätsdaten sind hier nicht verfügbar.",
    traffic: {
      light: "Freie Fahrt",
      moderate: "Mäßiger Verkehr",
      heavy: "Starker Verkehr",
    },
    delay: (n) => `+${n} Min.`,
    noDelay: "Frei, keine Verzögerung",
    measured: (t) => `Gemessene Strecke: ${t}`,
    ratio: (p) => `Die Fahrt dauert ${p} % der üblichen Zeit`,
    trafficMap: "Live-Verkehrskarte öffnen",
    noTraffic: "Verkehrsdaten sind hier nicht verfügbar.",
    walk: (d, m) => `${d}, ${m} Min. zu Fuß`,
    arrivals: "Nächste Abfahrten",
    now: "Jetzt",
    inMin: (n) => `${n} Min.`,
    live: "Live",
    scheduled: "Fahrplan",
    delayed: (n) => `${n} Min. Verspätung`,
    last: "Letzte",
    lineAria: (r) => `Linie ${r}`,
    towardsStop: (h) => `nach ${h}`,
    noLive: (m) => `Echtzeitdaten gibt es hier nicht. Die nächste Haltestelle ist ${m} Minuten zu Fuß entfernt.`,
    noStops: "Keine Haltestellen in der Nähe. Sagen Sie mir Ihr Ziel, dann plane ich eine Route.",
    planRoute: "Route planen",
    planPrompt: "Bitte plane mir eine Route.",
    askBus: "Nach dem nächsten Bus fragen",
    busPrompt: (s) => `Wann fährt der nächste Bus ab der Haltestelle ${s}?`,
    openMaps: "In Google Maps öffnen",
    newTab: "(öffnet in neuem Tab)",
    u: { m: "m", km: "km", ft: "ft", mi: "mi", kmh: "km/h", mph: "mph" },
    loc: {
      device: "Genauer Standort von diesem Gerät.",
      network: "Ungefährer Standort, anhand Ihres Netzwerks.",
      none: "Der Standort ist aus.",
      use: "Meinen genauen Standort verwenden",
      waiting: "Warte auf den Standort dieses Geräts.",
    },
    footer: (w, a, t) => `Wetter: ${w}. Luft: ${a}. Aktualisiert ${t}.`,
    na: "nicht verfügbar",
    loading: "Ich hole die neuesten Daten.",
  },
};

/* ------------------------------------------------------------------ helpers */

const KIND_ICON: Record<SkyKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
  snow: CloudSnow,
  sleet: CloudHail,
  hail: CloudHail,
};
const NIGHT_ICON: Partial<Record<SkyKind, LucideIcon>> = {
  clear: Moon,
  partly: CloudMoon,
};
function KindIcon({ kind, isDay = true, className }: { kind: SkyKind; isDay?: boolean; className?: string }) {
  return createElement((!isDay && NIGHT_ICON[kind]) || KIND_ICON[kind] || Cloud, { "aria-hidden": true, className });
}
const AQI_ICON: readonly LucideIcon[] = [Leaf, Wind, TriangleAlert, ShieldAlert, ShieldAlert, OctagonAlert];
const TRAFFIC_ICON: Record<TrafficLevel, LucideIcon> = {
  light: CarFront,
  moderate: Gauge,
  heavy: TrafficCone,
};

function intlTag(lang: Lang): string {
  return lang === "zh" ? "zh-Hans" : lang;
}
/** Display minus is U+2212, never a hyphen. */
function signed(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `−${Math.abs(r)}` : String(r === 0 ? 0 : r);
}
function temp(c: number, units: LiveUnits): string {
  return `${signed(units === "imperial" ? (c * 9) / 5 + 32 : c)}°`;
}
function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function fmtNum(n: number, lang: Lang, digits = 0): string {
  try {
    return new Intl.NumberFormat(intlTag(lang), {
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return n.toFixed(digits);
  }
}
function distance(m: number, units: LiveUnits, c: Copy, lang: Lang): string {
  if (units === "imperial") {
    const ft = m * 3.28084;
    return ft < 1000 ? `${fmtNum(Math.round(ft / 10) * 10, lang)} ${c.u.ft}` : `${fmtNum(ft / 5280, lang, 1)} ${c.u.mi}`;
  }
  return m < 1000 ? `${fmtNum(Math.round(m / 10) * 10, lang)} ${c.u.m}` : `${fmtNum(m / 1000, lang, 1)} ${c.u.km}`;
}
function speed(kph: number, units: LiveUnits, c: Copy, lang: Lang): string {
  return units === "imperial" ? `${fmtNum(kph * 0.621371, lang)} ${c.u.mph}` : `${fmtNum(kph, lang)} ${c.u.kmh}`;
}
function clock(d: Date, lang: Lang, tz: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(intlTag(lang), tz ? { ...opts, timeZone: tz } : opts).format(d);
  } catch {
    return new Intl.DateTimeFormat(intlTag(lang), opts).format(d);
  }
}
function isoDay(d: Date, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz ?? undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
function weekday(date: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(intlTag(lang), {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}
function pollutantName(p: string): string {
  const k = p.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (k === "pm25") return "PM2.5";
  if (k === "pm10") return "PM10";
  return p.toUpperCase();
}
/** One sentence, no pictographs: provider advice is shown as plain text only. */
function oneSentence(s: string): string {
  const clean = s.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "").trim();
  const m = clean.match(/^.+?(?:[.!?](?=\s|$)|[\u3002\uFF01\uFF1F])/u);
  return (m ? m[0] : clean).replace(/!/g, ".").replace(/\uFF01/g, "\u3002");
}
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Agency colour fill with a text colour that keeps at least 4.5:1. */
function badgeColors(bg?: string | null, fg?: string | null): { background: string; color: string } | undefined {
  const lb = bg ? luminance(bg) : null;
  if (lb === null || !bg) return undefined;
  const background = bg.startsWith("#") ? bg : `#${bg}`;
  const lf = fg ? luminance(fg) : null;
  if (fg && lf !== null && contrast(lb, lf) >= 4.5) return { background, color: fg.startsWith("#") ? fg : `#${fg}` };
  const dark = luminance("#0B1220") as number;
  const light = luminance("#F2F6FC") as number;
  return {
    background,
    color: contrast(lb, dark) >= contrast(lb, light) ? "#0B1220" : "#F2F6FC",
  };
}
function safeHttps(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/* ------------------------------------------------------------------ small hooks */

function useCalm(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-calm"],
      });
      return () => mo.disconnect();
    },
    () => document.documentElement.dataset.calm === "true",
    () => false,
  );
}

const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);
/** Only an explicit region counts: a bare "en" would maximize to "en-US" and wrongly give
 * Fahrenheit to English speakers everywhere else in the world. */
function detectUnits(): LiveUnits {
  try {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      if (!tag) continue;
      const region = new Intl.Locale(tag).region;
      if (region) return IMPERIAL_REGIONS.has(region.toUpperCase()) ? "imperial" : "metric";
    }
  } catch {
    /* fall through */
  }
  return "metric";
}
function useLocaleUnits(): LiveUnits {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("languagechange", cb);
      return () => window.removeEventListener("languagechange", cb);
    },
    detectUnits,
    () => "metric",
  );
}

/** Whole minutes since the epoch, ticking once a minute (stable between ticks). */
function useNowMinute(): number {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, 30_000);
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000),
    () => Math.floor(Date.now() / 60_000),
  );
}

/* ------------------------------------------------------------------ component */

export function LivePanel({ data, lang, locationShared, onShareLocation, onAsk, section, units: unitsProp }: LivePanelProps) {
  const c = T[lang] ?? T.en;
  const localeUnits = useLocaleUnits();
  const units = unitsProp ?? localeUnits;
  const prefersReduced = useReducedMotion() ?? false;
  const calm = useCalm();
  const reduced = prefersReduced || calm;
  const nowMin = useNowMinute();
  const uid = useId();
  const idOf = (s: LiveSection) => `${uid}-live-${s}`;
  const [active, setActive] = useState<LiveSection>(section ?? "sky");
  const refs = useRef<Partial<Record<LiveSection, HTMLHeadingElement | null>>>({});
  const registerHeading = useCallback((s: LiveSection, el: HTMLHeadingElement | null) => {
    refs.current[s] = el;
  }, []);

  // The sticky section bar wraps to two rows on phones and at large text sizes, so its real
  // height (not a guess) sets how far below it a heading lands after a jump.
  const navRef = useRef<HTMLElement | null>(null);
  const [navH, setNavH] = useState(72);
  const hasData = data !== null;
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setNavH(Math.ceil(el.getBoundingClientRect().height) + 8);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  const jump = (s: LiveSection, focus = true) => {
    setActive(s);
    const el = refs.current[s];
    if (!el) return;
    el.scrollIntoView({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
    if (focus) el.focus({ preventScroll: true });
  };

  // Opened from a tile: scroll to that section and move focus to its heading. The request
  // waits until the sections exist (data may still be loading), and is deferred one frame
  // so it runs after the sheet has focused itself.
  const pending = useRef<LiveSection | null>(section ?? null);
  const [prevSection, setPrevSection] = useState(section);
  if (section !== prevSection) {
    setPrevSection(section);
    if (section) setActive(section);
  }
  useEffect(() => {
    pending.current = section ?? null;
  }, [section]);
  useEffect(() => {
    if (!hasData || !pending.current) return;
    const id = requestAnimationFrame(() => {
      const s = pending.current;
      const el = s ? refs.current[s] : null;
      if (!s || !el) return;
      pending.current = null;
      setActive(s);
      el.scrollIntoView({ block: "start", behavior: "auto" });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [section, hasData]);

  // Keep the segmented control in step with scrolling (sections mount once data arrives).
  // The observer only reports sections whose visibility changed, so remember all of them and
  // pick the first visible one in reading order.
  useEffect(() => {
    if (!hasData || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<LiveSection, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = e.target.getAttribute("data-live-section") as LiveSection | null;
          if (s) visible.set(s, e.isIntersecting);
        }
        const first = SECTIONS.find((s) => visible.get(s));
        if (first) setActive(first);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = refs.current[s]?.closest("section");
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [hasData]);

  const precise = data?.locatedBy === "device";

  return (
    <div lang={intlTag(lang)} className="flex flex-col gap-4 pb-2 text-body text-ink">
      <LocationRow c={c} data={data} precise={precise} locationShared={locationShared} onShareLocation={onShareLocation} />

      {data === null ? (
        <p aria-busy="true" className={`${CARD} text-ink-muted`}>
          {c.loading}
        </p>
      ) : (
        <>
          <nav ref={navRef} aria-label={c.navLabel} className="sticky top-0 z-10 -mx-1 bg-panel px-1 py-2">
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
              {SECTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={active === s ? "true" : undefined}
                    aria-controls={idOf(s)}
                    onClick={() => jump(s)}
                    className={`press min-h-12 w-full rounded-md border px-3 text-body font-medium [overflow-wrap:anywhere] ${
                      active === s ? "border-accent bg-panel-3 text-ink" : "border-line bg-panel-2 text-ink-muted hover:text-ink"
                    }`}
                  >
                    {c.nav[s]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <SectionShell id={idOf("sky")} s="sky" title={c.heads.sky} offset={navH} onHeading={registerHeading}>
            <SkySection data={data} c={c} lang={lang} units={units} nowMin={nowMin} />
          </SectionShell>
          <SectionShell id={idOf("air")} s="air" title={c.heads.air} offset={navH} onHeading={registerHeading}>
            <AirSection air={data.air} c={c} lang={lang} reduced={reduced} />
          </SectionShell>
          <SectionShell id={idOf("road")} s="road" title={c.heads.road} offset={navH} onHeading={registerHeading}>
            <RoadSection traffic={data.traffic} coords={data.coords} place={data.place} c={c} />
          </SectionShell>
          <SectionShell id={idOf("transit")} s="transit" title={c.heads.transit} offset={navH} onHeading={registerHeading}>
            <TransitSection
              stops={data.stops}
              c={c}
              lang={lang}
              units={units}
              tz={data.timeZone}
              updatedAt={data.updatedAt}
              nowMin={nowMin}
              reduced={reduced}
              onAsk={onAsk}
            />
          </SectionShell>

          <Footer data={data} c={c} lang={lang} />
        </>
      )}
    </div>
  );
}

function SectionShell({
  id,
  s,
  title,
  offset,
  onHeading,
  children,
}: {
  id: string;
  s: LiveSection;
  title: string;
  /** Height of the sticky section bar, so a jumped-to heading is never hidden under it. */
  offset: number;
  onHeading: (s: LiveSection, el: HTMLHeadingElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-live-section={s} aria-labelledby={`${id}-h`}>
      <h3
        id={`${id}-h`}
        tabIndex={-1}
        ref={(el) => onHeading(s, el)}
        style={{ scrollMarginTop: offset }}
        className="mb-3 text-lead font-semibold text-ink [text-wrap:balance] focus:outline-none focus-visible:outline-3 focus-visible:outline-accent"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ location */

function LocationRow({
  c,
  data,
  precise,
  locationShared,
  onShareLocation,
}: {
  c: Copy;
  data: Ambient | null;
  precise: boolean;
  locationShared: boolean;
  onShareLocation: () => void;
}) {
  // Never say "off" and "waiting" at once: once the user has shared, we are waiting.
  const note = precise ? c.loc.device : data?.locatedBy === "network" ? c.loc.network : !locationShared ? c.loc.none : null;
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <MapPin aria-hidden className={`mt-0.5 size-6 shrink-0 ${precise ? "text-success" : "text-ink-muted"}`} />
        <div className="min-w-0">
          {data?.place && <p className="text-body font-semibold text-ink [overflow-wrap:anywhere]">{data.place}</p>}
          {note && <p className="text-small text-ink-muted">{note}</p>}
          {!precise && locationShared && <p className="text-small text-ink-muted">{c.loc.waiting}</p>}
        </div>
      </div>
      {!precise && (
        <button type="button" onClick={onShareLocation} className={`${BTN} self-start`}>
          <LocateFixed aria-hidden className="size-5 shrink-0 text-accent" />
          {c.loc.use}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sky */

function SkySection({ data, c, lang, units, nowMin }: { data: Ambient; c: Copy; lang: Lang; units: LiveUnits; nowMin: number }) {
  const w = data.weather;
  if (!w || !isNum(w.tempC)) return <p className={`${CARD} text-ink-muted`}>{c.noWeather}</p>;
  const kind = data.sky.kind;
  const word = c.kinds[kind] ?? "";
  const days = (Array.isArray(w.days) ? w.days : []).filter((d) => d && isNum(d.minC) && isNum(d.maxC)).slice(0, 3);
  const extras: { icon: LucideIcon; text: string }[] = [];
  if (isNum(w.feelsC)) extras.push({ icon: Thermometer, text: c.feels(temp(w.feelsC, units)) });
  if (isNum(w.humidity))
    extras.push({
      icon: Droplets,
      text: c.humidity(`${Math.round(clamp(w.humidity, 0, 100))}%`),
    });
  if (isNum(data.sky.windKph))
    extras.push({
      icon: Wind,
      text: c.wind(speed(Math.max(0, data.sky.windKph), units, c, lang)),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <p className={`text-hero leading-none text-ink ${NUM}`}>
            {temp(w.tempC, units)}
            <span className="sr-only">{units === "imperial" ? "F" : "C"}</span>
          </p>
          <p className="flex items-center gap-2 pb-2 text-lead font-medium text-ink">
            <KindIcon kind={kind} isDay={data.sky.isDay} className="size-8 shrink-0" />
            {word}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body text-ink-muted">
          {extras.map(({ icon: I, text }) => (
            <li key={text} className="flex items-center gap-2">
              <I aria-hidden className="size-5 shrink-0" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      {days.length > 0 && (
        <div>
          <h4 className="mb-2 text-body font-semibold text-ink-muted">{c.heads.forecast}</h4>
          <RangeBars days={days} c={c} lang={lang} units={units} tz={data.timeZone} nowC={w.tempC} nowMin={nowMin} />
        </div>
      )}
    </div>
  );
}

/**
 * The weather result card in the conversation (spec 10.2): the 64px temperature, the condition
 * and the 3-day range bars, in the person's language and units.
 */
export function WeatherCardBody({
  place,
  tempC,
  feelsC,
  kind,
  days: rawDays,
  lang,
}: {
  place: string;
  tempC: number;
  feelsC: number | null;
  kind: SkyKind;
  days: { date: string; minC: number; maxC: number; kind: SkyKind; precipChance: number | null }[];
  lang: Lang;
}) {
  const c = T[lang] ?? T.en;
  const units = useLocaleUnits();
  const nowMin = useNowMinute();
  if (!isNum(tempC)) return null;
  const k: SkyKind = c.kinds[kind] ? kind : "cloudy";
  const days: AmbientDay[] = (Array.isArray(rawDays) ? rawDays : [])
    .filter((d) => d && isNum(d.minC) && isNum(d.maxC) && typeof d.date === "string")
    .slice(0, 3)
    .map((d) => ({ date: d.date, minC: d.minC, maxC: d.maxC, kind: c.kinds[d.kind] ? d.kind : "cloudy", precipChance: isNum(d.precipChance) ? d.precipChance : null, text: "" }));
  return (
    <div className="panel flex flex-col gap-3 rounded-lg p-5">
      <p className="text-label tracking-[0.08em] text-ink-faint uppercase [overflow-wrap:anywhere]">{place}</p>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <p className={`text-[4rem] leading-none text-ink ${NUM}`}>
          {temp(tempC, units)}
          <span className="sr-only">{units === "imperial" ? "F" : "C"}</span>
        </p>
        <div className="flex flex-col gap-1 pb-1">
          <p className="flex items-center gap-2 text-lead font-medium text-ink">
            <KindIcon kind={k} className="size-7 shrink-0" />
            {c.kinds[k]}
          </p>
          {isNum(feelsC) && <p className="text-body text-ink-muted">{c.feels(temp(feelsC, units))}</p>}
        </div>
      </div>
      {days.length > 0 && <RangeBars days={days} c={c} lang={lang} units={units} tz={null} nowC={tempC} nowMin={nowMin} />}
    </div>
  );
}

/**
 * The 3-day range bars on their own, for the desktop left rail (spec 7.5). Renders nothing
 * without a forecast.
 */
export function ForecastMini({ data, lang, units: unitsProp }: { data: Ambient | null; lang: Lang; units?: LiveUnits }) {
  const c = T[lang] ?? T.en;
  const localeUnits = useLocaleUnits();
  const units = unitsProp ?? localeUnits;
  const nowMin = useNowMinute();
  const w = data?.weather;
  if (!data || !w || !isNum(w.tempC)) return null;
  const days = (Array.isArray(w.days) ? w.days : []).filter((d) => d && isNum(d.minC) && isNum(d.maxC)).slice(0, 3);
  if (!days.length) return null;
  return (
    <section aria-label={c.heads.forecast} lang={lang === "zh" ? "zh-Hans" : lang}>
      <h2 className="mb-2 text-label tracking-[0.08em] text-ink-faint uppercase">{c.heads.forecast}</h2>
      <RangeBars days={days} c={c} lang={lang} units={units} tz={data.timeZone} nowC={w.tempC} nowMin={nowMin} />
    </section>
  );
}

function RangeBars({
  days,
  c,
  lang,
  units,
  tz,
  nowC,
  nowMin,
}: {
  days: AmbientDay[];
  c: Copy;
  lang: Lang;
  units: LiveUnits;
  tz: string | null;
  nowC: number;
  nowMin: number;
}) {
  const todayIso = isoDay(new Date(nowMin * 60_000), tz);
  const todayIdx = days.findIndex((d) => d.date === todayIso);
  const lo = Math.min(...days.map((d) => Math.min(d.minC, d.maxC)), todayIdx >= 0 ? nowC : Infinity);
  const hi = Math.max(...days.map((d) => Math.max(d.minC, d.maxC)), todayIdx >= 0 ? nowC : -Infinity);
  const span = Math.max(1, hi - lo);
  const pos = (v: number) => clamp(((v - lo) / span) * 100, 0, 100);

  return (
    <ul className={`${CARD} flex flex-col divide-y divide-line py-1`}>
      {days.map((d, i) => {
        const name = i === todayIdx ? c.today : weekday(String(d.date), lang);
        const rain = d.precipChance != null && d.precipChance >= 20 ? `${Math.round(d.precipChance)}%` : null;
        // A minimum visible width, kept inside the track even at the warm end.
        const width = Math.max(4, pos(Math.max(d.minC, d.maxC)) - pos(Math.min(d.minC, d.maxC)));
        const left = Math.min(pos(Math.min(d.minC, d.maxC)), 100 - width);
        // The fill shows its slice of one shared cold-to-warm gradient across the whole scale.
        const fill: React.CSSProperties = {
          left: `${left}%`,
          width: `${width}%`,
          backgroundImage: "linear-gradient(90deg, #8FB2FF, #F5C26B)",
          backgroundSize: `${(100 / width) * 100}% 100%`,
          backgroundPosition: width >= 100 ? "0 0" : `${(left / (100 - width)) * 100}% 0`,
        };
        const minT = temp(d.minC, units);
        const maxT = temp(d.maxC, units);
        return (
          <li key={`${d.date}-${i}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="sr-only">{c.dayAria(name, c.kinds[d.kind], minT, maxT, rain)}</span>
            <div aria-hidden className="flex min-w-[9.5rem] flex-1 items-center gap-3">
              <span className="min-w-[4.5rem] font-medium text-ink">{name}</span>
              <KindIcon kind={d.kind} className="size-6 shrink-0 text-ink" />
              {rain && (
                <span className="flex items-center gap-1 text-ink-muted">
                  <Droplets className="size-4 shrink-0" />
                  <span className="tabular-nums">{rain}</span>
                </span>
              )}
            </div>
            <div aria-hidden className="flex min-w-[12rem] flex-[2] items-center gap-3">
              <span className={`w-[3.2rem] text-right text-ink-muted ${NUM}`}>{minT}</span>
              <span className="relative h-2.5 flex-1 rounded-full bg-panel-3">
                <span className="absolute inset-y-0 rounded-full" style={fill} />
                {i === todayIdx && (
                  <span
                    title={c.nowAria(temp(nowC, units))}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-panel-2"
                    style={{ left: `${pos(nowC)}%` }}
                  />
                )}
              </span>
              <span className={`w-[3.2rem] text-ink ${NUM}`}>{maxT}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ air */

function severityIndex(cat: AqiCategory): number {
  const i = AQI_CATS.indexOf(cat);
  return i < 0 ? 0 : i;
}
/** Marker position along the 6-segment meter, 0..100. US AQI follows the EPA breakpoints; other
 * indexes (UAQI, local ones) do not share them, so the marker sits mid-band. */
function aqiPercent(aqi: number, sev: number, us: boolean): number {
  if (!us) return ((sev + 0.5) / 6) * 100;
  const v = clamp(aqi, 0, 500);
  let i = AQI_BREAKS.findIndex((b, k) => k > 0 && v <= b) - 1;
  if (i < 0) i = 5;
  const lo = AQI_BREAKS[i];
  const hi = AQI_BREAKS[i + 1];
  return ((i + (v - lo) / (hi - lo)) / 6) * 100;
}

/** Spec 8 / 9 AqiMeter: full width, six 12px segments with a 3px gap, a 14px ring marker that
 * moves by transform only (one full-width layer translated by a percentage of itself). */
function AqiMeter({
  aqi,
  sev,
  us,
  name,
  label,
  reduced,
}: {
  aqi: number;
  sev: number;
  us: boolean;
  /** Short accessible name ("Air quality"); the sentence is the value text. */
  name: string;
  label: string;
  reduced: boolean;
}) {
  const value = Math.round(aqi);
  const pct = aqiPercent(aqi, sev, us);
  return (
    <div
      role="meter"
      aria-label={name}
      aria-valuenow={clamp(value, 0, 500)}
      aria-valuemin={0}
      aria-valuemax={500}
      aria-valuetext={label}
      className="relative w-full py-1"
    >
      <div aria-hidden className="flex w-full gap-[3px]">
        {AQI_FALLBACK.map((fb, i) => (
          <span
            key={fb}
            className="h-3 flex-1 rounded-sm"
            style={{
              background: `var(--color-aqi-${i + 1}, ${fb})`,
              opacity: i === sev ? 1 : 0.25,
            }}
          />
        ))}
      </div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ x: `${pct}%` }}
        transition={reduced ? { duration: 0 } : SPRING}
      >
        <span
          className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            background: "var(--color-panel, #0B1220)",
            borderColor: "var(--color-ink, #F2F6FC)",
          }}
        />
      </motion.div>
    </div>
  );
}

function AirSection({ air, c, lang, reduced }: { air: AmbientAir | null; c: Copy; lang: Lang; reduced: boolean }) {
  if (!air || !isNum(air.aqi)) return <p className={`${CARD} text-ink-muted`}>{c.noAir}</p>;
  const extra = air as AmbientAir & {
    scale?: string | null;
    advice?: string | null;
  };
  const rawScale = typeof extra.scale === "string" ? extra.scale.trim().slice(0, 24) : "";
  const us = !rawScale || /^us[\s_-]*aqi$/i.test(rawScale);
  // An unknown category from the wire falls back to the EPA band of the number.
  const category: AqiCategory = AQI_CATS.includes(air.category) ? air.category : aqiCategory(Math.max(0, air.aqi));
  const sev = severityIndex(category);
  const cat = c.aqiCat[category];
  const uaqi = /^(uaqi|universal[\s_-]*aqi)$/i.test(rawScale);
  const scaleName = us ? c.scaleUs : uaqi ? c.scaleUniversal : rawScale.replace(/_/g, " ");
  const scale = uaqi ? `${scaleName}, ${c.higherBetter}` : scaleName;
  const Icon = AQI_ICON[sev];
  const provided = typeof extra.advice === "string" ? oneSentence(extra.advice) : "";
  const advice = provided.length > 1 ? provided : c.advice[sev];
  const pm: { label: string; value: number | null }[] = [
    { label: "PM2.5", value: isNum(air.pm25) ? Math.max(0, air.pm25) : null },
    { label: "PM10", value: isNum(air.pm10) ? Math.max(0, air.pm10) : null },
  ];
  const dominant = typeof air.dominant === "string" && air.dominant.trim() ? pollutantName(air.dominant.trim()) : null;
  const domValue = dominant ? pm.find((p) => p.label === dominant)?.value : null;

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div aria-hidden className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className={`text-value leading-none text-ink ${NUM}`}>{Math.round(air.aqi)}</span>
        <span className="flex items-center gap-2 pb-0.5 text-lead font-semibold text-ink [overflow-wrap:anywhere]">
          <Icon className="size-7 shrink-0" />
          {cat}
        </span>
        <span className="pb-1 text-small text-ink-muted">{scale}</span>
      </div>
      <AqiMeter aqi={air.aqi} sev={sev} us={us} name={c.heads.air} label={c.aqiAria(Math.round(air.aqi), cat, scaleName)} reduced={reduced} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-[10rem] flex-1 flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2">
            {pm.map((p) => (
              <div key={p.label} className="rounded-md border border-line bg-panel-3 px-3 py-2">
                <dt className="text-small text-ink-muted">{p.label}</dt>
                <dd className="text-body text-ink">
                  {p.value == null ? (
                    c.na
                  ) : (
                    <>
                      <span className={NUM}>{fmtNum(p.value, lang)}</span> <span className="text-ink-muted">µg/m³</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {dominant && (
            <p className="text-body text-ink-muted">{c.mainPollutant(domValue != null ? `${dominant} (${fmtNum(domValue, lang)} µg/m³)` : dominant)}</p>
          )}
        </div>
      </div>
      <p className="border-l-2 border-line-strong pl-3 text-reply text-ink [text-wrap:pretty]">{advice}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ road */

const STRIP = [
  {
    color: "var(--color-traffic-free, #5BE3A4)",
    pattern: "solid",
    tall: false,
  },
  { color: "var(--color-traffic-slow, #F5C26B)", pattern: "long", tall: false },
  { color: "var(--color-traffic-jam, #FF8A8A)", pattern: "short", tall: false },
  {
    color: "var(--color-traffic-heavy, #E0457B)",
    pattern: "short",
    tall: true,
  },
] as const;

function TrafficCells({ traffic }: { traffic: AmbientTraffic }) {
  const filled = traffic.level === "light" ? 1 : traffic.level === "moderate" ? 2 : traffic.ratio >= 1.8 ? 4 : 3;
  return (
    <div aria-hidden className="flex items-center gap-1">
      {STRIP.map((cell, i) => {
        const on = i < filled;
        const bg = !on
          ? undefined
          : cell.pattern === "solid"
            ? cell.color
            : cell.pattern === "long"
              ? `repeating-linear-gradient(90deg, ${cell.color} 0 6px, transparent 6px 9px)`
              : `repeating-linear-gradient(90deg, ${cell.color} 0 3px, transparent 3px 6px)`;
        return <span key={i} className={`w-6 rounded-sm ${cell.tall ? "h-3" : "h-2"} ${on ? "" : "bg-panel-3"}`} style={bg ? { background: bg } : undefined} />;
      })}
    </div>
  );
}

function RoadSection({ traffic, coords, place, c }: { traffic: AmbientTraffic | null; coords: Ambient["coords"]; place: string | null; c: Copy }) {
  if (!traffic) return <p className={`${CARD} text-ink-muted`}>{c.noTraffic}</p>;
  const Icon = TRAFFIC_ICON[traffic.level] ?? CarFront;
  const delay = Math.round(traffic.delayMin);
  const okLatLng = (p: { lat: number; lng: number } | null | undefined): p is { lat: number; lng: number } =>
    !!p && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  const dest = traffic.dest;
  // Spec 9: Directions drives to the probe destination. `coords` exists only for a shared device
  // position (IP-derived positions never reach the browser), so otherwise search by place name.
  const mapUrl =
    okLatLng(coords) && okLatLng(dest)
      ? `https://www.google.com/maps/dir/?api=1&origin=${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}&destination=${dest.lat.toFixed(3)},${dest.lng.toFixed(3)}&travelmode=driving`
      : okLatLng(coords)
        ? `https://www.google.com/maps/@?api=1&map_action=map&center=${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}&zoom=13&layer=traffic`
        : place
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
          : null;
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      {delay >= 1 ? (
        <p className={`text-value leading-none text-ink ${NUM}`}>{c.delay(delay)}</p>
      ) : (
        <p className="text-lead font-semibold text-ink">{c.noDelay}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Icon aria-hidden className="size-6 shrink-0 text-ink" />
        <span className="text-body font-medium text-ink">{c.traffic[traffic.level] ?? ""}</span>
        <TrafficCells traffic={traffic} />
      </div>
      <ul className="flex flex-col gap-1 text-body text-ink-muted">
        {typeof traffic.towards === "string" && traffic.towards.trim() && (
          <li className="flex items-start gap-2">
            <Route aria-hidden className="mt-1 size-5 shrink-0" />
            {c.measured(traffic.towards)}
          </li>
        )}
        {Number.isFinite(traffic.ratio) && traffic.ratio > 0 && (
          <li className="flex items-start gap-2">
            <Clock aria-hidden className="mt-1 size-5 shrink-0" />
            {c.ratio(Math.round(traffic.ratio * 100))}
          </li>
        )}
      </ul>
      {mapUrl && (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={`${BTN} self-start`}>
          <CarFront aria-hidden className="size-5 shrink-0 text-accent" />
          {c.trafficMap}
          <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">{c.newTab}</span>
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ transit */

/** Line as sent today, plus the optional fields the data contract may add later. */
interface LineX {
  route: string;
  minutes: number;
  live?: boolean;
  delayMin?: number | null;
  headsign?: string | null;
  color?: string | null;
  textColor?: string | null;
  last?: boolean;
}

function TransitSection({
  stops,
  c,
  lang,
  units,
  tz,
  updatedAt,
  nowMin,
  reduced,
  onAsk,
}: {
  stops: AmbientStop[];
  c: Copy;
  lang: Lang;
  units: LiveUnits;
  tz: string | null;
  updatedAt: string;
  nowMin: number;
  reduced: boolean;
  onAsk: (prompt: string) => void;
}) {
  const list = (Array.isArray(stops) ? stops : [])
    .filter((s) => s && typeof s.name === "string" && s.name.trim())
    .map((s) => ({
      ...s,
      walkMin: isNum(s.walkMin) ? Math.max(0, s.walkMin) : 0,
      distanceM: isNum(s.distanceM) ? Math.max(0, s.distanceM) : 0,
    }))
    .sort((a, b) => a.walkMin - b.walkMin)
    .slice(0, 4);
  if (list.length === 0) {
    return (
      <div className={`${CARD} flex flex-col gap-3`}>
        <p className="text-body text-ink">{c.noStops}</p>
        <button type="button" onClick={() => onAsk(c.planPrompt)} className={`${BTN} self-start`}>
          <Route aria-hidden className="size-5 shrink-0 text-accent" />
          {c.planRoute}
        </button>
      </div>
    );
  }
  // Arrival minutes were measured at updatedAt; count down from there so stale data stays honest.
  const fetchedMin = Math.floor(Date.parse(updatedAt) / 60_000);
  const elapsed = Number.isFinite(fetchedMin) ? Math.max(0, nowMin - fetchedMin) : 0;
  // Departures that already left (after the countdown) are dropped before deciding whether
  // this place has any times at all, so stale data falls back to the honest empty state.
  const rows = list.map((stop) =>
    (Array.isArray(stop.lines) ? (stop.lines as LineX[]) : [])
      .filter((l) => l && isNum(l.minutes) && l.route != null && String(l.route).trim())
      .map((l) => ({
        ...l,
        route: String(l.route).slice(0, 12),
        eta: l.minutes - elapsed,
      }))
      .filter((l) => l.eta > -1)
      .sort((a, b) => a.eta - b.eta)
      .slice(0, 3),
  );
  const anyLines = rows.some((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {!anyLines && <p className="text-body text-ink-muted">{c.noLive(Math.round(list[0].walkMin))}</p>}
      <ul className="flex flex-col gap-3">
        {list.map((stop, i) => {
          const lines = rows[i];
          const maps = safeHttps(stop.mapsUrl);
          return (
            <li key={`${stop.name}-${i}`} className={`${CARD} flex flex-col gap-3`}>
              <div className="flex items-start gap-3">
                <Bus aria-hidden className="mt-0.5 size-6 shrink-0 text-ink" />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink [overflow-wrap:anywhere]">{stop.name}</p>
                  <p className="text-body text-ink-muted">{c.walk(distance(stop.distanceM, units, c, lang), Math.max(1, Math.round(stop.walkMin)))}</p>
                </div>
              </div>

              {lines.length > 0 && (
                <div>
                  <h4 className="sr-only">{c.arrivals}</h4>
                  <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-panel-3/40">
                    {lines.map((l, k) => (
                      <DepartureRow key={`${l.route}-${k}`} line={l} eta={l.eta} c={c} lang={lang} tz={tz} nowMin={nowMin} reduced={reduced} />
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {maps && (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className={BTN}>
                    <Footprints aria-hidden className="size-5 shrink-0 text-accent" />
                    {c.openMaps}
                    <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <span className="sr-only">{c.newTab}</span>
                  </a>
                )}
                <button type="button" onClick={() => onAsk(c.busPrompt(stop.name))} className={BTN}>
                  <MessageCircleQuestion aria-hidden className="size-5 shrink-0 text-accent" />
                  {c.askBus}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DepartureRow({
  line,
  eta,
  c,
  lang,
  tz,
  nowMin,
  reduced,
}: {
  line: LineX;
  eta: number;
  c: Copy;
  lang: Lang;
  tz: string | null;
  nowMin: number;
  reduced: boolean;
}) {
  const mins = Math.round(eta);
  const when = mins < 1 ? c.now : mins > 60 ? clock(new Date((nowMin + mins) * 60_000), lang, tz) : c.inMin(mins);
  const delayed = line.delayMin != null && line.delayMin >= 1 ? Math.round(line.delayMin) : 0;
  const status = delayed
    ? { Icon: TriangleAlert, word: c.delayed(delayed), cls: "text-signal" }
    : line.live
      ? { Icon: Radio, word: c.live, cls: "text-success" }
      : { Icon: Clock, word: c.scheduled, cls: "text-ink-muted" };
  const colors = badgeColors(line.color, line.textColor);

  return (
    <li className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="sr-only">{c.lineAria(line.route)}</span>
        <span
          aria-hidden
          className={`inline-flex h-8 min-w-11 items-center justify-center rounded-sm px-2 text-[1.125rem] font-semibold ${NUM} ${
            colors ? "" : "bg-panel-3 text-ink"
          }`}
          style={colors}
        >
          {line.route}
        </span>
        {line.headsign && <span className="text-small text-ink [overflow-wrap:anywhere]">{c.towardsStop(line.headsign)}</span>}
        {line.last && <span className="rounded-sm border border-signal px-2 text-small font-medium text-signal">{c.last}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <motion.span
          key={when}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          className={`text-eta leading-none text-ink ${NUM}`}
        >
          {when}
        </motion.span>
        <span className={`mt-1 flex items-center gap-1 text-small ${status.cls}`}>
          <status.Icon aria-hidden className="size-4 shrink-0" />
          {status.word}
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ footer */

function Footer({ data, c, lang }: { data: Ambient; c: Copy; lang: Lang }) {
  const name = (s: "google" | "open-meteo" | null) => (s === "google" ? "Google" : s === "open-meteo" ? "Open-Meteo" : c.na);
  const at = new Date(data.updatedAt);
  const time = Number.isNaN(at.getTime()) ? c.na : clock(at, lang, data.timeZone);
  return (
    <footer className="border-t border-line pt-3 text-small text-ink-faint">
      <p>{c.footer(name(data.source.weather), name(data.source.air), time)}</p>
    </footer>
  );
}
