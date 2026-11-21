// Aspire v6 dashboard copy, in the 5 UI languages. No emojis, no arrow glyphs.
// "{n}", "{city}", "{age}", "{host}" and "{credit}" are filled in by fill(); "{n|one:bus|other:buses}"
// picks the word for n by the language's plural rules (fill's `lang`).

import { HTML_LANG, type Lang } from "@/lib/lang";
import type { AqiCategory, SkyKind } from "@/lib/ambient-types";

export interface V6Text {
  overview: string;
  cityMap: string;
  saved: string;
  search: string;
  settings: string;
  mainNav: string;
  scene: string;
  feels: string;
  high: string;
  low: string;
  now: string;
  openMap: string;
  photo: string;
  rainPct: string;
  nextDays: string;
  noWeather: string;
  transit: string;
  air: string;
  sunrise: string;
  traffic: string;
  live: string;
  scheduled: string;
  estimated: string;
  static: string;
  calculated: string;
  none: string;
  loading: string;
  empty: string;
  offline: string;
  offlineNoAge: string;
  denied: string;
  error: string;
  retry: string;
  leaveIn: string;
  leaveNow: string;
  walk: string;
  min: string;
  due: string;
  viewRoutes: string;
  liveBuses: string;
  noTransit: string;
  noDepartures: string;
  stopsOnly: string;
  noTimetable: string;
  myLocation: string;
  vehicles: string;
  busiest: string;
  cameras: string;
  openCameras: string;
  noTraffic: string;
  delay: string;
  load: Record<"low" | "medium" | "high", string>;
  usAqi: string;
  aqi: Record<AqiCategory, string>;
  advice: [good: string, some: string, bad: string];
  noAir: string;
  sunset: string;
  daylight: string;
  longer: string;
  shorter: string;
  same: string;
  noSunrise: string;
  autoScene: string;
  autoWhy: string;
  city: string;
  parking: string;
  fuel: string;
  camCredit: string;
  newTab: string;
  free: string;
  of: string;
  approx: string;
  fuelUnknown: string;
  fuelStatus: Record<"selling" | "sold_out", string>;
  community: string;
  notAnswering: string;
  diesel: string;
  gas: string;
  noCity: string;
  agentRole: string;
  expand: string;
  collapse: string;
  sources: string;
  tagline: string;
  weather: string;
  hourly: string;
  timeUnknown: string;
  noaaFormula: string;
  fuelSelling: string;
  tabMap: string;
  tabSaved: string;
  tabBar: string;
  kinds: Record<SkyKind, string>;
}

