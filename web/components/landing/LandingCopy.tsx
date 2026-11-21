// The strings of the opening page's shell, in the 5 app languages: the intro, the hero, how it
// works, run it yourself, the questions, the closing call to action and the footer. The scroll
// story, the city marquee and the numbered index keep theirs in story/copy.ts.
// Plain data, no JSX, so the server component and its metadata share one source. No emojis, no
// arrow glyphs, and no em or en dashes anywhere (tests/landing.test.ts checks all three).
// Labels the app already has (the sky words, "Now", "Weather") come from components/v6/text.tsx
// instead, so the opening page and the app can never disagree.
import type { Lang } from "@/lib/lang";

type Pair = { title: string; body: string };
type Qa = { q: string; a: string };

export type LandingText = {
  skip: string;
  langLabel: string;
  signIn: string;
  /** The names of the button that stops and restarts everything that moves. */
  motion: { pause: string; play: string };
  /** For search results and share cards: the meta description, Open Graph and JSON-LD. */
  description: string;
  /** The one line of the intro, beside its counter. */
  intro: string;
  /** `title` is the headline as its two lines: each one rises from its own mask. */
  hero: { title: [string, string]; lead: string; cta: string; how: string; scroll: string };
  /** Captions of the four readings in the hero's corners. `near`, `home` and `preview` say whose place it is. */
  hud: { near: string; home: string; time: string; source: string; preview: string; notLive: string };
  /** Aspire's home city, named when the visitor's own place is unknown. */
  erdenet: string;
  how: { label: string; title: string; steps: [Pair, Pair, Pair] };
  self: { label: string; title: string; lead: string; points: [Pair, Pair, Pair]; download: string };
  faq: { label: string; title: string; items: [Qa, Qa, Qa, Qa] };
  end: { label: string; line: string };
  privacy: string;
  terms: string;
  legal: string;
  built: string;
};

