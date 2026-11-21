// Every string of the scroll story, the city marquee and the feature index, in the 5 app languages.
// Plain data, no JSX, so it can be read on the server and in tests. No emojis, no arrow glyphs and
// no em or en dashes anywhere (tests/landing-story.test.ts checks all three).
//
// Labels the app already has (sky words, "Leave in N min", traffic and air words, the orb's status
// words) come from components/v6/text.tsx and components/ui/voice-orb.tsx instead, so the page and
// the app cannot disagree.
//
// Within one scene no content word is used twice (label, title, line and what the scene draws are
// read together), which is why a card is called "Air" beside a title that says nothing about air.
import type { Lang } from "@/lib/lang";

/** A scene's words: the wide-tracked label, the giant title (one entry per line) and one short line. */
export interface SceneText {
  label: string;
  title: string[];
  line: string;
}

/** The six product cards of scene 02, in the order they lie in the row. */
export const CARD_IDS = ["weather", "bus", "traffic", "air", "cameras", "news"] as const;
export type CardId = (typeof CARD_IDS)[number];

/**
 * The seven jobs of scene 05, in the order they fly in. Each one is a tool the agent has
 * (lib/tools/index.ts): add_to_calendar and get_calendar, play_video, play_music, open_app,
 * set_reminder, the photo reader (lib/photo.ts) and the desktop_ tools of Aspire Desktop.
 */
export const CHIP_IDS = ["calendar", "youtube", "spotify", "apps", "reminders", "photo", "desktop"] as const;
export type ChipId = (typeof CHIP_IDS)[number];

