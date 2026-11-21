// Every string of the scroll story, the city marquee and the feature grid, in the 5 app languages.
// Plain data, no JSX, so it can be read on the server and in tests. No emojis, no arrow glyphs and
// no em or en dashes anywhere (tests/landing-story.test.ts checks all three).
//
// Labels the app already has (sky words, "Air quality", "US AQI", "Now" and "Live", the orb's
// status words) come from components/v6/text.tsx and components/ui/voice-orb.tsx instead, so the
// page and the app cannot disagree.
//
// Within one scene no content word is used twice (label, title, line and what the scene draws are
// read together), which is why the line of scene 002 never says "live" or "now": the mark beside
// each figure does.
import type { Lang } from "@/lib/lang";

/** A scene's words: the wide-tracked label, the giant title (one entry per line) and one short line. */
export interface SceneText {
  label: string;
  title: string[];
  line: string;
}

/**
 * The seven jobs of scene 005, in the order they arrive. Each one is a tool the agent has
 * (lib/tools/index.ts): add_to_calendar and get_calendar, play_video, play_music, open_app,
 * set_reminder, the photo reader (lib/photo.ts) and the desktop_ tools of Aspire Desktop.
 */
export const CHIP_IDS = ["calendar", "youtube", "spotify", "apps", "reminders", "photo", "desktop"] as const;
export type ChipId = (typeof CHIP_IDS)[number];

/** The eight tiles of the feature grid (Bento.tsx), in order. */
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
  /**
   * Scene 001. `q`, `step` and `a` are one example exchange; `step` is the app's own name for
   * get_next_bus. `q` and `a` are also what the recorded clips say (public/landing/audio), word for
   * word. `play` and `stop` name the button that runs the exchange with its sound.
   */
  ask: SceneText & { q: string; step: string; a: string; play: string; stop: string };
  /**
   * Scene 002. `dials` names the gauges ("Air quality" is the app's own word, components/v6/text);
   * `kmh` is the wind's unit; `device` is where the clock's time comes from; `preview` names a
   * reading that ?sky= or ?hour= changed. `to` names the two example destinations of the feature
   * grid's departures. `lineHome` replaces `line` when the reading is Erdenet's, standing in for a
   * place that is not known: that reading is never called the visitor's own.
   */
  city: SceneText & {
    lineHome: string;
    dials: { temp: string; wind: string; cloud: string; time: string };
    kmh: string;
    device: string;
    preview: string;
    to: [string, string];
  };
  /**
   * Scene 003. `hint` is only shown while scrolling changes the sky; `yours` names the visitor's own
   * sky. `lineHome` and `ours` take the place of `line` and `yours` when the sky is Erdenet's.
   */
  weather: SceneText & { lineHome: string; hint: string; yours: string; ours: string };
  /** Scene 004. The question it morphs through is `ask.q` of each language. */
  languages: SceneText;
  /**
   * Scene 005. `ack` is the app's own reply to a task (lib/brain/shared.ts ON_IT). `runs` is what
   * one might say for each job: an example line, typed out when its box is pressed. Nothing runs.
   * A line may name its own box, but never a word another box or the scene's text already shows,
   * and it is short enough to stay on two rows of a phone in the mono face.
   */
  work: SceneText & { ack: string; chips: Record<ChipId, string>; runs: Record<ChipId, string> };
  /**
   * Cities with a public street camera source in lib/cameras.ts: Erdenet and Ulaanbaatar (the
   * cities' own pages), London (TfL), Singapore (LTA), Hong Kong (Transport Department), Toronto
   * and Austin (city open data), Helsinki (Fintraffic), Oslo (Statens vegvesen), Reykjavik (IRCA),
   * Vancouver (DriveBC), Seattle (WSDOT), Los Angeles (Caltrans) and Auckland (NZTA).
   */
  marquee: { label: string; note: string; cities: string[] };
  /** The feature grid. `sign` is the example sign its photo tile reads, written in `signLang`. */
  index: { label: string; rows: Record<FeatureId, FeatureRow>; sign: string; signLang: Lang };
}