export const V6: Record<Lang, V6Text> = {
  en: {
    overview: "Overview", cityMap: "City map", saved: "Saved places", search: "Search cities", settings: "Settings", mainNav: "Main",
    scene: "Weather-synced scene", feels: "Feels like", high: "H", low: "L", now: "Now", openMap: "Open city map", photo: "Photo",
    rainPct: "{n}% rain", nextDays: "Next 3 days", noWeather: "No weather data yet",
    transit: "Nearby transit", air: "Air quality", sunrise: "Tomorrow's sunrise", traffic: "Live traffic",
    live: "Live", scheduled: "Scheduled", estimated: "Estimated", static: "Not live", calculated: "Calculated", none: "No data",
    loading: "Loading", empty: "No data yet", offline: "Offline. Showing data from {age}.", offlineNoAge: "Offline. Showing the last data received.", denied: "Location is off. Search for a city to see it here.",
    error: "Could not load this.", retry: "Retry",
    leaveIn: "Leave in {n} min", leaveNow: "Leave now", walk: "{n} min walk", min: "min", due: "Due", viewRoutes: "View all routes",
    liveBuses: "{n} {n|one:bus|other:buses} live on the map", noTransit: "No transit data for {city}.", noDepartures: "No upcoming departures right now.", stopsOnly: "Stops only in {city}, no departure times.", noTimetable: "No timetable data", myLocation: "Back to my location",
    vehicles: "{n} {n|one:vehicle|other:vehicles} counted", busiest: "Busiest roads", cameras: "Live cameras", openCameras: "Open live cameras",
    noTraffic: "No live traffic data for {city} yet.", delay: "+{n} min vs free flow",
    load: { low: "Light", medium: "Moderate", high: "Heavy" },
    usAqi: "US AQI",
    aqi: { good: "Good", moderate: "Moderate", sensitive: "Unhealthy for sensitive groups", unhealthy: "Unhealthy", very_unhealthy: "Very unhealthy", hazardous: "Hazardous" },
    advice: ["A good day to breathe easy.", "Sensitive people should take it easy outdoors.", "Limit time outdoors and wear a mask."],
    noAir: "No air quality data here yet.",
    sunset: "Sunset", daylight: "Daylight", longer: "+{n} min vs today", shorter: "{n} min shorter than today", same: "Same as today",
    noSunrise: "The sun does not rise or set tomorrow here.", autoScene: "Auto scene", autoWhy: "The photo and weather layers follow the real sky and local time.",
    city: "City live", parking: "Parking", fuel: "Fuel", camCredit: "Live cameras by {credit}", newTab: "Opens {host} in a new tab",
    free: "{n} free", of: "of {n}", approx: "approx.", fuelUnknown: "status unknown",
    fuelStatus: { selling: "selling", sold_out: "sold out" }, community: "drivers' reports", notAnswering: "The city feed is not answering right now.", diesel: "Diesel", gas: "Gas",
    noCity: "No live city data for {city} yet.",
    agentRole: "Your city agent", expand: "Expand", collapse: "Collapse", sources: "Sources",
    tagline: "Your city. In the moment.", weather: "Weather", hourly: "Hourly", timeUnknown: "time unknown", noaaFormula: "NOAA formula", fuelSelling: "on sale at {n}",
    tabMap: "Map", tabSaved: "Saved", tabBar: "Quick tabs",
    kinds: { clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Drizzle", rain: "Rain", storm: "Thunderstorm", snow: "Snow", sleet: "Sleet", hail: "Hail" },
  },
  mn: {
    overview: "Тойм", cityMap: "Хотын газрын зураг", saved: "Хадгалсан газрууд", search: "Хот хайх", settings: "Тохиргоо", mainNav: "Үндсэн цэс",
    scene: "Цаг агаартай уялдсан дүр зураг", feels: "Мэдрэгдэх", high: "Дээд", low: "Доод", now: "Одоо", openMap: "Хотын зураг нээх", photo: "Зураг",
    rainPct: "{n}% бороо", nextDays: "Ирэх 3 хоног", noWeather: "Цаг агаарын мэдээ алга байна",
    transit: "Ойролцоох нийтийн тээвэр", air: "Агаарын чанар", sunrise: "Маргаашийн нар мандах", traffic: "Замын хөдөлгөөн",
    live: "Шууд", scheduled: "Хуваарийн дагуу", estimated: "Ойролцоо тооцоо", static: "Шууд биш", calculated: "Тооцоолсон", none: "Мэдээлэл алга",
    loading: "Ачаалж байна", empty: "Мэдээлэл алга байна", offline: "Сүлжээгүй байна. Мэдээлэл: {age}.", offlineNoAge: "Сүлжээгүй байна. Хамгийн сүүлд ирсэн мэдээллийг харуулж байна.", denied: "Байршил унтраалттай байна. Хотоо хайж олно уу.",
    error: "Ачаалж чадсангүй.", retry: "Дахин оролдох",
    leaveIn: "{n} минутын дараа гарна уу", leaveNow: "Одоо гарна уу", walk: "{n} мин алхана", min: "мин", due: "Ирж байна", viewRoutes: "Бүх чиглэл харах",
    liveBuses: "Зураг дээр {n} автобус шууд харагдаж байна", noTransit: "{city}: нийтийн тээврийн мэдээлэл алга.", noDepartures: "Ойрын хугацаанд хөдлөх тээвэр одоогоор алга.", stopsOnly: "{city}: зөвхөн буудлууд, цагийн хуваарь алга.", noTimetable: "Цагийн хуваарь алга", myLocation: "Миний байршил руу буцах",
    vehicles: "{n} тээврийн хэрэгсэл тоолсон", busiest: "Хамгийн ачаалалтай замууд", cameras: "Шууд камер", openCameras: "Шууд камер нээх",
    noTraffic: "{city}: замын хөдөлгөөний шууд мэдээлэл одоогоор алга.", delay: "Чөлөөтэй үеэс +{n} мин",
    load: { low: "Сул", medium: "Дунд", high: "Их ачаалалтай" },
    usAqi: "AQI (АНУ)",
    aqi: { good: "Сайн", moderate: "Дунд зэрэг", sensitive: "Мэдрэг хүмүүст муу", unhealthy: "Эрүүл мэндэд муу", very_unhealthy: "Маш муу", hazardous: "Аюултай" },
    advice: ["Агаар цэвэр, амьсгалахад таатай өдөр.", "Мэдрэг хүмүүс гадаа удаан байхгүй байх нь зүйтэй.", "Гадаа байх хугацаагаа багасгаж, амны хаалт зүүнэ үү."],
    noAir: "Энд агаарын чанарын мэдээлэл одоогоор алга.",
    sunset: "Нар жаргах", daylight: "Өдрийн урт", longer: "Өнөөдрөөс +{n} мин", shorter: "Өнөөдрөөс {n} мин богино", same: "Өнөөдөртэй адил",
    noSunrise: "Маргааш энд нар мандахгүй, жаргахгүй.", autoScene: "Автомат дүр зураг", autoWhy: "Зураг болон цаг агаарын давхарга бодит тэнгэр, орон нутгийн цагийг дагана.",
    city: "Хотын шууд мэдээ", parking: "Зогсоол", fuel: "Шатахуун", camCredit: "Шууд камер: {credit}", newTab: "{host} хуудсыг шинэ цонхонд нээнэ",
    free: "{n} сул", of: "/ {n}", approx: "ойролцоогоор", fuelUnknown: "төлөв тодорхойгүй",
    fuelStatus: { selling: "зарагдаж байна", sold_out: "дууссан" }, community: "жолооч нарын мэдээллээр", notAnswering: "Хотын мэдээллийн эх сурвалж одоогоор хариу өгөхгүй байна.", diesel: "Дизель", gas: "Хий",
    noCity: "{city}: хотын шууд мэдээлэл одоогоор алга.",
    agentRole: "Таны хотын туслах", expand: "Томруулах", collapse: "Жижигрүүлэх", sources: "Эх сурвалж",
    tagline: "Таны хот. Яг одоо.", weather: "Цаг агаар", hourly: "Цагаар", timeUnknown: "цаг тодорхойгүй", noaaFormula: "NOAA томьёо", fuelSelling: "{n} станцад зарагдаж байна",
    tabMap: "Газрын зураг", tabSaved: "Хадгалсан", tabBar: "Доод цэс",
    kinds: { clear: "Цэлмэг", partly: "Багавтар үүлтэй", cloudy: "Үүлэрхэг", fog: "Манан", drizzle: "Шиврээ бороо", rain: "Бороо", storm: "Аянга цахилгаантай", snow: "Цас", sleet: "Нойтон цас", hail: "Мөндөр" },
  },
  zh: {
    overview: "概览", cityMap: "城市地图", saved: "收藏地点", search: "搜索城市", settings: "设置", mainNav: "主导航",
    scene: "随天气同步的场景", feels: "体感", high: "高", low: "低", now: "现在", openMap: "打开城市地图", photo: "照片",
    rainPct: "降雨 {n}%", nextDays: "未来 3 天", noWeather: "暂无天气数据",
    transit: "附近公交", air: "空气质量", sunrise: "明天日出", traffic: "实时路况",
    live: "实时", scheduled: "按时刻表", estimated: "估算", static: "非实时", calculated: "计算得出", none: "无数据",
    loading: "加载中", empty: "暂无数据", offline: "已离线，显示 {age} 的数据。", offlineNoAge: "已离线，显示最后收到的数据。", denied: "定位已关闭。搜索城市即可在此查看。",
    error: "加载失败。", retry: "重试",
    leaveIn: "{n} 分钟后出发", leaveNow: "现在出发", walk: "步行 {n} 分钟", min: "分钟", due: "即将到站", viewRoutes: "查看全部线路",
    liveBuses: "地图上有 {n} 辆实时公交", noTransit: "{city} 暂无公交数据。", noDepartures: "目前没有即将发出的班次。", stopsOnly: "{city} 仅有站点，没有发车时间。", noTimetable: "无时刻表数据", myLocation: "回到我的位置",
    vehicles: "已统计 {n} 辆车", busiest: "最拥堵的道路", cameras: "实时摄像头", openCameras: "打开实时摄像头",
    noTraffic: "{city} 暂无实时路况数据。", delay: "比畅通时多 {n} 分钟",
    load: { low: "畅通", medium: "缓行", high: "拥堵" },
    usAqi: "美国 AQI",
    aqi: { good: "优", moderate: "良", sensitive: "对敏感人群不健康", unhealthy: "不健康", very_unhealthy: "非常不健康", hazardous: "危险" },
    advice: ["空气清新，适合户外。", "敏感人群请减少户外活动。", "请减少户外时间并佩戴口罩。"],
    noAir: "此处暂无空气质量数据。",
    sunset: "日落", daylight: "白昼", longer: "比今天长 {n} 分钟", shorter: "比今天短 {n} 分钟", same: "与今天相同",
    noSunrise: "明天此地太阳不升也不落。", autoScene: "自动场景", autoWhy: "照片和天气图层跟随真实天空与当地时间。",
    city: "城市实况", parking: "停车", fuel: "加油", camCredit: "实时摄像头来自 {credit}", newTab: "在新标签页打开 {host}",
    free: "空位 {n}", of: "共 {n}", approx: "约", fuelUnknown: "状态未知",
    fuelStatus: { selling: "在售", sold_out: "售罄" }, community: "司机反馈", notAnswering: "城市数据源暂时没有响应。", diesel: "柴油", gas: "燃气",
    noCity: "{city} 暂无城市实时数据。",
    agentRole: "你的城市助手", expand: "展开", collapse: "收起", sources: "来源",
    tagline: "你的城市，此时此刻。", weather: "天气", hourly: "逐小时", timeUnknown: "时间未知", noaaFormula: "NOAA 公式", fuelSelling: "{n} 个站有售",
    tabMap: "地图", tabSaved: "收藏", tabBar: "快捷标签",
    kinds: { clear: "晴", partly: "多云间晴", cloudy: "多云", fog: "雾", drizzle: "毛毛雨", rain: "雨", storm: "雷暴", snow: "雪", sleet: "雨夹雪", hail: "冰雹" },
  },
  ru: {
    overview: "Обзор", cityMap: "Карта города", saved: "Сохранённые места", search: "Поиск городов", settings: "Настройки", mainNav: "Главное меню",
    scene: "Сцена по погоде", feels: "Ощущается как", high: "Макс", low: "Мин", now: "Сейчас", openMap: "Открыть карту города", photo: "Фото",
    rainPct: "дождь {n}%", nextDays: "Следующие 3 дня", noWeather: "Данных о погоде пока нет",
    transit: "Транспорт рядом", air: "Качество воздуха", sunrise: "Восход завтра", traffic: "Пробки сейчас",
    live: "Онлайн", scheduled: "По расписанию", estimated: "Оценка", static: "Не онлайн", calculated: "Расчёт", none: "Нет данных",
    loading: "Загрузка", empty: "Данных пока нет", offline: "Нет сети. Данные получены {age}.", offlineNoAge: "Нет сети. Показаны последние полученные данные.", denied: "Геолокация выключена. Найдите город, чтобы увидеть его здесь.",
    error: "Не удалось загрузить.", retry: "Повторить",
    leaveIn: "Выходите через {n} мин", leaveNow: "Выходите сейчас", walk: "{n} мин пешком", min: "мин", due: "Подходит", viewRoutes: "Все маршруты",
    liveBuses: "{n} {n|one:автобус|few:автобуса|many:автобусов|other:автобуса} онлайн на карте", noTransit: "Нет данных о транспорте: {city}.", noDepartures: "Ближайших отправлений сейчас нет.", stopsOnly: "{city}: только остановки, без времени отправления.", noTimetable: "Нет данных о расписании", myLocation: "Назад к моему местоположению",
    vehicles: "Насчитано машин: {n}", busiest: "Самые загруженные дороги", cameras: "Камеры онлайн", openCameras: "Открыть камеры онлайн",
    noTraffic: "Онлайн-данных о пробках для {city} пока нет.", delay: "+{n} мин к свободной дороге",
    load: { low: "Свободно", medium: "Умеренно", high: "Пробка" },
    usAqi: "AQI (США)",
    aqi: { good: "Хорошее", moderate: "Умеренное", sensitive: "Вредно для чувствительных", unhealthy: "Вредное", very_unhealthy: "Очень вредное", hazardous: "Опасное" },
    advice: ["Хороший день, дышится легко.", "Чувствительным людям лучше меньше бывать на улице.", "Меньше бывайте на улице и наденьте маску."],
    noAir: "Данных о качестве воздуха здесь пока нет.",
    sunset: "Закат", daylight: "Световой день", longer: "+{n} мин к сегодняшнему", shorter: "На {n} мин короче, чем сегодня", same: "Как сегодня",
    noSunrise: "Завтра солнце здесь не восходит и не заходит.", autoScene: "Автосцена", autoWhy: "Фото и слои погоды следуют реальному небу и местному времени.",
    city: "Город онлайн", parking: "Парковки", fuel: "Топливо", camCredit: "Камеры онлайн: {credit}", newTab: "Откроет {host} в новой вкладке",
    free: "свободно {n}", of: "из {n}", approx: "прибл.", fuelUnknown: "статус неизвестен",
    fuelStatus: { selling: "в продаже", sold_out: "нет в наличии" }, community: "по сообщениям водителей", notAnswering: "Городской источник данных сейчас не отвечает.", diesel: "Дизель", gas: "Газ",
    noCity: "Онлайн-данных по городу {city} пока нет.",
    agentRole: "Ваш городской помощник", expand: "Развернуть", collapse: "Свернуть", sources: "Источники",
    tagline: "Ваш город. Прямо сейчас.", weather: "Погода", hourly: "По часам", timeUnknown: "время неизвестно", noaaFormula: "формула NOAA", fuelSelling: "в продаже на АЗС: {n}",
    tabMap: "Карта", tabSaved: "Избранное", tabBar: "Нижнее меню",
    kinds: { clear: "Ясно", partly: "Переменная облачность", cloudy: "Облачно", fog: "Туман", drizzle: "Морось", rain: "Дождь", storm: "Гроза", snow: "Снег", sleet: "Мокрый снег", hail: "Град" },
  },
  de: {
    overview: "Übersicht", cityMap: "Stadtkarte", saved: "Gespeicherte Orte", search: "Städte suchen", settings: "Einstellungen", mainNav: "Hauptmenü",
    scene: "Wettersynchrone Szene", feels: "Gefühlt", high: "H", low: "T", now: "Jetzt", openMap: "Stadtkarte öffnen", photo: "Foto",
    rainPct: "{n} % Regen", nextDays: "Nächste 3 Tage", noWeather: "Noch keine Wetterdaten",
    transit: "Nahverkehr in der Nähe", air: "Luftqualität", sunrise: "Sonnenaufgang morgen", traffic: "Verkehr live",
    live: "Live", scheduled: "Fahrplan", estimated: "Geschätzt", static: "Nicht live", calculated: "Berechnet", none: "Keine Daten",
    loading: "Lädt", empty: "Noch keine Daten", offline: "Offline. Stand: {age}.", offlineNoAge: "Offline. Die zuletzt empfangenen Daten werden gezeigt.", denied: "Standort ist aus. Suche eine Stadt, um sie hier zu sehen.",
    error: "Konnte nicht geladen werden.", retry: "Erneut versuchen",
    leaveIn: "In {n} Min. losgehen", leaveNow: "Jetzt losgehen", walk: "{n} Min. zu Fuß", min: "Min.", due: "Kommt", viewRoutes: "Alle Linien",
    liveBuses: "{n} {n|one:Bus|other:Busse} live auf der Karte", noTransit: "Keine Nahverkehrsdaten für {city}.", noDepartures: "Gerade keine anstehenden Abfahrten.", stopsOnly: "{city}: nur Haltestellen, keine Abfahrtszeiten.", noTimetable: "Keine Fahrplandaten", myLocation: "Zurück zu meinem Standort",
    vehicles: "{n} {n|one:Fahrzeug|other:Fahrzeuge} gezählt", busiest: "Vollste Straßen", cameras: "Live-Kameras", openCameras: "Live-Kameras öffnen",
    noTraffic: "Noch keine Live-Verkehrsdaten für {city}.", delay: "+{n} Min. gegenüber freier Fahrt",
    load: { low: "Frei", medium: "Mäßig", high: "Stau" },
    usAqi: "US-AQI",
    aqi: { good: "Gut", moderate: "Mäßig", sensitive: "Ungesund für Empfindliche", unhealthy: "Ungesund", very_unhealthy: "Sehr ungesund", hazardous: "Gefährlich" },
    advice: ["Ein guter Tag zum Durchatmen.", "Empfindliche Menschen sollten es draußen ruhig angehen.", "Möglichst wenig draußen sein und Maske tragen."],
    noAir: "Hier gibt es noch keine Daten zur Luftqualität.",
    sunset: "Sonnenuntergang", daylight: "Tageslicht", longer: "+{n} Min. gegenüber heute", shorter: "{n} Min. kürzer als heute", same: "Wie heute",
    noSunrise: "Morgen geht die Sonne hier weder auf noch unter.", autoScene: "Automatische Szene", autoWhy: "Foto und Wetterebenen folgen dem echten Himmel und der Ortszeit.",
    city: "Stadt live", parking: "Parken", fuel: "Tanken", camCredit: "Live-Kameras von {credit}", newTab: "Öffnet {host} in einem neuen Tab",
    free: "{n} frei", of: "von {n}", approx: "ca.", fuelUnknown: "Status unbekannt",
    fuelStatus: { selling: "verfügbar", sold_out: "ausverkauft" }, community: "laut Fahrern", notAnswering: "Die Stadtdaten antworten gerade nicht.", diesel: "Diesel", gas: "Gas",
    noCity: "Noch keine Live-Stadtdaten für {city}.",
    agentRole: "Dein Stadtassistent", expand: "Vergrößern", collapse: "Verkleinern", sources: "Quellen",
    tagline: "Deine Stadt. Im Moment.", weather: "Wetter", hourly: "Stündlich", timeUnknown: "Zeit unbekannt", noaaFormula: "NOAA-Formel", fuelSelling: "an {n} {n|one:Tankstelle|other:Tankstellen} verfügbar",
    tabMap: "Karte", tabSaved: "Gespeichert", tabBar: "Schnellleiste",
    kinds: { clear: "Klar", partly: "Teils bewölkt", cloudy: "Bewölkt", fog: "Nebel", drizzle: "Niesel", rain: "Regen", storm: "Gewitter", snow: "Schnee", sleet: "Schneeregen", hail: "Hagel" },
  },
};

/** Fill "{n}", "{city}" ... in a string; "{n|one:bus|other:buses}" takes the plural form for n in `lang` ("other" without one). */
export function fill(s: string, vars: Record<string, string | number>, lang?: Lang): string {
  return s.replace(/\{(\w+)((?:\|\w+:[^|}]*)+)?\}/g, (m, k: string, forms?: string) => {
    if (!(k in vars)) return m;
    if (!forms) return String(vars[k]);
    const byCat = Object.fromEntries(forms.slice(1).split("|").map((f) => [f.slice(0, f.indexOf(":")), f.slice(f.indexOf(":") + 1)]));
    const n = Number(vars[k]);
    const cat = lang && Number.isFinite(n) ? new Intl.PluralRules(HTML_LANG[lang] ?? "en").select(n) : "other";
    return byCat[cat] ?? byCat.other ?? m;
  });
}

/** A "{city}" message, or `fallback` when the city is unknown (never "No data for ."). */
export const named = (s: string, city: string | null | undefined, fallback: string): string => (city?.trim() ? fill(s, { city: city.trim() }) : fallback);

export const textFor = (lang: Lang): V6Text => V6[lang] ?? V6.en;