export const LANDING_TEXT: Record<Lang, LandingText> = {
  en: {
    skip: "Skip to content",
    langLabel: "Language",
    signIn: "Sign in",
    motion: { pause: "Pause motion", play: "Play motion" },
    description: "Ask Aspire out loud about live buses, weather, traffic, street cameras and news in your city. It answers by voice in Mongolian, English, Chinese, Russian or German.",
    intro: "Finding your city",
    hero: {
      title: ["Ask your city", "anything."],
      lead: "A voice assistant for live buses, weather, traffic and street cameras, answering out loud in five languages.",
      cta: "Get started",
      how: "See how it works",
      scroll: "Scroll",
    },
    hud: { near: "Near you", home: "Our home", time: "Local time", source: "Source", preview: "Preview", notLive: "Not the current weather" },
    erdenet: "Erdenet",
    how: {
      label: "Three steps",
      title: "How it works",
      steps: [
        { title: "Sign in", body: "Takes a moment." },
        { title: "Allow your location", body: "Aspire then knows the city. You can also name one." },
        { title: "Ask out loud", body: "Tap the microphone and speak. Typing is fine too." },
      ],
    },
    self: {
      label: "Aspire Desktop",
      title: "Run it yourself",
      lead: "None of this depends on us, and we charge nothing.",
      points: [
        {
          title: "Windows and macOS",
          body: "The app pairs with your account, then opens websites and programs on that computer, only after you allow each one. A small Qwen2.5 1.5B model is built in.",
        },
        { title: "Bring your keys", body: "AI and speech providers bill you directly." },
        { title: "Host the backend", body: "It also fits on a machine or cloud of yours." },
      ],
      download: "Download",
    },
    faq: {
      label: "Good to know",
      title: "Questions",
      items: [
        { q: "Is it free?", a: "Yes. Aspire is free during the Orkhon Hackathon, and running it with your own keys is always free." },
        {
          q: "What happens to my data?",
          a: "Your memory, reminders and settings are stored on your device. To answer you, your question goes to our servers and to the AI and speech services named in the privacy policy (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). A copy goes to the cloud only when you link a chat app or your computer. Your account is handled by Clerk. The privacy policy has the details.",
        },
        {
          q: "Which languages does it speak?",
          a: "Mongolian, Chinese, English, Russian and German, by voice and by text. Switch any time and it follows you.",
        },
        {
          q: "How is my privacy protected?",
          a: "There are no advertising trackers, and we never sell your data. Your location is used only if you allow it, and you can turn it off at any time in Settings. Messages, calls and emails are sent only after you confirm. You can see and delete what Aspire remembers in Memory and Settings.",
        },
      ],
    },
    end: { label: "Ready when you are", line: "Your city is one question away." },
    privacy: "Privacy",
    terms: "Terms",
    legal: "Legal",
    built: "Built at the Orkhon Hackathon 2026, Erdenet",
  },
  mn: {
    skip: "Агуулга руу шилжих",
    langLabel: "Хэл",
    signIn: "Нэвтрэх",
    motion: { pause: "Хөдөлгөөнийг зогсоох", play: "Хөдөлгөөнийг үргэлжлүүлэх" },
    description: "Хотынхоо автобус, цаг агаар, замын хөдөлгөөн, гудамжны камер, мэдээг Aspire-аас чангаар асуу. Монгол, англи, хятад, орос, герман хэлээр дуугаар хариулна.",
    intro: "Таны хотыг хайж байна",
    hero: {
      title: ["Хотоосоо", "юу ч асуу."],
      lead: "Автобус, цаг агаар, замын хөдөлгөөн, гудамжны камерын дуут туслах. Таван хэлээр чангаар хариулна.",
      cta: "Эхлэх",
      how: "Хэрхэн ажилладгийг үзэх",
      scroll: "Доош гүйлгэ",
    },
    hud: { near: "Таны ойролцоо", home: "Манай нутаг", time: "Орон нутгийн цаг", source: "Эх сурвалж", preview: "Урьдчилсан харагдац", notLive: "Одоогийн цаг агаар биш" },
    erdenet: "Эрдэнэт",
    how: {
      label: "Гурван алхам",
      title: "Хэрхэн ажилладаг вэ",
      steps: [
        { title: "Нэвтэр", body: "Хэдхэн хором хангалттай." },
        { title: "Байршлаа зөвшөөр", body: "Aspire таны хотыг олно. Нэрийг нь өөрөө хэлж ч болно." },
        { title: "Чангаар асуу", body: "Микрофон дээр дараад ярь, эсвэл бич." },
      ],
    },
    self: {
      label: "Aspire Desktop",
      title: "Өөрөө ажиллуул",
      lead: "Энэ бүхэн манайхаас хамаарахгүй, бидэнд юу ч төлөхгүй.",
      points: [
        {
          title: "Windows ба macOS",
          body: "Апп таны бүртгэлтэй холбогдоод, тэр компьютер дээр вэб сайт, програм нээнэ. Тухай бүрд зөвхөн зөвшөөрлөөр. Жижиг Qwen2.5 1.5B загвар хамт ирнэ.",
        },
        { title: "Түлхүүрээ авчир", body: "Хиймэл оюун, ярианы үйлчилгээнүүд танаас шууд нэхэмжилнэ." },
        { title: "Сервер талыг байршуул", body: "Өөрийн машин эсвэл үүлэн дээр ч багтана." },
      ],
      download: "Татах",
    },
    faq: {
      label: "Мэдэхэд илүүдэхгүй",
      title: "Түгээмэл асуулт",
      items: [
        { q: "Үнэгүй юу?", a: "Тийм. Орхон Хакатоны үеэр Aspire үнэгүй, өөрийн түлхүүрээр ажиллуулах нь үргэлж үнэгүй." },
        {
          q: "Миний мэдээлэлд юу тохиолдох вэ?",
          a: "Санах ой, сануулга, тохиргоо тань төхөөрөмж дээр хадгалагдана. Хариулахын тулд асуултыг тань манай сервер болон нууцлалын бодлогод нэрлэсэн хиймэл оюун, ярианы үйлчилгээ (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs) рүү илгээнэ. Чат апп эсвэл компьютераа холбосон үед л хуулбар нь үүлэнд хадгалагдана. Таны бүртгэлийг Clerk хариуцна. Дэлгэрэнгүйг нууцлалын бодлогоос уншина уу.",
        },
        {
          q: "Ямар хэлээр ярьдаг вэ?",
          a: "Монгол, хятад, англи, орос, герман хэлээр, дуу болон бичвэрээр. Хүссэн үедээ хэлээ сольж болно, Aspire дагаад солигдоно.",
        },
        {
          q: "Миний нууцлал хэрхэн хамгаалагдах вэ?",
          a: "Бид зар сурталчилгааны хянах хэрэгсэл ашигладаггүй, таны мэдээллийг худалдахгүй. Байршлыг тань зөвхөн таны зөвшөөрлөөр ашиглана, Тохиргооноос хүссэн үедээ унтрааж болно. Мессеж, дуудлага, имэйлийг зөвхөн таныг баталгаажуулсны дараа илгээнэ. Aspire-ийн санаж буй зүйлийг «Санах ой», «Тохиргоо» хэсгээс үзэж, устгаж болно.",
        },
      ],
    },
    end: { label: "Та бэлэн болмогц", line: "Таны хот ганцхан асуултын зайтай." },
    privacy: "Нууцлал",
    terms: "Үйлчилгээний нөхцөл",
    legal: "Эрх зүйн мэдээлэл",
    built: "Орхон Хакатон 2026, Эрдэнэт хотод бүтээв",
  },
  zh: {
    skip: "跳到正文",
    langLabel: "语言",
    signIn: "登录",
    motion: { pause: "暂停动画", play: "播放动画" },
    description: "开口问 Aspire：你所在城市的实时公交、天气、路况、街道摄像头和新闻。它会用蒙古语、英语、中文、俄语或德语语音回答。",
    intro: "正在寻找你的城市",
    hero: {
      title: ["你的城市，", "有问必答。"],
      lead: "语音助手：实时公交、天气、路况和街道摄像头，用五种语言说给你听。",
      cta: "开始使用",
      how: "了解工作原理",
      scroll: "向下滚动",
    },
    hud: { near: "你的附近", home: "我们的家乡", time: "当地时间", source: "来源", preview: "预览", notLive: "并非当前天气" },
    erdenet: "额尔登特",
    how: {
      label: "三步上手",
      title: "如何使用",
      steps: [
        { title: "登录", body: "只需片刻。" },
        { title: "允许定位", body: "Aspire 会找到你所在的城市，也可以直接说出它的名字。" },
        { title: "开口提问", body: "点一下麦克风就讲，打字同样行。" },
      ],
    },
    self: {
      label: "Aspire Desktop",
      title: "自行运行",
      lead: "这一切都不依赖我们，我们分文不取。",
      points: [
        {
          title: "Windows 和 macOS",
          body: "应用与你的账户配对后，可在那台电脑上打开网站和程序，每次都要先经你允许。内置一个小型 Qwen2.5 1.5B 模型。",
        },
        { title: "带上你的密钥", body: "AI 和语音服务商会直接向你计费。" },
        { title: "自己托管后端", body: "它同样能放在你自己的机器或云上。" },
      ],
      download: "下载",
    },
    faq: {
      label: "须知",
      title: "常见问题",
      items: [
        { q: "免费吗？", a: "是的。鄂尔浑黑客马拉松期间 Aspire 免费，用你自己的密钥运行则一直免费。" },
        {
          q: "我的数据会怎样？",
          a: "你的记忆、提醒和设置保存在你的设备上。为了回答你，你的提问会发送到我们的服务器以及隐私政策中列出的 AI 和语音服务（Anthropic、DeepSeek、Google、Microsoft、ElevenLabs）。只有绑定聊天应用或你的电脑后，才会在云端保存一份副本。你的账户由 Clerk 管理。详情请阅读隐私政策。",
        },
        {
          q: "支持哪些语言？",
          a: "蒙古语、中文、英语、俄语和德语，语音和文字均可。随时切换，它会跟着你。",
        },
        {
          q: "我的隐私如何得到保护？",
          a: "没有广告追踪，我们绝不出售你的数据。只有在你允许时才会使用你的位置，你可以随时在设置中关闭。消息、电话和邮件只有在你确认后才会发送。你可以在“记忆”和“设置”中查看并删除 Aspire 记住的内容。",
        },
      ],
    },
    end: { label: "随时恭候", line: "你的城市，只差一个问题。" },
    privacy: "隐私政策",
    terms: "服务条款",
    legal: "法律信息",
    built: "诞生于 2026 鄂尔浑黑客马拉松，额尔登特",
  },
  ru: {
    skip: "Перейти к содержимому",
    langLabel: "Язык",
    signIn: "Войти",
    motion: { pause: "Остановить анимацию", play: "Включить анимацию" },
    description: "Спросите Aspire вслух про автобусы в реальном времени, погоду, пробки, уличные камеры и новости вашего города. Он ответит голосом на монгольском, английском, китайском, русском или немецком.",
    intro: "Ищем ваш город",
    hero: {
      title: ["Спросите город", "о чём угодно."],
      lead: "Голосовой помощник: автобусы онлайн, погода, пробки и уличные камеры. Отвечает вслух на пяти языках.",
      cta: "Начать",
      how: "Как это работает",
      scroll: "Листайте вниз",
    },
    hud: { near: "Рядом с вами", home: "Наш дом", time: "Местное время", source: "Источник", preview: "Предпросмотр", notLive: "Не текущая погода" },
    erdenet: "Эрдэнэт",
    how: {
      label: "Три шага",
      title: "Как это работает",
      steps: [
        { title: "Войдите", body: "Займёт всего мгновение." },
        { title: "Разрешите геолокацию", body: "Aspire определит ваш город, или назовите его сами." },
        { title: "Спросите вслух", body: "Нажмите на микрофон и говорите. Или напишите." },
      ],
    },
    self: {
      label: "Aspire Desktop",
      title: "Запустите у себя",
      lead: "Ничто здесь не зависит от нас, и платить нам не нужно.",
      points: [
        {
          title: "Windows и macOS",
          body: "Приложение связывается с учётной записью и открывает сайты и программы на этом компьютере, каждый раз только с разрешения. Небольшая модель Qwen2.5 1.5B уже встроена.",
        },
        { title: "Принесите свои ключи", body: "Сервисы ИИ и речи выставляют счёт вам напрямую." },
        { title: "Разместите бэкенд сами", body: "Он поместится на вашей машине или в облаке." },
      ],
      download: "Скачать",
    },
    faq: {
      label: "Полезно знать",
      title: "Вопросы",
      items: [
        { q: "Это бесплатно?", a: "Да. На время Орхон Хакатона Aspire бесплатен, а со своими ключами он бесплатен всегда." },
        {
          q: "Что происходит с моими данными?",
          a: "Память, напоминания и настройки хранятся на вашем устройстве. Для ответа ваш вопрос отправляется на наши серверы и в сервисы ИИ и речи, перечисленные в политике конфиденциальности (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). Копия попадает в облако, только если вы подключили мессенджер или компьютер. Учётной записью занимается Clerk. Подробнее в политике конфиденциальности.",
        },
        {
          q: "На каких языках он говорит?",
          a: "Монгольский, китайский, английский, русский и немецкий, голосом и текстом. Переключайтесь в любой момент, он подстроится.",
        },
        {
          q: "Как защищена моя конфиденциальность?",
          a: "Никаких рекламных трекеров, и мы не продаём ваши данные. Местоположение используется только с вашего разрешения, и его можно отключить в любой момент в настройках. Сообщения, звонки и письма отправляются только после вашего подтверждения. То, что помнит Aspire, можно посмотреть и удалить в разделах «Память» и «Настройки».",
        },
      ],
    },
    end: { label: "Когда будете готовы", line: "До вашего города всего один вопрос." },
    privacy: "Конфиденциальность",
    terms: "Условия",
    legal: "Правовая информация",
    built: "Создано на Орхон Хакатоне 2026, Эрдэнэт",
  },
  de: {
    skip: "Zum Inhalt springen",
    langLabel: "Sprache",
    signIn: "Anmelden",
    motion: { pause: "Animation anhalten", play: "Animation abspielen" },
    description: "Frag Aspire laut nach Bussen in Echtzeit, Wetter, Verkehr, Straßenkameras und Nachrichten in deiner Stadt. Es antwortet per Stimme auf Mongolisch, Englisch, Chinesisch, Russisch oder Deutsch.",
    intro: "Wir suchen deine Stadt",
    hero: {
      title: ["Frag deine Stadt,", "was du willst."],
      lead: "Ein Assistent, der zuhört: Busse in Echtzeit, Wetter, Verkehr und Straßenkameras, laut beantwortet in fünf Sprachen.",
      cta: "Loslegen",
      how: "So funktioniert es",
      scroll: "Scrollen",
    },
    hud: { near: "In deiner Nähe", home: "Unser Zuhause", time: "Ortszeit", source: "Quelle", preview: "Vorschau", notLive: "Nicht das aktuelle Wetter" },
    erdenet: "Erdenet",
    how: {
      label: "Drei Schritte",
      title: "So funktioniert es",
      steps: [
        { title: "Anmelden", body: "Dauert nur einen Moment." },
        { title: "Standort erlauben", body: "Aspire erkennt deine Stadt, oder du nennst sie selbst." },
        { title: "Laut fragen", body: "Tippe aufs Mikrofon und sprich. Oder schreib einfach." },
      ],
    },
    self: {
      label: "Aspire Desktop",
      title: "Selbst betreiben",
      lead: "Das alles läuft ohne uns, und es kostet bei uns nichts.",
      points: [
        {
          title: "Windows und macOS",
          body: "Die App koppelt sich mit deinem Konto und öffnet dann Websites und Programme auf diesem Computer, jedes Mal erst nach deiner Freigabe. Ein kleines Qwen2.5-1.5B-Modell ist eingebaut.",
        },
        { title: "Eigene Schlüssel mitbringen", body: "KI- und Sprachdienste rechnen direkt mit dir ab." },
        { title: "Backend bei dir hosten", body: "Es passt auch auf deinen Rechner oder in deine Cloud." },
      ],
      download: "Herunterladen",
    },
    faq: {
      label: "Gut zu wissen",
      title: "Fragen",
      items: [
        { q: "Ist es kostenlos?", a: "Ja. Während des Orkhon Hackathons ist Aspire kostenlos, und mit eigenen Schlüsseln immer." },
        {
          q: "Was passiert mit meinen Daten?",
          a: "Gedächtnis, Erinnerungen und Einstellungen liegen auf deinem Gerät. Für die Antwort geht deine Frage an unsere Server und an die KI- und Sprachdienste aus der Datenschutzerklärung (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). Eine Kopie landet nur in der Cloud, wenn du eine Chat-App oder deinen Computer verbindest. Dein Konto verwaltet Clerk. Details stehen in der Datenschutzerklärung.",
        },
        {
          q: "Welche Sprachen spricht es?",
          a: "Mongolisch, Chinesisch, Englisch, Russisch und Deutsch, per Stimme und Text. Wechsle jederzeit, es folgt dir.",
        },
        {
          q: "Wie wird meine Privatsphäre geschützt?",
          a: "Keine Werbe-Tracker, und wir verkaufen deine Daten nie. Dein Standort wird nur genutzt, wenn du es erlaubst, und du kannst ihn jederzeit in den Einstellungen ausschalten. Nachrichten, Anrufe und E-Mails gehen erst nach deiner Bestätigung raus. Was Aspire sich merkt, kannst du unter „Gedächtnis“ und „Einstellungen“ ansehen und löschen.",
        },
      ],
    },
    end: { label: "Wann immer du willst", line: "Deine Stadt ist nur eine Frage entfernt." },
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    legal: "Rechtliches",
    built: "Gebaut beim Orkhon Hackathon 2026, Erdenet",
  },
};