export const STORY_COPY: Record<Lang, StoryCopy> = {
  en: {
    example: "Example",
    erdenet: "Erdenet",
    ask: {
      label: "Ask",
      title: ["Say it", "out loud."],
      line: "Tap the mic and talk. It checks live data, then answers by voice.",
      q: "When should I leave?",
      step: "Next bus",
      a: "The 3 departs in about 4 minutes from Central Station. That is a 2 minute walk, so now is a good moment to go.",
      play: "Play",
      stop: "Stop",
    },
    city: {
      label: "The city, live",
      title: ["All of it", "at a glance."],
      line: "Read where you are, this very minute. Every figure names its source.",
      lineHome: "Read in our town, this very minute. Every figure names its source.",
      dials: { temp: "Temperature", wind: "Wind", cloud: "Cloud cover", time: "Local time" },
      kmh: "km/h",
      device: "Your device",
      preview: "Preview",
      to: ["Market", "University"],
    },
    weather: {
      label: "Real weather",
      title: ["The sky outside,", "on your screen."],
      line: "Drawn from the forecast where you are, at your own hour.",
      lineHome: "Drawn from the forecast for our town, at the hour there.",
      hint: "Keep scrolling to try three.",
      yours: "Yours",
      ours: "Ours",
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
      chips: { calendar: "Calendar", youtube: "YouTube", spotify: "Spotify", apps: "Open apps", reminders: "Reminders", photo: "Read a photo", desktop: "Your computer" },
      runs: {
        calendar: "add dinner, friday 19:00",
        youtube: "play lofi on youtube",
        spotify: "play jazz on spotify",
        apps: "open maps",
        reminders: "remind me at 18:00",
        photo: "read this photo",
        desktop: "start notepad on my pc",
      },
    },
    marquee: {
      label: "Public street cameras in",
      note: "Weather, air and news work in every other city too.",
      cities: ["Erdenet", "Ulaanbaatar", "London", "Singapore", "Hong Kong", "Toronto", "Austin", "Helsinki", "Oslo", "Reykjavik", "Vancouver", "Seattle", "Los Angeles", "Auckland"],
    },
    index: {
      label: "What it does",
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
      sign: "ЭМИЙН САН",
      signLang: "mn",
    },
  },
  mn: {
    example: "Жишээ",
    erdenet: "Эрдэнэт",
    ask: {
      label: "Асуу",
      title: ["Зүгээр л", "хэлээрэй."],
      line: "Микрофон дээр дараад ярь. Шууд мэдээллийг шалгаад дуугаар хариулна.",
      q: "Би хэзээ гарах вэ?",
      step: "Дараагийн автобус",
      a: "3-р чиглэл Төв буудлаас 4 орчим минутын дараа хөдөлнө. Тийшээ 2 минут алхана, тиймээс яг одоо явахад тохиромжтой.",
      play: "Тоглуулах",
      stop: "Зогсоох",
    },
    city: {
      label: "Хот, яг одоо",
      title: ["Бүгдийг нэг", "харцаар."],
      line: "Байгаа газраас тань энэ минутад уншив. Тоо бүр эх сурвалжаа заана.",
      lineHome: "Бидний амьдардаг газраас энэ минутад уншив. Тоо бүр эх сурвалжаа заана.",
      dials: { temp: "Температур", wind: "Салхи", cloud: "Үүлшил", time: "Орон нутгийн цаг" },
      kmh: "км/ц",
      device: "Таны төхөөрөмж",
      preview: "Урьдчилсан харагдац",
      to: ["Зах", "Их сургууль"],
    },
    weather: {
      label: "Бодит цаг агаар",
      title: ["Гадаах тэнгэр", "таны дэлгэцэд."],
      line: "Таны байгаа газрын урьдчилсан мэдээгээр, орон нутгийн цагт тааруулан зурна.",
      lineHome: "Бидний амьдардаг газрын урьдчилсан мэдээгээр, тэндхийн цагт тааруулан зурна.",
      hint: "Доош гүйлгээд гурвыг нь үзээрэй.",
      yours: "Таных",
      ours: "Манайх",
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
      chips: { calendar: "Хуанли", youtube: "YouTube", spotify: "Spotify", apps: "Апп нээх", reminders: "Сануулга", photo: "Зураг унших", desktop: "Таны компьютер" },
      runs: {
        calendar: "баасан 19:00 цагт оройн хоол нэм",
        youtube: "youtube дээр lofi тоглуул",
        spotify: "spotify дээр жазз тавь",
        apps: "maps аппыг нээ",
        reminders: "18:00 цагт сануул",
        photo: "энэ зургийг унш",
        desktop: "компьютер дээр notepad ажиллуул",
      },
    },
    marquee: {
      label: "Нийтийн гудамжны камертай хотууд",
      note: "Цаг агаар, агаарын чанар, мэдээ дэлхийн хаана ч ажиллана.",
      cities: ["Эрдэнэт", "Улаанбаатар", "Лондон", "Сингапур", "Хонконг", "Торонто", "Остин", "Хельсинки", "Осло", "Рейкьявик", "Ванкувер", "Сиэтл", "Лос-Анжелес", "Окленд"],
    },
    index: {
      label: "Юу хийдэг вэ",
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
      sign: "PHARMACY",
      signLang: "en",
    },
  },
  zh: {
    example: "示例",
    erdenet: "额尔登特",
    ask: {
      label: "提问",
      title: ["直接说", "就行。"],
      line: "点一下麦克风就能讲。它先查实时数据，再用语音回答。",
      q: "我该什么时候出发？",
      step: "下一班公交",
      a: "3 路车大约 4 分钟后从中心站发车。步行过去要 2 分钟，现在动身正合适。",
      play: "播放",
      stop: "停止",
    },
    city: {
      label: "城市实况",
      title: ["一屏", "尽览。"],
      line: "读取自你所在的位置，就在这一分钟。每个数字都注明来源。",
      lineHome: "读取自我们这里，就在这一分钟。每个数字都注明来源。",
      dials: { temp: "气温", wind: "风速", cloud: "云量", time: "当地时间" },
      kmh: "公里/小时",
      device: "你的设备",
      preview: "预览",
      to: ["市场", "大学"],
    },
    weather: {
      label: "真实天气",
      title: ["窗外的天空，", "就在屏幕上。"],
      line: "按你所在地的预报和当地时间绘制。",
      lineHome: "按我们这里的预报和当地时间绘制。",
      hint: "继续向下滚动，试试其中三种。",
      yours: "你的",
      ours: "我们的",
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
      chips: { calendar: "日历", youtube: "YouTube", spotify: "Spotify", apps: "打开应用", reminders: "提醒", photo: "读照片", desktop: "你的电脑" },
      runs: {
        calendar: "周五 19:00 加一个晚餐",
        youtube: "在 youtube 上播放 lofi",
        spotify: "在 spotify 上放点爵士",
        apps: "打开地图",
        reminders: "18:00 提醒我",
        photo: "读一下这张照片",
        desktop: "在电脑上运行记事本",
      },
    },
    marquee: {
      label: "已接入公共街道摄像头的城市",
      note: "天气、空气质量和新闻在世界任何地方都能用。",
      cities: ["额尔登特", "乌兰巴托", "伦敦", "新加坡", "香港", "多伦多", "奥斯汀", "赫尔辛基", "奥斯陆", "雷克雅未克", "温哥华", "西雅图", "洛杉矶", "奥克兰"],
    },
    index: {
      label: "它能做什么",
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
      sign: "ЭМИЙН САН",
      signLang: "mn",
    },
  },
  ru: {
    example: "Пример",
    erdenet: "Эрдэнэт",
    ask: {
      label: "Вопрос",
      title: ["Просто", "скажите."],
      line: "Нажмите на микрофон и говорите. Он сверится с данными в реальном времени и ответит голосом.",
      q: "Когда мне выходить?",
      step: "Ближайший автобус",
      a: "Маршрут 3 отправится примерно через 4 минуты от остановки «Центральная». Идти до неё 2 минуты, так что сейчас самое время.",
      play: "Проиграть",
      stop: "Стоп",
    },
    city: {
      label: "Город онлайн",
      title: ["Всё с одного", "взгляда."],
      line: "Данные для места, где вы находитесь, на эту минуту. У каждой цифры указан источник.",
      lineHome: "Данные из наших краёв, на эту минуту. У каждой цифры указан источник.",
      dials: { temp: "Температура", wind: "Ветер", cloud: "Облачность", time: "Местное время" },
      kmh: "км/ч",
      device: "Ваше устройство",
      preview: "Предпросмотр",
      to: ["Рынок", "Университет"],
    },
    weather: {
      label: "Настоящая погода",
      title: ["Небо за окном", "на вашем экране."],
      line: "Рисуется по прогнозу для вашего места и по местному времени.",
      lineHome: "Рисуется по прогнозу для наших краёв и по местному времени.",
      hint: "Листайте дальше и попробуйте три варианта.",
      yours: "Ваше",
      ours: "Наше",
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
      chips: { calendar: "Календарь", youtube: "YouTube", spotify: "Spotify", apps: "Запуск приложений", reminders: "Напоминания", photo: "Чтение фото", desktop: "Ваш компьютер" },
      runs: {
        calendar: "добавь ужин в пятницу в 19:00",
        youtube: "включи lofi на youtube",
        spotify: "включи джаз в spotify",
        apps: "открой карты",
        reminders: "напомни в 18:00",
        photo: "прочитай этот снимок",
        desktop: "запусти блокнот на компьютере",
      },
    },
    marquee: {
      label: "Города с открытыми уличными камерами",
      note: "Погода, качество воздуха и новости работают в любой точке мира.",
      cities: ["Эрдэнэт", "Улан-Батор", "Лондон", "Сингапур", "Гонконг", "Торонто", "Остин", "Хельсинки", "Осло", "Рейкьявик", "Ванкувер", "Сиэтл", "Лос-Анджелес", "Окленд"],
    },
    index: {
      label: "Что он умеет",
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
      sign: "ЭМИЙН САН",
      signLang: "mn",
    },
  },
  de: {
    example: "Beispiel",
    erdenet: "Erdenet",
    ask: {
      label: "Frage",
      title: ["Sag es", "einfach."],
      line: "Tippe aufs Mikrofon und sprich. Es prüft Live-Daten und antwortet per Stimme.",
      q: "Wann muss ich los?",
      step: "Nächster Bus",
      a: "Die 3 fährt in etwa 4 Minuten ab Hauptplatz. Zu Fuß sind es 2 Minuten, jetzt wäre also ein guter Moment.",
      play: "Abspielen",
      stop: "Stopp",
    },
    city: {
      label: "Die Stadt, live",
      title: ["Alles auf", "einen Blick."],
      line: "Abgelesen dort, wo du bist, in genau dieser Minute. Jede Zahl nennt ihre Quelle.",
      lineHome: "Abgelesen bei uns vor Ort, in genau dieser Minute. Jede Zahl nennt ihre Quelle.",
      dials: { temp: "Temperatur", wind: "Wind", cloud: "Bewölkung", time: "Ortszeit" },
      kmh: "km/h",
      device: "Dein Gerät",
      preview: "Vorschau",
      to: ["Markt", "Universität"],
    },
    weather: {
      label: "Echtes Wetter",
      title: ["Der Himmel", "vor deiner Tür."],
      line: "Gezeichnet nach der Vorhersage für deinen Ort, zu deiner Uhrzeit.",
      lineHome: "Gezeichnet nach der Vorhersage bei uns, zur Uhrzeit dort.",
      hint: "Scroll weiter und probier drei davon.",
      yours: "Deiner",
      ours: "Unserer",
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
      chips: { calendar: "Kalender", youtube: "YouTube", spotify: "Spotify", apps: "Apps öffnen", reminders: "Erinnerungen", photo: "Foto lesen", desktop: "Dein Computer" },
      runs: {
        calendar: "trag Abendessen ein, Freitag 19:00",
        youtube: "spiel Lofi auf YouTube",
        spotify: "spiel Jazz auf Spotify",
        apps: "öffne Maps",
        reminders: "erinnere mich um 18:00",
        photo: "lies dieses Bild vor",
        desktop: "starte den Editor auf meinem PC",
      },
    },
    marquee: {
      label: "Öffentliche Straßenkameras in",
      note: "Wetter, Luftqualität und Nachrichten gibt es auch in jeder anderen Stadt.",
      cities: ["Erdenet", "Ulaanbaatar", "London", "Singapur", "Hongkong", "Toronto", "Austin", "Helsinki", "Oslo", "Reykjavik", "Vancouver", "Seattle", "Los Angeles", "Auckland"],
    },
    index: {
      label: "Was es kann",
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
      sign: "ЭМИЙН САН",
      signLang: "mn",
    },
  },
};

/** The story's strings for a language; English when the language is not one of the five. */
export const storyCopy = (lang: Lang): StoryCopy => STORY_COPY[lang] ?? STORY_COPY.en;
