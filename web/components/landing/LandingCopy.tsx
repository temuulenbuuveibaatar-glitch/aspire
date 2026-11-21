// Every string on the public homepage, in the 5 app languages. Plain data, no JSX, so the
// server component and its metadata share one source. No emojis, no arrow glyphs.
import type { Lang } from "@/lib/lang";

type Pair = { title: string; body: string };
type Qa = { q: string; a: string };
type Plan = { name: string; points: string[] };

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
  // Pricing. Prices are not in the copy: Landing.tsx fills `{price}` in `after` from its PRICES table.
  pricingTitle: string;
  pricingLead: string;
  hackathon: string;
  hackathonBody: string;
  freePrice: string;
  freeNow: string;
  after: string;
  plans: [Plan, Plan, Plan];
  own: Plan & { price: string; cta: string };
  selfTitle: string;
  selfLead: string;
  self: [Pair, Pair, Pair];
  download: string;
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
      { title: "Know your city right now", body: "Live buses, traffic, weather, air quality and local news on one screen, with live street cameras in Erdenet, London, Singapore, Hong Kong, California and New Zealand, and YouTube live streams near you." },
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
    pricingTitle: "Pricing",
    pricingLead: "Cloud plans run on our accounts with Claude, Azure Speech, ElevenLabs and Supabase. Bring your own keys and Aspire stays free.",
    hackathon: "Free during the Orkhon Hackathon",
    hackathonBody: "Every cloud plan costs nothing while the hackathon runs. The prices show what Pro and Ultra will cost after it.",
    freePrice: "Free",
    freeNow: "Free now",
    after: "{price} a month after the hackathon",
    plans: [
      { name: "Free", points: ["20 questions a day", "Standard voice"] },
      { name: "Pro", points: ["1,500 questions a month", "2 hours of ElevenLabs voice a month", "Desktop actions with Aspire Desktop"] },
      { name: "Ultra", points: ["5,000 questions a month", "8 hours of ElevenLabs voice a month", "Desktop actions with Aspire Desktop", "Priority access"] },
    ],
    own: {
      name: "Self-hosted or own keys",
      price: "Free forever",
      points: ["Your own Claude or OpenAI key", "Your own Azure or AWS for voice and hosting", "Local Qwen2.5 1.5B model in Aspire Desktop", "The server on your own machine"],
      cta: "Run it yourself",
    },
    selfTitle: "Run it yourself",
    selfLead: "Aspire does not need our servers. With your own keys, a local model or your own machine, it costs nothing.",
    self: [
      {
        title: "Aspire Desktop for Windows and macOS",
        body: "Pair it with your account and Aspire can open websites and apps on your computer, each time only after you allow it. It includes a local Qwen2.5 1.5B model that runs on your computer.",
      },
      { title: "Your own keys", body: "Add your own Claude or OpenAI key, and your own Azure or AWS account for speech. You pay those providers directly." },
      { title: "Your own server", body: "Run the Aspire server on your own computer or cloud account, with a local model if you like." },
    ],
    download: "Download Aspire Desktop",
    faqTitle: "Questions",
    faq: [
      { q: "Is it free?", a: "Free during the Orkhon Hackathon. After it, the Free plan stays free, and running Aspire with your own keys is free forever." },
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
      { title: "Хотоо яг одоо мэд", body: "Автобус, замын хөдөлгөөн, цаг агаар, агаарын чанар, орон нутгийн мэдээ нэг дэлгэцэнд. Эрдэнэт, Лондон, Сингапур, Хонконг, Калифорниа, Шинэ Зеландын гудамжны шууд камер, таны ойролцоох YouTube шууд дамжуулалт." },
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
    pricingTitle: "Үнэ",
    pricingLead: "Үүлэн багцууд манай Claude, Azure Speech, ElevenLabs, Supabase бүртгэлээр ажиллана. Өөрийн түлхүүрээ ашиглавал Aspire үнэгүй хэвээр.",
    hackathon: "Орхон Хакатоны үеэр үнэгүй",
    hackathonBody: "Хакатон үргэлжлэх хугацаанд бүх үүлэн багц үнэгүй. Доорх үнэ нь Pro, Ultra багцын хакатоны дараах үнэ.",
    freePrice: "Үнэгүй",
    freeNow: "Одоо үнэгүй",
    after: "Хакатоны дараа сард {price}",
    plans: [
      { name: "Үнэгүй", points: ["Өдөрт 20 асуулт", "Энгийн дуу хоолой"] },
      { name: "Pro", points: ["Сард 1,500 асуулт", "Сард 2 цаг ElevenLabs дуу хоолой", "Aspire Desktop-оор компьютер дээрх үйлдэл"] },
      { name: "Ultra", points: ["Сард 5,000 асуулт", "Сард 8 цаг ElevenLabs дуу хоолой", "Aspire Desktop-оор компьютер дээрх үйлдэл", "Тэргүүн ээлжийн хандалт"] },
    ],
    own: {
      name: "Өөрийн сервер, өөрийн түлхүүр",
      price: "Үүрд үнэгүй",
      points: ["Өөрийн Claude эсвэл OpenAI түлхүүр", "Дуу хоолой, байршуулалтад өөрийн Azure эсвэл AWS", "Aspire Desktop дахь локал Qwen2.5 1.5B загвар", "Өөрийн компьютер дээрх сервер"],
      cta: "Өөрөө ажиллуулах",
    },
    selfTitle: "Өөрөө ажиллуул",
    selfLead: "Aspire манай серверээс хамааралгүй ажиллаж чадна. Өөрийн түлхүүр, локал загвар эсвэл өөрийн компьютерээ ашиглавал үнэгүй.",
    self: [
      {
        title: "Windows, macOS-д зориулсан Aspire Desktop",
        body: "Бүртгэлтэйгээ холбоход Aspire таны компьютер дээр вэб сайт, апп нээж чадна, гэхдээ үргэлж таны зөвшөөрлөөр. Таны компьютер дээр ажилладаг локал Qwen2.5 1.5B загвартай.",
      },
      { title: "Өөрийн түлхүүр", body: "Өөрийн Claude эсвэл OpenAI түлхүүр, яриандаа өөрийн Azure эсвэл AWS бүртгэлийг нэм. Төлбөрөө тэдгээр үйлчилгээ үзүүлэгчид шууд төлнө." },
      { title: "Өөрийн сервер", body: "Aspire серверийг өөрийн компьютер эсвэл үүлэн бүртгэл дээрээ, хүсвэл локал загвартай ажиллуул." },
    ],
    download: "Aspire Desktop татах",
    faqTitle: "Түгээмэл асуулт",
    faq: [
      { q: "Үнэгүй юу?", a: "Орхон Хакатоны үеэр үнэгүй. Дараа нь ч үнэгүй багц үнэгүй хэвээр, өөрийн түлхүүрээр ажиллуулах нь үүрд үнэгүй." },
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
      { title: "随时掌握城市动态", body: "实时公交、交通、天气、空气质量和本地新闻一屏尽览，还有额尔登特、伦敦、新加坡、香港、加州和新西兰的实时街道摄像头，以及您附近的 YouTube 直播。" },
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
    pricingTitle: "价格",
    pricingLead: "云端方案使用我们的 Claude、Azure Speech、ElevenLabs 和 Supabase 账户运行。使用你自己的密钥，Aspire 一直免费。",
    hackathon: "鄂尔浑黑客马拉松期间免费",
    hackathonBody: "黑客马拉松期间，所有云端方案均免费。下方价格是 Pro 和 Ultra 在活动结束后的价格。",
    freePrice: "免费",
    freeNow: "现在免费",
    after: "黑客马拉松结束后每月 {price}",
    plans: [
      { name: "免费版", points: ["每天 20 个问题", "标准语音"] },
      { name: "Pro", points: ["每月 1500 个问题", "每月 2 小时 ElevenLabs 语音", "通过 Aspire Desktop 执行电脑操作"] },
      { name: "Ultra", points: ["每月 5000 个问题", "每月 8 小时 ElevenLabs 语音", "通过 Aspire Desktop 执行电脑操作", "优先使用"] },
    ],
    own: {
      name: "自托管或自带密钥",
      price: "永久免费",
      points: ["你自己的 Claude 或 OpenAI 密钥", "用你自己的 Azure 或 AWS 提供语音和托管", "Aspire Desktop 内置本地 Qwen2.5 1.5B 模型", "在你自己的电脑上运行服务器"],
      cta: "自行运行",
    },
    selfTitle: "自行运行",
    selfLead: "Aspire 不一定要用我们的服务器。使用你自己的密钥、本地模型或你自己的电脑，完全免费。",
    self: [
      {
        title: "Aspire Desktop，支持 Windows 和 macOS",
        body: "与你的账户配对后，Aspire 可以在你的电脑上打开网站和应用，每次都要先经你允许。它内置一个在你电脑上运行的本地 Qwen2.5 1.5B 模型。",
      },
      { title: "自带密钥", body: "添加你自己的 Claude 或 OpenAI 密钥，以及用于语音的 Azure 或 AWS 账户。费用直接付给这些服务商。" },
      { title: "自己的服务器", body: "在你自己的电脑或云账户上运行 Aspire 服务器，也可以搭配本地模型。" },
    ],
    download: "下载 Aspire Desktop",
    faqTitle: "常见问题",
    faq: [
      { q: "免费吗？", a: "鄂尔浑黑客马拉松期间免费。活动结束后，免费版仍然免费，用你自己的密钥运行 Aspire 永久免费。" },
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
      { title: "Город как на ладони", body: "Автобусы, пробки, погода, качество воздуха и местные новости на одном экране, а ещё уличные камеры онлайн в Эрдэнэте, Лондоне, Сингапуре, Гонконге, Калифорнии и Новой Зеландии и прямые трансляции YouTube рядом с вами." },
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
    pricingTitle: "Цены",
    pricingLead: "Облачные тарифы работают на наших аккаунтах Claude, Azure Speech, ElevenLabs и Supabase. Со своими ключами Aspire остаётся бесплатным.",
    hackathon: "Бесплатно на время Орхон Хакатона",
    hackathonBody: "Пока идёт хакатон, все облачные тарифы бесплатны. Цены показывают, сколько Pro и Ultra будут стоить после него.",
    freePrice: "Бесплатно",
    freeNow: "Сейчас бесплатно",
    after: "{price} в месяц после хакатона",
    plans: [
      { name: "Бесплатный", points: ["20 вопросов в день", "Стандартный голос"] },
      { name: "Pro", points: ["1 500 вопросов в месяц", "2 часа голоса ElevenLabs в месяц", "Действия на компьютере через Aspire Desktop"] },
      { name: "Ultra", points: ["5 000 вопросов в месяц", "8 часов голоса ElevenLabs в месяц", "Действия на компьютере через Aspire Desktop", "Приоритетный доступ"] },
    ],
    own: {
      name: "Свой сервер или свои ключи",
      price: "Бесплатно навсегда",
      points: ["Свой ключ Claude или OpenAI", "Свой Azure или AWS для голоса и хостинга", "Локальная модель Qwen2.5 1.5B в Aspire Desktop", "Сервер на вашем собственном компьютере"],
      cta: "Запустить у себя",
    },
    selfTitle: "Запустите у себя",
    selfLead: "Aspire может работать без наших серверов. Со своими ключами, локальной моделью или на своём компьютере это ничего не стоит.",
    self: [
      {
        title: "Aspire Desktop для Windows и macOS",
        body: "Свяжите его со своей учётной записью, и Aspire сможет открывать сайты и приложения на вашем компьютере, каждый раз только с вашего разрешения. В него встроена локальная модель Qwen2.5 1.5B, которая работает на вашем компьютере.",
      },
      { title: "Свои ключи", body: "Добавьте свой ключ Claude или OpenAI и свой аккаунт Azure или AWS для речи. Вы платите этим сервисам напрямую." },
      { title: "Свой сервер", body: "Запустите сервер Aspire на своём компьютере или в своём облаке, при желании с локальной моделью." },
    ],
    download: "Скачать Aspire Desktop",
    faqTitle: "Вопросы",
    faq: [
      { q: "Это бесплатно?", a: "Бесплатно на время Орхон Хакатона. После него бесплатный тариф останется бесплатным, а Aspire со своими ключами бесплатен навсегда." },
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
      { title: "Deine Stadt im Blick", body: "Busse, Verkehr, Wetter, Luftqualität und lokale Nachrichten live auf einem Bildschirm, dazu Live-Straßenkameras in Erdenet, London, Singapur, Hongkong, Kalifornien und Neuseeland und YouTube-Livestreams in deiner Nähe." },
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
    pricingTitle: "Preise",
    pricingLead: "Die Cloud-Tarife laufen über unsere Konten bei Claude, Azure Speech, ElevenLabs und Supabase. Mit eigenen Schlüsseln bleibt Aspire kostenlos.",
    hackathon: "Kostenlos während des Orkhon Hackathons",
    hackathonBody: "Solange der Hackathon läuft, kosten alle Cloud-Tarife nichts. Die Preise zeigen, was Pro und Ultra danach kosten.",
    freePrice: "Kostenlos",
    freeNow: "Jetzt kostenlos",
    after: "{price} pro Monat nach dem Hackathon",
    plans: [
      { name: "Kostenlos", points: ["20 Fragen pro Tag", "Standardstimme"] },
      { name: "Pro", points: ["1.500 Fragen pro Monat", "2 Stunden ElevenLabs-Stimme pro Monat", "Aktionen am Computer mit Aspire Desktop"] },
      { name: "Ultra", points: ["5.000 Fragen pro Monat", "8 Stunden ElevenLabs-Stimme pro Monat", "Aktionen am Computer mit Aspire Desktop", "Vorrangiger Zugang"] },
    ],
    own: {
      name: "Selbst gehostet oder eigene Schlüssel",
      price: "Für immer kostenlos",
      points: ["Dein eigener Claude- oder OpenAI-Schlüssel", "Dein eigenes Azure oder AWS für Stimme und Hosting", "Lokales Qwen2.5-1.5B-Modell in Aspire Desktop", "Der Server auf deinem eigenen Rechner"],
      cta: "Selbst betreiben",
    },
    selfTitle: "Selbst betreiben",
    selfLead: "Aspire braucht unsere Server nicht. Mit eigenen Schlüsseln, einem lokalen Modell oder deinem eigenen Rechner kostet es nichts.",
    self: [
      {
        title: "Aspire Desktop für Windows und macOS",
        body: "Verbinde es mit deinem Konto, dann kann Aspire Websites und Apps auf deinem Computer öffnen, jedes Mal erst nach deiner Freigabe. Es enthält ein lokales Qwen2.5-1.5B-Modell, das auf deinem Computer läuft.",
      },
      { title: "Eigene Schlüssel", body: "Trag deinen eigenen Claude- oder OpenAI-Schlüssel und dein Azure- oder AWS-Konto für Sprache ein. Du bezahlst diese Anbieter direkt." },
      { title: "Eigener Server", body: "Betreib den Aspire-Server auf deinem eigenen Rechner oder in deinem Cloud-Konto, auf Wunsch mit lokalem Modell." },
    ],
    download: "Aspire Desktop herunterladen",
    faqTitle: "Fragen",
    faq: [
      { q: "Ist es kostenlos?", a: "Kostenlos während des Orkhon Hackathons. Danach bleibt der kostenlose Tarif kostenlos, und Aspire mit eigenen Schlüsseln ist für immer kostenlos." },
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