/** The eight rows of the feature index, in order. */
export const FEATURE_IDS = ["bus", "weather", "traffic", "map", "news", "reminders", "photo", "chat"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export interface FeatureRow {
  title: string;
  line: string;
}

export interface StoryCopy {
  /** The small label on everything that is not a live reading. */
  example: string;
  /** Aspire's home city, shown when the visitor's own place is not known. */
  erdenet: string;
  /** Scene 01. `q`, `step` and `a` are one example exchange; `step` is the app's own name for get_next_bus. */
  ask: SceneText & { q: string; step: string; a: string };
  /** Scene 02. `stop` and `to` are example stop names for the bus card. */
  city: SceneText & { cards: Record<CardId, string>; stop: string; to: [string, string]; feeds: string; headlines: string };
  /** Scene 03. `hint` is only shown while scrolling changes the sky; `yours` names the visitor's own sky. */
  weather: SceneText & { hint: string; yours: string };
  /** Scene 04. The question it morphs through is `ask.q` of each language. */
  languages: SceneText;
  /** Scene 05. `ack` is the app's own reply to a task (lib/brain/shared.ts ON_IT). */
  work: SceneText & { ack: string; chips: Record<ChipId, string> };
  /**
   * Cities with a public street camera source in lib/cameras.ts: Erdenet and Ulaanbaatar (the
   * cities' own pages), London (TfL), Singapore (LTA), Hong Kong (Transport Department), Toronto
   * and Austin (city open data), Helsinki (Fintraffic), Oslo (Statens vegvesen), Reykjavik (IRCA),
   * Vancouver (DriveBC), Seattle (WSDOT), Los Angeles (Caltrans) and Auckland (NZTA).
   */
  marquee: { label: string; note: string; cities: string[] };
  /** The feature index. `reminder`, `sign` and `reads` are example words inside two of its previews. */
  index: { label: string; rows: Record<FeatureId, FeatureRow>; reminder: string; sign: string; signLang: Lang; reads: string };
}

export const STORY_COPY: Record<Lang, StoryCopy> = {
  en: {
    example: "Example",
    erdenet: "Erdenet",
    ask: {
      label: "Ask",
      title: ["Say it", "out loud."],
      line: "Tap the mic and talk. Aspire checks live data, then answers by voice.",
      q: "When should I leave?",
      step: "Next bus",
      a: "The 3 departs in about 4 minutes from Central Station. That is a 2 minute walk, so now is a good moment to go.",
    },
    city: {
      label: "The city, live",
      title: ["All of it", "at a glance."],
      line: "Six cards, each one saying where its numbers come from.",
      cards: { weather: "Weather", bus: "Next bus", traffic: "Traffic", air: "Air", cameras: "Street cameras", news: "News" },
      stop: "Central Station",
      to: ["Market", "University"],
      feeds: "Public feeds only, never private ones.",
      headlines: "Today's headlines for your country.",
    },
    weather: {
      label: "Real weather",
      title: ["The sky outside,", "on your screen."],
      line: "Drawn from the forecast where you are, at your own hour.",
      hint: "Keep scrolling to try three.",
      yours: "Yours",
    },
    languages: {
      label: "Five languages",
      title: ["Speak", "yours."],
      line: "Switch mid conversation and it follows. The answer comes back the way you asked.",
    },
    work: {
      label: "It does the work",
      title: ["Consider", "it done."],
      line: "It gets things ready. Nothing is sent or launched until you confirm.",
      ack: "On it, sir.",
      chips: { calendar: "Calendar", youtube: "YouTube", spotify: "Spotify", apps: "Open apps", reminders: "Reminders", photo: "Read a photo", desktop: "Aspire Desktop" },
    },
    marquee: {
      label: "Public street cameras in",
      note: "Weather, air and news work in every other city too.",
      cities: ["Erdenet", "Ulaanbaatar", "London", "Singapore", "Hong Kong", "Toronto", "Austin", "Helsinki", "Oslo", "Reykjavik", "Vancouver", "Seattle", "Los Angeles", "Auckland"],
    },
    index: {
      label: "What Aspire does",
      rows: {
        bus: { title: "Buses and stops", line: "Where yours is now, and when to leave." },
        weather: { title: "Weather and air", line: "The forecast drawn on screen, with a quality index beside it." },
        traffic: { title: "Traffic and cameras", line: "How busy the roads are, with public feeds to check." },
        map: { title: "City map", line: "Your position and the places around you." },
        news: { title: "Local news", line: "Today's headlines for your country, each with its source." },
        reminders: { title: "Reminders and timers", line: "Set by voice, announced on time." },
        photo: { title: "Photo reading", line: "Photograph a menu, a sign or a bill and hear what it says." },
        chat: { title: "Chat apps and desktop", line: "Message it from Telegram, Discord or Slack, or pair your computer." },
      },
      reminder: "Take your medicine",
      sign: "ЭМИЙН САН",
      signLang: "mn",
      reads: "It says: pharmacy.",
    },
  },
  mn: {
    example: "Жишээ",
    erdenet: "Эрдэнэт",
    ask: {
      label: "Асуу",
      title: ["Зүгээр л", "хэлээрэй."],
      line: "Микрофон дээр дараад ярь. Aspire шууд мэдээллийг шалгаад дуугаар хариулна.",
      q: "Би хэзээ гарах вэ?",
      step: "Дараагийн автобус",
      a: "3-р чиглэл Төв буудлаас 4 орчим минутын дараа хөдөлнө. Тийшээ 2 минут алхана, тиймээс яг одоо явахад тохиромжтой.",
    },
    city: {
      label: "Хот, яг одоо",
      title: ["Бүгд нэг", "дэлгэцэд."],
      line: "Зургаан карт, тус бүр тоо баримтынхаа эх сурвалжийг заана.",
      cards: { weather: "Цаг агаар", bus: "Дараагийн автобус", traffic: "Замын хөдөлгөөн", air: "Агаар", cameras: "Гудамжны камер", news: "Мэдээ" },
      stop: "Төв буудал",
      to: ["Зах", "Их сургууль"],
      feeds: "Зөвхөн нийтэд нээлттэй дамжуулалт.",
      headlines: "Танай улсын өнөөдрийн гарчгууд.",
    },
    weather: {
      label: "Бодит цаг агаар",
      title: ["Гадаах тэнгэр", "таны дэлгэцэд."],
      line: "Таны байгаа газрын урьдчилсан мэдээгээр, орон нутгийн цагт тааруулан зурна.",
      hint: "Доош гүйлгээд гурвыг нь үзээрэй.",
      yours: "Таных",
    },
    languages: {
      label: "Таван хэл",
      title: ["Өөрийнхөөрөө", "ярь."],
      line: "Дундуур нь сольсон ч дагана. Яаж асуусан, яг тэгж хариулна.",
    },
    work: {
      label: "Ажлаа даатга",
      title: ["Болсон гэж", "бодоорой."],
      line: "Бүхнийг бэлдэж өгнө. Таныг баталгаажуулах хүртэл юу ч илгээхгүй, ажиллуулахгүй.",
      ack: "Одоо хийнэ, ноёнтон.",
      chips: { calendar: "Хуанли", youtube: "YouTube", spotify: "Spotify", apps: "Апп нээх", reminders: "Сануулга", photo: "Зураг унших", desktop: "Aspire Desktop" },
    },
    marquee: {
      label: "Нийтийн гудамжны камертай хотууд",
      note: "Цаг агаар, агаарын чанар, мэдээ дэлхийн хаана ч ажиллана.",
      cities: ["Эрдэнэт", "Улаанбаатар", "Лондон", "Сингапур", "Хонконг", "Торонто", "Остин", "Хельсинки", "Осло", "Рейкьявик", "Ванкувер", "Сиэтл", "Лос-Анжелес", "Окленд"],
    },
    index: {
      label: "Aspire юу хийдэг вэ",
      rows: {
        bus: { title: "Автобус, буудал", line: "Таных одоо хаана яваа, хэзээ гарахыг харуулна." },
        weather: { title: "Тэнгэр, агаарын чанар", line: "Бороо, цасыг дэлгэцэн дээр зурж, хажууд нь индексийг үзүүлнэ." },
        traffic: { title: "Замын хөдөлгөөн, камер", line: "Зам хэр ачаалалтайг мэдэгдэж, нийтийн дамжуулалтаар шалгуулна." },
        map: { title: "Хотын газрын зураг", line: "Таны байршил, эргэн тойронд юу байгаа." },
        news: { title: "Орон нутгийн мэдээ", line: "Танай улсын өнөөдрийн гарчгууд, эх сурвалжтайгаа." },
        reminders: { title: "Сануулга, цаг хэмжигч", line: "Дуугаар тавина, болзсон мөчид нь чангаар зарлана." },
        photo: { title: "Бичвэр унших", line: "Цэс, самбар, баримтаа дарж авахад агуулгыг нь хэлж өгнө." },
        chat: { title: "Чат апп, компьютер", line: "Telegram, Discord, Slack-аас бич, эсвэл өөрийн төхөөрөмжтэй холбо." },
      },
      reminder: "Эмээ уух цаг",
      sign: "PHARMACY",
      signLang: "en",
      reads: "Энд «Эмийн сан» гэж бичжээ.",
    },
  },
  zh: {
    example: "示例",
    erdenet: "额尔登特",
    ask: {
      label: "提问",
      title: ["直接说", "就行。"],
      line: "点一下麦克风就能讲。Aspire 先查实时数据，再用语音回答。",
      q: "我该什么时候出发？",
      step: "下一班公交",
      a: "3 路车大约 4 分钟后从中心站发车。步行过去要 2 分钟，现在动身正合适。",
    },
    city: {
      label: "城市实况",
      title: ["一屏", "尽览。"],
      line: "六张卡片，每一张都注明数据来源。",
      cards: { weather: "天气", bus: "下一班公交", traffic: "路况", air: "空气", cameras: "街道摄像头", news: "新闻" },
      stop: "中心站",
      to: ["市场", "大学"],
      feeds: "只接入公开画面，绝不涉及私人设备。",
      headlines: "你所在国家的今日头条。",
    },
    weather: {
      label: "真实天气",
      title: ["窗外的天空，", "就在屏幕上。"],
      line: "按你所在地的预报和当地时间绘制。",
      hint: "继续向下滚动，试试其中三种。",
      yours: "你的",
    },
    languages: {
      label: "五种语言",
      title: ["说你的", "母语。"],
      line: "中途切换也能跟上。你怎么问，它就怎么答。",
    },
    work: {
      label: "替你代劳",
      title: ["就当", "搞定了。"],
      line: "它把一切准备好。在你确认之前，不会发送或启动任何东西。",
      ack: "马上办，先生。",
      chips: { calendar: "日历", youtube: "YouTube", spotify: "Spotify", apps: "打开应用", reminders: "提醒", photo: "读照片", desktop: "Aspire Desktop" },
    },
    marquee: {
      label: "已接入公共街道摄像头的城市",
      note: "天气、空气质量和新闻在世界任何地方都能用。",
      cities: ["额尔登特", "乌兰巴托", "伦敦", "新加坡", "香港", "多伦多", "奥斯汀", "赫尔辛基", "奥斯陆", "雷克雅未克", "温哥华", "西雅图", "洛杉矶", "奥克兰"],
    },
    index: {
      label: "Aspire 能做什么",
      rows: {
        bus: { title: "公交与站点", line: "你的车到哪了，何时该出发。" },
        weather: { title: "天气与空气", line: "预报直接画在屏幕上，旁边是质量指数。" },
        traffic: { title: "路况与摄像头", line: "道路有多堵，还有公开画面可看。" },
        map: { title: "城市地图", line: "你的位置和周边的地点。" },
        news: { title: "本地新闻", line: "你所在国家的今日头条，每条都注明来源。" },
        reminders: { title: "提醒与计时", line: "用语音设置，到点出声播报。" },
        photo: { title: "读懂照片", line: "给菜单、路牌或账单拍一张，听它念出来。" },
        chat: { title: "聊天应用与桌面", line: "在 Telegram、Discord 或 Slack 里发消息，或与你的电脑配对。" },
      },
      reminder: "该吃药了",
      sign: "ЭМИЙН САН",
      signLang: "mn",
      reads: "上面写着：药店。",
    },
  },
  ru: {
    example: "Пример",
    erdenet: "Эрдэнэт",
    ask: {
      label: "Вопрос",
      title: ["Просто", "скажите."],
      line: "Нажмите на микрофон и говорите. Aspire сверится с данными в реальном времени и ответит голосом.",
      q: "Когда мне выходить?",
      step: "Ближайший автобус",
      a: "Маршрут 3 отправится примерно через 4 минуты от остановки «Центральная». Идти до неё 2 минуты, так что сейчас самое время.",
    },
    city: {
      label: "Город онлайн",
      title: ["Всё на", "одном экране."],
      line: "Шесть карточек, и каждая говорит, откуда её цифры.",
      cards: { weather: "Погода", bus: "Ближайший автобус", traffic: "Пробки", air: "Воздух", cameras: "Уличные камеры", news: "Новости" },
      stop: "Центральная",
      to: ["Рынок", "Университет"],
      feeds: "Только открытые трансляции, никаких частных.",
      headlines: "Главное за сегодня в вашей стране.",
    },
    weather: {
      label: "Настоящая погода",
      title: ["Небо за окном", "на вашем экране."],
      line: "Рисуется по прогнозу для вашего места и по местному времени.",
      hint: "Листайте дальше и попробуйте три варианта.",
      yours: "Ваше",
    },
    languages: {
      label: "Пять языков",
      title: ["Говорите", "на своём."],
      line: "Переключайтесь на ходу, он подстроится. Ответ придёт на том же, на котором спросили.",
    },
    work: {
      label: "Работает за вас",
      title: ["Считайте,", "готово."],
      line: "Он всё подготовит. Ничего не отправится и не откроется, пока вы не подтвердите.",
      ack: "Уже делаю, сэр.",
      chips: { calendar: "Календарь", youtube: "YouTube", spotify: "Spotify", apps: "Запуск приложений", reminders: "Напоминания", photo: "Чтение фото", desktop: "Aspire Desktop" },
    },
    marquee: {
      label: "Города с открытыми уличными камерами",
      note: "Погода, качество воздуха и новости работают в любой точке мира.",
      cities: ["Эрдэнэт", "Улан-Батор", "Лондон", "Сингапур", "Гонконг", "Торонто", "Остин", "Хельсинки", "Осло", "Рейкьявик", "Ванкувер", "Сиэтл", "Лос-Анджелес", "Окленд"],
    },
    index: {
      label: "Что умеет Aspire",
      rows: {
        bus: { title: "Автобусы и остановки", line: "Где сейчас ваш и когда выходить." },
        weather: { title: "Погода и воздух", line: "Прогноз рисуется на экране, рядом индекс качества." },
        traffic: { title: "Пробки и камеры", line: "Насколько загружены дороги, плюс открытые трансляции для проверки." },
        map: { title: "Карта города", line: "Ваша точка и всё, что есть поблизости." },
        news: { title: "Местные новости", line: "Сегодняшние заголовки вашей страны, у каждого указан источник." },
        reminders: { title: "Напоминания и таймеры", line: "Ставятся голосом и звучат вслух точно в срок." },
        photo: { title: "Чтение фото", line: "Снимите меню, вывеску или счёт и услышьте, что там написано." },
        chat: { title: "Мессенджеры и компьютер", line: "Пишите из Telegram, Discord или Slack либо подключите свой ПК." },
      },
      reminder: "Принять лекарство",
      sign: "ЭМИЙН САН",
      signLang: "mn",
      reads: "Здесь написано: аптека.",
    },
  },
  de: {
    example: "Beispiel",
    erdenet: "Erdenet",
    ask: {
      label: "Frage",
      title: ["Sag es", "einfach."],
      line: "Tippe aufs Mikrofon und sprich. Aspire prüft Live-Daten und antwortet per Stimme.",
      q: "Wann muss ich los?",
      step: "Nächster Bus",
      a: "Die 3 fährt in etwa 4 Minuten ab Hauptplatz. Zu Fuß sind es 2 Minuten, jetzt wäre also ein guter Moment.",
    },
    city: {
      label: "Die Stadt, live",
      title: ["Alles auf", "einen Blick."],
      line: "Sechs Karten, und jede sagt, woher ihre Zahlen stammen.",
      cards: { weather: "Wetter", bus: "Nächster Bus", traffic: "Verkehr", air: "Luft", cameras: "Straßenkameras", news: "Nachrichten" },
      stop: "Hauptplatz",
      to: ["Markt", "Universität"],
      feeds: "Nur öffentliche Feeds, nie private.",
      headlines: "Die Schlagzeilen des Tages für dein Land.",
    },
    weather: {
      label: "Echtes Wetter",
      title: ["Der Himmel", "vor deiner Tür."],
      line: "Gezeichnet nach der Vorhersage für deinen Ort, zu deiner Uhrzeit.",
      hint: "Scroll weiter und probier drei davon.",
      yours: "Deiner",
    },
    languages: {
      label: "Fünf Sprachen",
      title: ["Sprich", "deine."],
      line: "Wechsle mittendrin, es folgt dir. Die Antwort kommt so zurück, wie du gefragt hast.",
    },
    work: {
      label: "Es packt an",
      title: ["So gut wie", "geschafft."],
      line: "Es bereitet alles vor. Nichts wird gesendet oder gestartet, bevor du bestätigst.",
      ack: "Wird erledigt, Sir.",
      chips: { calendar: "Kalender", youtube: "YouTube", spotify: "Spotify", apps: "Apps öffnen", reminders: "Erinnerungen", photo: "Foto lesen", desktop: "Aspire Desktop" },
    },
    marquee: {
      label: "Öffentliche Straßenkameras in",
      note: "Wetter, Luftqualität und Nachrichten gibt es auch in jeder anderen Stadt.",
      cities: ["Erdenet", "Ulaanbaatar", "London", "Singapur", "Hongkong", "Toronto", "Austin", "Helsinki", "Oslo", "Reykjavik", "Vancouver", "Seattle", "Los Angeles", "Auckland"],
    },
    index: {
      label: "Was Aspire kann",
      rows: {
        bus: { title: "Busse und Haltestellen", line: "Wo deiner gerade ist und wann du los musst." },
        weather: { title: "Wetter und Luft", line: "Die Vorhersage direkt auf dem Bildschirm, daneben ein Qualitätsindex." },
        traffic: { title: "Verkehr und Kameras", line: "Wie voll die Straßen sind, mit öffentlichen Feeds zum Nachsehen." },
        map: { title: "Stadtkarte", line: "Dein Standort und die Orte um dich herum." },
        news: { title: "Lokale Nachrichten", line: "Die Schlagzeilen des Tages für dein Land, jede mit Quelle." },
        reminders: { title: "Erinnerungen und Timer", line: "Per Stimme gestellt, pünktlich laut angesagt." },
        photo: { title: "Fotos lesen", line: "Knipse eine Speisekarte, ein Schild oder eine Rechnung und hör, was draufsteht." },
        chat: { title: "Chat-Apps und Desktop", line: "Schreib aus Telegram, Discord oder Slack, oder koppel deinen Computer." },
      },
      reminder: "Tabletten nehmen",
      sign: "ЭМИЙН САН",
      signLang: "mn",
      reads: "Hier steht: Apotheke.",
    },
  },
};

/** The story's strings for a language; English when the language is not one of the five. */
export const storyCopy = (lang: Lang): StoryCopy => STORY_COPY[lang] ?? STORY_COPY.en;
