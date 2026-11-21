// Every string on the public homepage, in the 5 app languages. Plain data, no JSX, so the
// server component and its metadata share one source. No emojis, no arrow glyphs.
import type { Lang } from "@/lib/lang";

type Pair = { title: string; body: string };
type Qa = { q: string; a: string };

export type LandingText = {
  skip: string;
  langLabel: string;
  signIn: string;
  eyebrow: string;
  title: string;
  lead: string;
  cta: string;
  how: string;
  mock: { city: string; note: string; sky: string; bus: string; mins: string; ask: string; label: string };
  featuresTitle: string;
  features: [Pair, Pair, Pair, Pair, Pair, Pair];
  howTitle: string;
  steps: [Pair, Pair, Pair];
  citiesTitle: string;
  erdenet: Pair;
  world: Pair;
  faqTitle: string;
  faq: [Qa, Qa, Qa];
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
    eyebrow: "A voice assistant for your city",
    title: "Your city, in the moment.",
    lead: "Ask Aspire anything — live buses, weather, traffic, news — by voice in Mongolian, English, Chinese, Russian or German.",
    cta: "Get started",
    how: "See how it works",
    mock: {
      city: "Erdenet",
      note: "Illustration, not live data",
      sky: "Clear",
      bus: "Bus 3",
      mins: "4 min",
      ask: "When is my bus?",
      label: "A sketch of the Aspire screen",
    },
    featuresTitle: "What it does",
    features: [
      { title: "Know your city right now", body: "Live buses, traffic and air quality on one screen, with live street cameras in Erdenet, London, Singapore, Hong Kong, California and New Zealand, and YouTube live streams near you." },
      { title: "Talk in your own language", body: "Speak Mongolian, Chinese, English, Russian or German. It answers in the language you used." },
      { title: "Hand off the busywork", body: "Ask for code, a form, a message or a calendar event, or say \"open Spotify\". With Aspire Desktop it can open apps, type and save files on your computer after you allow it. It says \"On it, sir\" and drafts it for you to check." },
      { title: "It learns how you live", body: "It remembers your stops, routines and preferences, so answers get shorter and closer to what you need." },
      { title: "Reach it from your chat apps", body: "Link Telegram, Discord or Slack and ask from there." },
      {
        title: "Your memory stays on your device",
        body: "Your memory and settings are stored on your device. A copy goes to the cloud only when you link a chat app or your computer. Your account is handled by Clerk.",
      },
    ],
    howTitle: "How it works",
    steps: [
      { title: "Sign in", body: "It takes a moment." },
      { title: "Allow your location", body: "Aspire finds your city, or you can name one." },
      { title: "Ask out loud", body: "Tap the microphone and ask. Or type, if you prefer." },
    ],
    citiesTitle: "Built in Erdenet, works everywhere",
    erdenet: {
      title: "Erdenet",
      body: "Aspire reads the city's live bus positions and estimates arrival times from them.",
    },
    world: {
      title: "Every other city",
      body: "Weather, air quality, maps, news, and public transit where open data exists. Coverage depends on what each city publishes.",
    },
    faqTitle: "Questions",
    faq: [
      { q: "Is it free?", a: "Free during the Orkhon Hackathon." },
      {
        q: "What happens to my data?",
        a: "Your memory, reminders and settings are stored on your device. To answer you, your question goes to our servers and to the AI and speech services named in the privacy policy (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). A copy goes to the cloud only when you link a chat app or your computer. Your account is handled by Clerk. The privacy policy has the details.",
      },
      {
        q: "Which languages does it speak?",
        a: "Mongolian, Chinese, English, Russian and German, by voice and by text. Switch any time and it follows you.",
      },
    ],
    privacy: "Privacy",
    terms: "Terms",
    legal: "Legal",
    built: "Built at the Orkhon Hackathon 2026, Erdenet",
  },
  mn: {
    skip: "Агуулга руу шилжих",
    langLabel: "Хэл",
    signIn: "Нэвтрэх",
    eyebrow: "Таны хотын дуут туслах",
    title: "Таны хот, яг одоо.",
    lead: "Aspire-аас юу ч асуу — автобус, цаг агаар, замын хөдөлгөөн, мэдээ — монгол, англи, хятад, орос, герман хэлээр дуугаар.",
    cta: "Эхлэх",
    how: "Хэрхэн ажилладгийг үзэх",
    mock: {
      city: "Эрдэнэт",
      note: "Жишээ зураг, бодит мэдээлэл биш",
      sky: "Цэлмэг",
      bus: "3-р автобус",
      mins: "4 мин",
      ask: "Миний автобус хэзээ ирэх вэ?",
      label: "Aspire-ийн дэлгэцийн жишээ зураг",
    },
    featuresTitle: "Юу хийдэг вэ",
    features: [
      { title: "Хотоо яг одоо мэд", body: "Автобус, замын хөдөлгөөн, агаарын чанар нэг дэлгэцэнд. Эрдэнэт, Лондон, Сингапур, Хонконг, Калифорниа, Шинэ Зеландын гудамжны шууд камер, таны ойролцоох YouTube шууд дамжуулалт." },
      { title: "Өөрийн хэлээр ярь", body: "Монгол, хятад, англи, орос, герман хэлээр ярь. Таны ярьсан хэлээр хариулна." },
      { title: "Ажлаа даатга", body: "Код, маягт, мессеж эсвэл хуанлийн үйл явдал хүс, эсвэл «Spotify нээ» гэж хэл. Aspire Desktop-оор таны зөвшөөрлөөр компьютер дээр апп нээж, бичиж, файл хадгална. «Одоо хийнэ, ноёнтон» гээд таныг шалгахаар бэлтгэж өгнө." },
      { title: "Таныг ойлгож сурна", body: "Таны буудал, өдөр тутмын хэмнэл, сонголтыг санаж, хариулт улам товч, оновчтой болно." },
      { title: "Чат апп-аас ашигла", body: "Telegram, Discord эсвэл Slack-ээ холбоод тэндээсээ асуу." },
      {
        title: "Санах ой тань төхөөрөмж дээр үлдэнэ",
        body: "Санах ой, тохиргоо тань төхөөрөмж дээрээ хадгалагдана. Чат апп эсвэл компьютераа холбосон үед л хуулбар нь үүлэнд хадгалагдана. Таны бүртгэлийг Clerk хариуцна.",
      },
    ],
    howTitle: "Хэрхэн ажилладаг вэ",
    steps: [
      { title: "Нэвтэр", body: "Хэдхэн хормын ажил." },
      { title: "Байршлаа зөвшөөр", body: "Aspire таны хотыг олно, эсвэл хотынхоо нэрийг хэлж болно." },
      { title: "Чангаар асуу", body: "Микрофон дээр дараад асуу. Эсвэл бичиж болно." },
    ],
    citiesTitle: "Эрдэнэтэд бүтсэн, хаана ч ажиллана",
    erdenet: {
      title: "Эрдэнэт",
      body: "Aspire хотын автобусны шууд байршлыг уншиж, ирэх хугацааг түүнээс тооцоолдог.",
    },
    world: {
      title: "Бусад бүх хот",
      body: "Цаг агаар, агаарын чанар, газрын зураг, мэдээ, нээлттэй өгөгдөл байгаа газар нийтийн тээвэр. Хамрах хүрээ нь хот бүрийн нийтэлдэг өгөгдлөөс хамаарна.",
    },
    faqTitle: "Түгээмэл асуулт",
    faq: [
      { q: "Үнэгүй юу?", a: "Орхон Хакатоны үеэр үнэгүй." },
      {
        q: "Миний мэдээлэлд юу тохиолдох вэ?",
        a: "Санах ой, сануулга, тохиргоо тань төхөөрөмж дээр хадгалагдана. Хариулахын тулд асуултыг тань манай сервер болон нууцлалын бодлогод нэрлэсэн хиймэл оюун, ярианы үйлчилгээ (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs) рүү илгээнэ. Чат апп эсвэл компьютераа холбосон үед л хуулбар нь үүлэнд хадгалагдана. Таны бүртгэлийг Clerk хариуцна. Дэлгэрэнгүйг нууцлалын бодлогоос уншина уу.",
      },
      {
        q: "Ямар хэлээр ярьдаг вэ?",
        a: "Монгол, хятад, англи, орос, герман хэлээр, дуу болон бичвэрээр. Хүссэн үедээ хэлээ сольж болно, Aspire дагаад солигдоно.",
      },
    ],
    privacy: "Нууцлал",
    terms: "Үйлчилгээний нөхцөл",
    legal: "Эрх зүйн мэдээлэл",
    built: "Орхон Хакатон 2026, Эрдэнэт хотод бүтээв",
  },
  zh: {
    skip: "跳到正文",
    langLabel: "语言",
    signIn: "登录",
    eyebrow: "你所在城市的语音助手",
    title: "你的城市，此时此刻。",
    lead: "向 Aspire 问任何事——实时公交、天气、交通、新闻——用蒙古语、英语、中文、俄语或德语开口即可。",
    cta: "开始使用",
    how: "了解工作原理",
    mock: {
      city: "额尔登特",
      note: "示意图，非实时数据",
      sky: "晴",
      bus: "3 路公交",
      mins: "4 分钟",
      ask: "我的公交车什么时候到？",
      label: "Aspire 界面示意图",
    },
    featuresTitle: "它能做什么",
    features: [
      { title: "随时掌握城市动态", body: "实时公交、交通和空气质量一屏尽览，还有额尔登特、伦敦、新加坡、香港、加州和新西兰的实时街道摄像头，以及您附近的 YouTube 直播。" },
      { title: "用你自己的语言说话", body: "说蒙古语、中文、英语、俄语或德语，它会用你说的语言回答。" },
      { title: "把琐事交给它", body: "让它写代码、填表、写消息或添加日程，或者说“打开 Spotify”。配合 Aspire Desktop，经你允许后它还能在电脑上打开应用、输入文字和保存文件。它会说“马上办，先生”，并起草好供你确认。" },
      { title: "越用越懂你", body: "它会记住你常用的车站、作息和偏好，回答越来越简洁贴切。" },
      { title: "在聊天应用里也能用", body: "绑定 Telegram、Discord 或 Slack，直接在那里提问。" },
      {
        title: "你的记忆留在你的设备上",
        body: "你的记忆和设置保存在你的设备上。只有绑定聊天应用或你的电脑后，才会在云端保存一份副本。你的账户由 Clerk 管理。",
      },
    ],
    howTitle: "如何使用",
    steps: [
      { title: "登录", body: "只需片刻。" },
      { title: "允许定位", body: "Aspire 会找到你所在的城市，你也可以直接说出城市名。" },
      { title: "开口提问", body: "点一下麦克风就能问，也可以打字。" },
    ],
    citiesTitle: "诞生于额尔登特，全球可用",
    erdenet: {
      title: "额尔登特",
      body: "Aspire 读取全市公交的实时位置，并据此估算到站时间。",
    },
    world: {
      title: "其他所有城市",
      body: "天气、空气质量、地图、新闻，以及有开放数据地区的公共交通。覆盖范围取决于各城市公开的数据。",
    },
    faqTitle: "常见问题",
    faq: [
      { q: "免费吗？", a: "鄂尔浑黑客马拉松期间免费。" },
      {
        q: "我的数据会怎样？",
        a: "你的记忆、提醒和设置保存在你的设备上。为了回答你，你的提问会发送到我们的服务器以及隐私政策中列出的 AI 和语音服务（Anthropic、DeepSeek、Google、Microsoft、ElevenLabs）。只有绑定聊天应用或你的电脑后，才会在云端保存一份副本。你的账户由 Clerk 管理。详情请阅读隐私政策。",
      },
      {
        q: "支持哪些语言？",
        a: "蒙古语、中文、英语、俄语和德语，语音和文字均可。随时切换，它会跟着你。",
      },
    ],
    privacy: "隐私政策",
    terms: "服务条款",
    legal: "法律信息",
    built: "诞生于 2026 鄂尔浑黑客马拉松，额尔登特",
  },
  ru: {
    skip: "Перейти к содержимому",
    langLabel: "Язык",
    signIn: "Войти",
    eyebrow: "Голосовой помощник для вашего города",
    title: "Ваш город — прямо сейчас.",
    lead: "Спросите Aspire о чём угодно — автобусы в реальном времени, погода, пробки, новости — голосом на монгольском, английском, китайском, русском или немецком.",
    cta: "Начать",
    how: "Как это работает",
    mock: {
      city: "Эрдэнэт",
      note: "Иллюстрация, не реальные данные",
      sky: "Ясно",
      bus: "Автобус 3",
      mins: "4 мин",
      ask: "Когда мой автобус?",
      label: "Набросок экрана Aspire",
    },
    featuresTitle: "Что он умеет",
    features: [
      { title: "Город как на ладони", body: "Автобусы, пробки и качество воздуха на одном экране, а ещё уличные камеры онлайн в Эрдэнэте, Лондоне, Сингапуре, Гонконге, Калифорнии и Новой Зеландии и прямые трансляции YouTube рядом с вами." },
      { title: "Говорите на своём языке", body: "Монгольский, китайский, английский, русский или немецкий. Ответ придёт на языке вашего вопроса." },
      { title: "Поручите рутину", body: "Попросите код, форму, сообщение или событие в календаре, или скажите «открой Spotify». С Aspire Desktop он с вашего разрешения откроет приложения, наберёт текст и сохранит файлы на компьютере. Он ответит «Уже делаю, сэр» и подготовит черновик для проверки." },
      { title: "Он узнаёт вас", body: "Запоминает ваши остановки, распорядок и предпочтения, и ответы становятся короче и точнее." },
      { title: "Работает в мессенджерах", body: "Подключите Telegram, Discord или Slack и спрашивайте оттуда." },
      {
        title: "Ваша память остаётся на устройстве",
        body: "Память и настройки хранятся на вашем устройстве. Копия попадает в облако, только если вы подключили мессенджер или компьютер. Учётной записью занимается Clerk.",
      },
    ],
    howTitle: "Как это работает",
    steps: [
      { title: "Войдите", body: "Это займёт мгновение." },
      { title: "Разрешите геолокацию", body: "Aspire определит ваш город, или назовите его сами." },
      { title: "Спросите вслух", body: "Нажмите на микрофон и спросите. Или напишите." },
    ],
    citiesTitle: "Создан в Эрдэнэте, работает везде",
    erdenet: {
      title: "Эрдэнэт",
      body: "Aspire читает местоположение городских автобусов в реальном времени и по нему оценивает время прибытия.",
    },
    world: {
      title: "Все остальные города",
      body: "Погода, качество воздуха, карты, новости и общественный транспорт там, где есть открытые данные. Охват зависит от того, что публикует каждый город.",
    },
    faqTitle: "Вопросы",
    faq: [
      { q: "Это бесплатно?", a: "Бесплатно на время Орхон Хакатона." },
      {
        q: "Что происходит с моими данными?",
        a: "Память, напоминания и настройки хранятся на вашем устройстве. Для ответа ваш вопрос отправляется на наши серверы и в сервисы ИИ и речи, перечисленные в политике конфиденциальности (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). Копия попадает в облако, только если вы подключили мессенджер или компьютер. Учётной записью занимается Clerk. Подробнее в политике конфиденциальности.",
      },
      {
        q: "На каких языках он говорит?",
        a: "Монгольский, китайский, английский, русский и немецкий, голосом и текстом. Переключайтесь в любой момент, он подстроится.",
      },
    ],
    privacy: "Конфиденциальность",
    terms: "Условия",
    legal: "Правовая информация",
    built: "Создано на Орхон Хакатоне 2026, Эрдэнэт",
  },
  de: {
    skip: "Zum Inhalt springen",
    langLabel: "Sprache",
    signIn: "Anmelden",
    eyebrow: "Ein Sprachassistent für deine Stadt",
    title: "Deine Stadt, genau jetzt.",
    lead: "Frag Aspire alles — Busse live, Wetter, Verkehr, Nachrichten — per Stimme auf Mongolisch, Englisch, Chinesisch, Russisch oder Deutsch.",
    cta: "Loslegen",
    how: "So funktioniert es",
    mock: {
      city: "Erdenet",
      note: "Illustration, keine Live-Daten",
      sky: "Klar",
      bus: "Bus 3",
      mins: "4 Min.",
      ask: "Wann kommt mein Bus?",
      label: "Skizze des Aspire-Bildschirms",
    },
    featuresTitle: "Was es kann",
    features: [
      { title: "Deine Stadt im Blick", body: "Busse, Verkehr und Luftqualität live auf einem Bildschirm, dazu Live-Straßenkameras in Erdenet, London, Singapur, Hongkong, Kalifornien und Neuseeland und YouTube-Livestreams in Ihrer Nähe." },
      { title: "Sprich deine Sprache", body: "Mongolisch, Chinesisch, Englisch, Russisch oder Deutsch. Die Antwort kommt in der Sprache deiner Frage." },
      { title: "Gib Routinearbeit ab", body: "Bitte um Code, ein Formular, eine Nachricht oder einen Termin, oder sag „öffne Spotify“. Mit Aspire Desktop öffnet es nach deiner Freigabe Apps, tippt Text und speichert Dateien auf deinem Computer. Es antwortet „Wird erledigt, Sir“ und bereitet alles zur Prüfung vor." },
      { title: "Lernt dich kennen", body: "Es merkt sich deine Haltestellen, Gewohnheiten und Vorlieben, damit Antworten kürzer und passender werden." },
      { title: "Auch in deinen Chat-Apps", body: "Verbinde Telegram, Discord oder Slack und frag direkt dort." },
      {
        title: "Dein Gedächtnis bleibt auf deinem Gerät",
        body: "Gedächtnis und Einstellungen liegen auf deinem Gerät. Eine Kopie landet nur in der Cloud, wenn du eine Chat-App oder deinen Computer verbindest. Dein Konto verwaltet Clerk.",
      },
    ],
    howTitle: "So funktioniert es",
    steps: [
      { title: "Anmelden", body: "Dauert nur einen Moment." },
      { title: "Standort erlauben", body: "Aspire erkennt deine Stadt, oder du nennst sie selbst." },
      { title: "Laut fragen", body: "Tippe aufs Mikrofon und frag. Oder schreib einfach." },
    ],
    citiesTitle: "In Erdenet gebaut, überall nutzbar",
    erdenet: {
      title: "Erdenet",
      body: "Aspire liest die Live-Positionen der Busse in der Stadt und schätzt daraus die Ankunftszeiten.",
    },
    world: {
      title: "Jede andere Stadt",
      body: "Wetter, Luftqualität, Karten, Nachrichten und Nahverkehr, wo offene Daten existieren. Die Abdeckung hängt davon ab, was jede Stadt veröffentlicht.",
    },
    faqTitle: "Fragen",
    faq: [
      { q: "Ist es kostenlos?", a: "Kostenlos während des Orkhon Hackathons." },
      {
        q: "Was passiert mit meinen Daten?",
        a: "Gedächtnis, Erinnerungen und Einstellungen liegen auf deinem Gerät. Für die Antwort geht deine Frage an unsere Server und an die KI- und Sprachdienste aus der Datenschutzerklärung (Anthropic, DeepSeek, Google, Microsoft, ElevenLabs). Eine Kopie landet nur in der Cloud, wenn du eine Chat-App oder deinen Computer verbindest. Dein Konto verwaltet Clerk. Details stehen in der Datenschutzerklärung.",
      },
      {
        q: "Welche Sprachen spricht es?",
        a: "Mongolisch, Chinesisch, Englisch, Russisch und Deutsch, per Stimme und Text. Wechsle jederzeit, es folgt dir.",
      },
    ],
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    legal: "Rechtliches",
    built: "Gebaut beim Orkhon Hackathon 2026, Erdenet",
  },
};
