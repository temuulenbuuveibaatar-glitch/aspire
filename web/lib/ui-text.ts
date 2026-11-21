import type { Lang } from "@/lib/lang";

/** Morning 05-11, afternoon 12-17, evening 18-04 (in the place's time zone). There is no "Good night": it is a farewell. */
export type GreetingPart = "morning" | "afternoon" | "evening";

/** Jarvis greeting parts. Sentence 1 = hello + form of address; sentence 2 only on the first open of a session. */
export interface GreetingText {
  morning: string;
  afternoon: string;
  evening: string;
  /** Form of address for "mr" and "mrs" inside a greeting. */
  sir: string;
  madam: string;
  /** Sentence 2 on the first open when nothing notable is happening. */
  howIsItGoing: string;
}

/** One fact for the greeting's second sentence (spec 14.1). */
export interface NotableText {
  rain: string;
  snow: string;
  storm: string;
  air: string;
  traffic: string;
  bus: string;
}

/** v4 HUD: readouts, the location prompt, the map and the weather card. */
export interface HudText {
  /** Footer: "{n} of {m} sources answering". */
  status: string;
  /** Phone tab that jumps to the agent. */
  agent: string;
  approx: string;
  feels: string;
  today: string;
  whereTitle: string;
  whereWhy: string;
  allow: string;
  setCity: string;
  notNow: string;
  myCity: string;
  cityPlaceholder: string;
  cityHelp: string;
  voiceVia: string;
  noLocation: string;
  /** The browser refused or could not get a location fix. */
  denied: string;
  kinds: Record<"clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "snow" | "sleet" | "hail", string>;
}

// Short on-screen labels. The screen follows the language the person last spoke.
// No emojis, no arrow glyphs, no exclamation marks in greetings.
export const UI: Record<
  Lang,
  {
    repeat: string;
    voiceOffline: string;
    /** Said when speech-to-text is down (nothing was understood, so no answer exists yet). */
    voiceInputOffline: string;
    brainOffline: string;
    noMic: string;
    notHeard: string;
    error: string;
    consent: string;
    privacy: string;
    terms: string;
    /** Settings, Desktop: link to the Aspire Desktop download page. */
    desktopDownload: string;
    desktopDownloadHelp: string;
    memory: string;
    reminders: string;
    nothingSaved: string;
    remove: string;
    call: string;
    close: string;
    settings: string;
    voice: string;
    voiceJarvis: string;
    voiceFriday: string;
    address: string;
    addressMr: string;
    addressMrs: string;
    addressNone: string;
    voiceSample: string;
    tapOrSay: string;
    connections: string;
    learning: string;
    routines: string;
    sources: string;
    sendNow: string;
    sending: string;
    sent: string;
    sendFailed: string;
    retry: string;
    openGmail: string;
    otherMail: string;
    openSms: string;
    shareTelegram: string;
    addCalendar: string;
    openMaps: string;
    useLocation: string;
    newNumber: string;
    to: string;
    discordWebhook: string;
    slackWebhook: string;
    webhookHelp: string;
    save: string;
    invalidLink: string;
    alwaysOn: string;
    stop: string;
    newChat: string;
    menu: string;
    greeting: GreetingText;
    signInTitle: string;
    continueGoogle: string;
    emailLabel: string;
    codeLabel: string;
    codeSent: string;
    signOut: string;
    /** Memory sheet, Learning list: the lesson level and one readable progress line. */
    lessonLevel: Record<"beginner" | "intermediate" | "advanced", string>;
    lessonLine: string;
    connectGmail: string;
    gmailConnected: string;
    gmailNote: string;
    briefing: string;
    reconnectGmail: string;
    // Bot linking (components/aspire/BotLinks.tsx)
    botsTitle: string;
    botConsent: string;
    botLink: string;
    botConsentFirst: string;
    botTelegramHow: string;
    botOpenTelegram: string;
    botDiscordHow: string;
    botSlackHow: string;
    botGroupHow: string;
    botCodeExpires: string;
    botWaiting: string;
    botLinkedOk: string;
    botLinkedChats: string;
    botNoLinks: string;
    botPrimary: string;
    botUnlink: string;
    botDeleteCloud: string;
    botDeleteConfirm: string;
    botDeleted: string;
    botUnavailable: string;
    botAddSlack: string;
    botPrivateChat: string;
    botCopy: string;
    botCopied: string;
    botCancel: string;
    // v3 main screen (components/Assistant.tsx)
    skipToConversation: string;
    skipToMic: string;
    location: string;
    display: string;
    textSize: string;
    textNormal: string;
    textLarge: string;
    textLargest: string;
    calmMode: string;
    calmHelp: string;
    screenReaderMode: string;
    screenReaderHelp: string;
    /** Said when the browser blocked playback (no tap yet): the next tap on the orb plays it. */
    tapToHear: string;
    skyEffects: string;
    skyEffectsHelp: string;
    on: string;
    off: string;
    units: string;
    unitsAuto: string;
    unitsMetric: string;
    unitsImperial: string;
    startListening: string;
    stopListening: string;
    stopSpeaking: string;
    saved: string;
    daily: string;
    suggestionsLabel: string;
    language: string;
    /** Sentence 2 of the greeting when one thing is notable right now. `{route}` and `{n}` are filled in. */
    notable: NotableText;
    hud: HudText;
  }
> = {
  mn: {
    repeat: "Дахин сонсох",
    voiceOffline: "Дуу хоолой одоогоор ажиллахгүй байна. Хариулт ярианд байгаа бөгөөд дэлгэц уншигч үүнийг уншиж чадна.",
    voiceInputOffline: "Дуут оролт одоогоор ажиллахгүй байна. Асуултаа бичнэ үү.",
    brainOffline: "Туслах одоогоор холбогдоогүй байна.",
    noMic: "Микрофон ашиглах зөвшөөрөл өгнө үү.",
    notHeard: "Сонсогдсонгүй. Дахин дараад ярина уу.",
    error: "Алдаа гарлаа. Дахин оролдоно уу.",
    consent: "Таны дуу хоолойг зөвхөн асуултад хариулахад ашиглана. Хувийн мэдээллээ бүү хэлээрэй. Товчийг дарснаар та нөхцөлийг зөвшөөрч байна.",
    privacy: "Нууцлал",
    terms: "Нөхцөл",
    desktopDownload: "Aspire Desktop татах",
    desktopDownloadHelp: "GitHub дээрх Aspire Desktop-ийн татах хуудсыг нээнэ.",
    memory: "Санах ой",
    reminders: "Сануулга",
    nothingSaved: "Одоогоор юу ч хадгалаагүй.",
    remove: "Устгах",
    call: "Залгах",
    close: "Хаах",
    settings: "Тохиргоо",
    voice: "Дуу хоолой",
    voiceJarvis: "Jarvis (эрэгтэй)",
    voiceFriday: "Friday (эмэгтэй)",
    address: "Хэрхэн хандах",
    addressMr: "Ноён",
    addressMrs: "Хатагтай",
    addressNone: "Хэлэхгүй",
    voiceSample: "Таны үйлчилгээнд бэлэн байна.",
    tapOrSay: "Дараад ярь, эсвэл доор бичээрэй",
    connections: "Холболтууд",
    learning: "Сурч байгаа",
    routines: "Миний команд",
    sources: "Эх сурвалж",
    sendNow: "Илгээх",
    sending: "Илгээж байна…",
    sent: "Илгээгдлээ",
    sendFailed: "Илгээж чадсангүй",
    retry: "Дахин",
    openGmail: "Gmail-ээр нээх",
    otherMail: "Өөр шуудан",
    openSms: "SMS бичих",
    shareTelegram: "Найздаа Telegram-аар",
    addCalendar: "Календарьт нэмэх",
    openMaps: "Google Maps-д нээх",
    useLocation: "Чиглэл болон ойролцоох газрын хайлтад байршлаа ашиглах",
    newNumber: "Шинэ дугаар — залгахаасаа өмнө шалгаарай",
    to: "Хэнд",
    discordWebhook: "Discord сувгийн холбоос (webhook)",
    slackWebhook: "Slack сувгийн холбоос (webhook)",
    webhookHelp: "Discord: сервер тохиргоо > Integrations > Webhooks. Slack: Incoming Webhooks.",
    save: "Хадгалах",
    invalidLink: "Энэ холбоос буруу байна",
    alwaysOn: "SMS, дуудлага, имэйл ноорог үргэлж ажиллана — таны утасны апп нээгдэнэ.",
    stop: "Зогсоох",
    newChat: "Шинэ яриа",
    menu: "Цэс",
    greeting: { morning: "Өглөөний мэнд", afternoon: "Өдрийн мэнд", evening: "Оройн мэнд", sir: "эрхэм ээ", madam: "хатагтай", howIsItGoing: "Бүх зүйл сайн байна уу?" },
    signInTitle: "Нэвтрэх",
    continueGoogle: "Google-ээр үргэлжлүүлэх",
    emailLabel: "Имэйл хаяг",
    codeLabel: "6 оронтой код",
    codeSent: "Таны имэйл рүү нэвтрэх код илгээлээ.",
    signOut: "Гарах",
    lessonLevel: { beginner: "Анхан", intermediate: "Дунд", advanced: "Ахисан" },
    lessonLine: "{level}, {step}-р алхам, {score}%",
    connectGmail: "Gmail холбох",
    gmailConnected: "Gmail холбогдсон",
    gmailNote: "Зөвхөн уншина: Аспайр өглөөний мэдээ болон таны асуусан үед сүүлийн захидлын илгээгч, гарчиг, товч агуулгыг харна. Юу ч илгээхгүй, хадгалахгүй. Google \"баталгаажаагүй апп\" гэж анхааруулна: Advanced (Нэмэлт), дараа нь Continue (Үргэлжлүүлэх) дээр дарна уу.",
    briefing: "Өглөөний мэдээ",
    reconnectGmail: "Gmail дахин холбох",
    botsTitle: "Ботууд",
    botConsent: "Миний санах ой, сануулга, Gmail-ийг үүлэнд синк хийж, бот намайг төлөөлөн ажиллахыг зөвшөөрнө",
    botLink: "Холбох",
    botConsentFirst: "Эхлээд дээрх нүдийг чагтална уу.",
    botTelegramHow: "{bot} руу /start {code} гэж илгээнэ үү",
    botOpenTelegram: "Telegram нээх",
    botDiscordHow: "Discord дээр /aspire link code:{code} гэж бичнэ үү",
    botSlackHow: "Slack дээр Аспайр апп руу шууд мессежээр link {code} гэж илгээнэ үү",
    botGroupHow: "Telegram группт илгээлгэхийн тулд ботыг группт нэмээд тэнд /link {code} гэж илгээнэ үү.",
    botCodeExpires: "Код нэг удаа, 10 минутын турш хүчинтэй.",
    botWaiting: "Ботыг хүлээж байна…",
    botLinkedOk: "Холбогдлоо.",
    botLinkedChats: "Холбогдсон чатууд",
    botNoLinks: "Одоогоор холбогдсон чат алга.",
    botPrimary: "Сануулга энд ирнэ",
    botUnlink: "Салгах",
    botDeleteCloud: "Үүлэн дэх миний өгөгдлийг устгах",
    botDeleteConfirm: "Бүх чат, холбосон компьютерийг салгаж, үүлэн дэх санах ой, сануулга, тохиргоог устгана. Утсан дээрх хуулбар хэвээр үлдэнэ. Баталгаажуулахын тулд дахин дарна уу.",
    botDeleted: "Үүлэн дэх өгөгдөл устлаа.",
    botUnavailable: "Одоогоор холбох боломжгүй байна.",
    botAddSlack: "Slack-д нэмэх",
    botPrivateChat: "Хувийн чат",
    botCopy: "Код хуулах",
    botCopied: "Хуулагдлаа",
    botCancel: "Болих",
    skipToConversation: "Яриа руу шилжих",
    skipToMic: "Микрофон руу шилжих",
    location: "Байршил",
    display: "Дэлгэц",
    textSize: "Үсгийн хэмжээ",
    textNormal: "Энгийн",
    textLarge: "Том",
    textLargest: "Хамгийн том",
    calmMode: "Тайван горим",
    calmHelp: "Тэнгэр болон бөмбөлөг хөдөлгөөнгүй, анивчилтгүй, самбар тод.",
    screenReaderMode: "Дэлгэц уншигчийн горим",
    screenReaderHelp: "Хариулт бүрийг таны дэлгэц уншигч уншина. Aspire-ийн өөрийн дуу хоолой чимээгүй байна.",
    tapToHear: "Дуу тоглуулахыг хөтөч хаасан байна. Тоглуулахын тулд бөмбөлөг дээр дарна уу.",
    skyEffects: "Тэнгэрийн эффект",
    skyEffectsHelp: "Бодит цаг агаарыг дагах бороо, цас, үүл. Унтраавал хөдөлгөөнгүй өнгө харагдана.",
    on: "Асаалттай",
    off: "Унтраалттай",
    units: "Хэмжих нэгж",
    unitsAuto: "Автомат",
    unitsMetric: "Метр (°C, км/ц)",
    unitsImperial: "Англи (°F, mph)",
    startListening: "Сонсож эхлэх",
    stopListening: "Сонсохоо зогсоох",
    stopSpeaking: "Ярихаа зогсоох",
    saved: "Хадгалагдлаа",
    daily: "Өдөр бүр",
    suggestionsLabel: "Санал",
    language: "Хэл",
    notable: { rain: "Гадаа бороо орж байна.", snow: "Гадаа цас орж байна.", storm: "Гадаа аянгатай бороо орж байна.", air: "Өнөөдөр агаар эрүүл мэндэд хортой байна.", traffic: "Замын түгжрэл их байна.", bus: "{route} автобус ойролцоогоор {n} минутын дараа ирнэ (тооцоолол)." },
    hud: { status: "{m} эх сурвалжаас {n} нь хариу өгч байна", agent: "Асуух", approx: "ойролцоо", kinds: {"clear": "Цэлмэг", "partly": "Багавтар үүлтэй", "cloudy": "Үүлэрхэг", "fog": "Манан", "drizzle": "Шиврээ бороо", "rain": "Бороо", "storm": "Аадар", "snow": "Цас", "sleet": "Нойтон цас", "hail": "Мөндөр"}, feels: "Мэдрэгдэх {t}", today: "Өнөөдөр", whereTitle: "Та хаана байна вэ?", whereWhy: "Жарвис таны утасны нарийн байршлаар яг байгаа газрын цаг агаар, зураг, агаар, замын хөдөлгөөн, автобусыг харуулна. Байршлыг зөвхөн тухайн хүсэлтэд ашиглаж, хэзээ ч хадгалахгүй.", allow: "Нарийн байршлаа ашиглах", setCity: "Хотоо сонгох", notNow: "Одоо биш", myCity: "Миний хот", cityPlaceholder: "жишээ нь Эрдэнэт", cityHelp: "GPS унтраалттай эсвэл ажиллахгүй үед ашиглана.", voiceVia: "Дуу: {name}", noLocation: "Байршил тодорхойгүй", denied: "Байршил ашиглахыг зөвшөөрсөнгүй. Хотоо сонгоно уу." },
  },
  zh: {
    repeat: "再听一次",
    voiceOffline: "语音暂时离线。回答在对话中，您的屏幕阅读器可以朗读。",
    voiceInputOffline: "语音输入暂时离线。请输入您的问题。",
    brainOffline: "助手暂时未连接。",
    noMic: "请允许使用麦克风。",
    notHeard: "没听清，请再按一次说话。",
    error: "出错了，请再试一次。",
    consent: "您的声音只用于回答问题。请不要说出个人信息。按下按钮即表示您同意使用条款。",
    privacy: "隐私",
    terms: "条款",
    desktopDownload: "下载 Aspire Desktop",
    desktopDownloadHelp: "打开 GitHub 上的 Aspire Desktop 下载页面。",
    memory: "记忆",
    reminders: "提醒",
    nothingSaved: "还没有保存任何内容。",
    remove: "删除",
    call: "拨打",
    close: "关闭",
    settings: "设置",
    voice: "声音",
    voiceJarvis: "Jarvis（男声）",
    voiceFriday: "Friday（女声）",
    address: "称呼",
    addressMr: "先生",
    addressMrs: "女士",
    addressNone: "不用称呼",
    voiceSample: "随时为您效劳。",
    tapOrSay: "点一下说话，或在下面输入",
    connections: "连接",
    learning: "学习中",
    routines: "我的指令",
    sources: "来源",
    sendNow: "发送",
    sending: "发送中…",
    sent: "已发送",
    sendFailed: "发送失败",
    retry: "重试",
    openGmail: "在 Gmail 中打开",
    otherMail: "其他邮箱",
    openSms: "发短信",
    shareTelegram: "用 Telegram 分享",
    addCalendar: "添加到日历",
    openMaps: "在 Google 地图中打开",
    useLocation: "使用我的位置来查路线和附近地点",
    newNumber: "新号码，拨打前请确认",
    to: "收件人",
    discordWebhook: "Discord 频道 Webhook",
    slackWebhook: "Slack 频道 Webhook",
    webhookHelp: "Discord：服务器设置 > 集成 > Webhooks。Slack：Incoming Webhooks。",
    save: "保存",
    invalidLink: "链接无效",
    alwaysOn: "短信、电话和邮件草稿随时可用，会打开您手机上的应用。",
    stop: "停止",
    newChat: "新对话",
    menu: "菜单",
    greeting: { morning: "早上好", afternoon: "下午好", evening: "晚上好", sir: "先生", madam: "女士", howIsItGoing: "今天过得怎么样？" },
    signInTitle: "登录",
    continueGoogle: "使用 Google 继续",
    emailLabel: "邮箱地址",
    codeLabel: "6 位验证码",
    codeSent: "登录验证码已发送到您的邮箱。",
    signOut: "退出登录",
    lessonLevel: { beginner: "入门", intermediate: "中级", advanced: "高级" },
    lessonLine: "{level}，第 {step} 步，{score}%",
    connectGmail: "连接 Gmail",
    gmailConnected: "Gmail 已连接",
    gmailNote: "只读：Aspire 仅在早间简报或您提问时查看最近邮件的发件人、主题和简短预览，不会发送或保存任何内容。Google 会提示此应用尚未验证：请点“高级”（Advanced），再点“继续”（Continue）。",
    briefing: "今日简报",
    reconnectGmail: "重新连接 Gmail",
    botsTitle: "机器人",
    botConsent: "将我的记忆、提醒和 Gmail 同步到云端，让机器人可以代表我操作",
    botLink: "关联",
    botConsentFirst: "请先勾选上面的选项。",
    botTelegramHow: "向 {bot} 发送 /start {code}",
    botOpenTelegram: "打开 Telegram",
    botDiscordHow: "在 Discord 中输入 /aspire link code:{code}",
    botSlackHow: "在 Slack 中给 Aspire 应用发私信：link {code}",
    botGroupHow: "要让 Aspire 发送到 Telegram 群组：先把机器人加入群组，再在群里发送 /link {code}。",
    botCodeExpires: "代码只能使用一次，10 分钟内有效。",
    botWaiting: "等待机器人…",
    botLinkedOk: "已关联。",
    botLinkedChats: "已关联的聊天",
    botNoLinks: "还没有关联任何聊天。",
    botPrimary: "提醒发到这里",
    botUnlink: "取消关联",
    botDeleteCloud: "删除我的云端数据",
    botDeleteConfirm: "这会取消所有聊天和已配对电脑的关联，并删除云端的记忆、提醒和设置。手机上的副本会保留。再点一次确认。",
    botDeleted: "云端数据已删除。",
    botUnavailable: "暂时无法关联。",
    botAddSlack: "添加到 Slack",
    botPrivateChat: "私聊",
    botCopy: "复制代码",
    botCopied: "已复制",
    botCancel: "取消",
    skipToConversation: "跳到对话",
    skipToMic: "跳到麦克风",
    location: "位置",
    display: "显示",
    textSize: "字体大小",
    textNormal: "标准",
    textLarge: "大",
    textLargest: "特大",
    calmMode: "平静模式",
    calmHelp: "天空和光球保持静止，没有闪光，面板不透明。",
    screenReaderMode: "屏幕阅读器模式",
    screenReaderHelp: "由您的屏幕阅读器朗读每条回答，Aspire 自己的语音保持安静。",
    tapToHear: "浏览器阻止了播放。轻点光球即可播放。",
    skyEffects: "天空效果",
    skyEffectsHelp: "雨、雪和云会随实时天气变化。关闭后显示静态渐变。",
    on: "开",
    off: "关",
    units: "单位",
    unitsAuto: "自动",
    unitsMetric: "公制（°C、公里/时）",
    unitsImperial: "英制（°F、英里/时）",
    startListening: "开始聆听",
    stopListening: "停止聆听",
    stopSpeaking: "停止播放",
    saved: "已保存",
    daily: "每天",
    suggestionsLabel: "建议",
    language: "语言",
    notable: { rain: "外面正在下雨。", snow: "外面正在下雪。", storm: "外面有雷雨。", air: "今天的空气不利于健康。", traffic: "现在交通很拥堵。", bus: "{route}路公交车大约{n}分钟后到站（估计）。" },
    hud: { status: "{m} 个数据源中有 {n} 个在线", agent: "提问", approx: "大致", kinds: {"clear": "晴", "partly": "少云", "cloudy": "多云", "fog": "雾", "drizzle": "毛毛雨", "rain": "雨", "storm": "雷雨", "snow": "雪", "sleet": "雨夹雪", "hail": "冰雹"}, feels: "体感 {t}", today: "今天", whereTitle: "您在哪里？", whereWhy: "贾维斯会用手机的精确位置，显示您真正所在之处的天气、照片、空气、路况和公交。位置只用于每次请求，从不保存。", allow: "使用我的精确位置", setCity: "设置我的城市", notNow: "以后再说", myCity: "我的城市", cityPlaceholder: "例如 额尔登特", cityHelp: "在 GPS 关闭或不可用时使用。", voiceVia: "语音：{name}", noLocation: "位置未知", denied: "未获准使用位置。请设置您的城市。" },
  },
  en: {
    repeat: "Hear again",
    voiceOffline: "The voice is offline right now. The answer is in the conversation, and your screen reader can read it.",
    voiceInputOffline: "Voice input is offline right now. Please type your question.",
    brainOffline: "The assistant is not connected yet.",
    noMic: "Please allow the microphone.",
    notHeard: "I didn't hear anything. Press and speak again.",
    error: "Something went wrong. Please try again.",
    consent: "Your voice is only used to answer your question. Please don't share personal details. By pressing the button you agree to the terms.",
    privacy: "Privacy",
    terms: "Terms",
    desktopDownload: "Download Aspire Desktop",
    desktopDownloadHelp: "Opens the Aspire Desktop download page on GitHub.",
    memory: "Memory",
    reminders: "Reminders",
    nothingSaved: "Nothing saved yet.",
    remove: "Delete",
    call: "Call",
    close: "Close",
    settings: "Settings",
    voice: "Voice",
    voiceJarvis: "Jarvis (male)",
    voiceFriday: "Friday (female)",
    address: "Call me",
    addressMr: "Mr.",
    addressMrs: "Mrs.",
    addressNone: "No title",
    voiceSample: "At your service.",
    tapOrSay: "Tap and talk, or type below",
    connections: "Connections",
    learning: "Learning",
    routines: "My routines",
    sources: "Sources",
    sendNow: "Send",
    sending: "Sending…",
    sent: "Sent",
    sendFailed: "Couldn't send",
    retry: "Retry",
    openGmail: "Open in Gmail",
    otherMail: "Other mail app",
    openSms: "Text message",
    shareTelegram: "Share on Telegram",
    addCalendar: "Add to Google Calendar",
    openMaps: "Open in Google Maps",
    useLocation: "Use my location for directions and nearby places",
    newNumber: "New number — check before calling",
    to: "To",
    discordWebhook: "Discord channel webhook",
    slackWebhook: "Slack channel webhook",
    webhookHelp: "Discord: Server settings > Integrations > Webhooks. Slack: Incoming Webhooks app.",
    save: "Save",
    invalidLink: "That link doesn't look right",
    alwaysOn: "SMS, calls and email drafts always work — they open your phone's own apps.",
    stop: "Stop",
    newChat: "New chat",
    menu: "Menu",
    greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", sir: "sir", madam: "ma'am", howIsItGoing: "How is it going?" },
    signInTitle: "Sign in",
    continueGoogle: "Continue with Google",
    emailLabel: "Email address",
    codeLabel: "6-digit code",
    codeSent: "We sent a sign-in code to your email.",
    signOut: "Sign out",
    lessonLevel: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
    lessonLine: "{level}, step {step}, {score}%",
    connectGmail: "Connect Gmail",
    gmailConnected: "Gmail connected",
    gmailNote: "Read-only: Aspire looks at the sender, subject and a short preview of recent mail for your morning briefing or when you ask. Nothing is sent or stored. Google will say the app isn't verified yet: tap Advanced, then Continue.",
    briefing: "Briefing",
    reconnectGmail: "Reconnect Gmail",
    botsTitle: "Bots",
    botConsent: "Sync my memory, reminders and Gmail to the cloud so the bot can act as me",
    botLink: "Link",
    botConsentFirst: "Tick the box above first.",
    botTelegramHow: "Send /start {code} to {bot}",
    botOpenTelegram: "Open Telegram",
    botDiscordHow: "In Discord, type /aspire link code:{code}",
    botSlackHow: "In Slack, send the Aspire app a direct message: link {code}",
    botGroupHow: "To let Aspire send to a Telegram group: add the bot to the group, then send /link {code} there.",
    botCodeExpires: "The code works once, for 10 minutes.",
    botWaiting: "Waiting for the bot…",
    botLinkedOk: "Linked.",
    botLinkedChats: "Linked chats",
    botNoLinks: "No chats linked yet.",
    botPrimary: "Reminders go here",
    botUnlink: "Unlink",
    botDeleteCloud: "Delete my cloud data",
    botDeleteConfirm: "This unlinks every chat and paired computer and deletes your memory, reminders and settings from the cloud. Your phone keeps its copy. Tap again to confirm.",
    botDeleted: "Cloud data deleted.",
    botUnavailable: "Linking is not available right now.",
    botAddSlack: "Add to Slack",
    botPrivateChat: "Private chat",
    botCopy: "Copy code",
    botCopied: "Copied",
    botCancel: "Cancel",
    skipToConversation: "Skip to conversation",
    skipToMic: "Skip to the microphone",
    location: "Location",
    display: "Display",
    textSize: "Text size",
    textNormal: "Normal",
    textLarge: "Large",
    textLargest: "Largest",
    calmMode: "Calm mode",
    calmHelp: "Still sky and orb, no flashes, solid panels.",
    screenReaderMode: "Screen reader mode",
    screenReaderHelp: "Your screen reader reads each answer. Aspire's own voice stays quiet.",
    tapToHear: "Playback was blocked. Tap the orb to play it.",
    skyEffects: "Sky effects",
    skyEffectsHelp: "Rain, snow and clouds that follow the live weather. Off shows a still gradient.",
    on: "On",
    off: "Off",
    units: "Units",
    unitsAuto: "Automatic",
    unitsMetric: "Metric (°C, km/h)",
    unitsImperial: "Imperial (°F, mph)",
    startListening: "Start listening",
    stopListening: "Stop listening",
    stopSpeaking: "Stop speaking",
    saved: "Saved",
    daily: "Every day",
    suggestionsLabel: "Suggestions",
    language: "Language",
    notable: { rain: "It is raining outside.", snow: "It is snowing outside.", storm: "There is a thunderstorm outside.", air: "The air is unhealthy today.", traffic: "The traffic is heavy.", bus: "Bus {route} is about {n} minutes from your stop (estimate)." },
    hud: { status: "{n} of {m} sources answering", agent: "Ask", approx: "approx.", kinds: {"clear": "Clear", "partly": "Partly cloudy", "cloudy": "Cloudy", "fog": "Fog", "drizzle": "Drizzle", "rain": "Rain", "storm": "Thunderstorm", "snow": "Snow", "sleet": "Sleet", "hail": "Hail"}, feels: "Feels like {t}", today: "Today", whereTitle: "Where are you?", whereWhy: "Jarvis uses your phone's precise location for the weather, photo, air, traffic and buses where you really are. It is used only for each request and never stored.", allow: "Use my precise location", setCity: "Set my city", notNow: "Not now", myCity: "My city", cityPlaceholder: "e.g. Erdenet", cityHelp: "Used when GPS is off or not available.", voiceVia: "Voice: {name}", noLocation: "Location unknown", denied: "Location access was refused. Set your city instead." },
  },
  ru: {
    repeat: "Повторить",
    voiceOffline: "Голос сейчас недоступен. Ответ есть в разговоре, и ваша программа чтения с экрана может его прочитать.",
    voiceInputOffline: "Голосовой ввод сейчас недоступен. Пожалуйста, напечатайте вопрос.",
    brainOffline: "Помощник пока не подключён.",
    noMic: "Разрешите доступ к микрофону.",
    notHeard: "Не расслышал. Нажмите и скажите ещё раз.",
    error: "Произошла ошибка. Попробуйте ещё раз.",
    consent: "Ваш голос используется только для ответа. Не называйте личные данные. Нажимая кнопку, вы соглашаетесь с условиями.",
    privacy: "Конфиденциальность",
    terms: "Условия",
    desktopDownload: "Скачать Aspire Desktop",
    desktopDownloadHelp: "Откроет страницу загрузки Aspire Desktop на GitHub.",
    memory: "Память",
    reminders: "Напоминания",
    nothingSaved: "Пока ничего не сохранено.",
    remove: "Удалить",
    call: "Позвонить",
    close: "Закрыть",
    settings: "Настройки",
    voice: "Голос",
    voiceJarvis: "Jarvis (мужской)",
    voiceFriday: "Friday (женский)",
    address: "Обращение",
    addressMr: "Господин",
    addressMrs: "Госпожа",
    addressNone: "Без обращения",
    voiceSample: "К вашим услугам.",
    tapOrSay: "Нажмите и говорите или напишите ниже",
    connections: "Подключения",
    learning: "Обучение",
    routines: "Мои команды",
    sources: "Источники",
    sendNow: "Отправить",
    sending: "Отправка…",
    sent: "Отправлено",
    sendFailed: "Не удалось отправить",
    retry: "Повторить",
    openGmail: "Открыть в Gmail",
    otherMail: "Другая почта",
    openSms: "Написать SMS",
    shareTelegram: "Отправить в Telegram",
    addCalendar: "Добавить в календарь",
    openMaps: "Открыть в Google Картах",
    useLocation: "Использовать моё местоположение для маршрутов и мест рядом",
    newNumber: "Новый номер — проверьте перед звонком",
    to: "Кому",
    discordWebhook: "Webhook канала Discord",
    slackWebhook: "Webhook канала Slack",
    webhookHelp: "Discord: настройки сервера > Интеграция > Вебхуки. Slack: Incoming Webhooks.",
    save: "Сохранить",
    invalidLink: "Неверная ссылка",
    alwaysOn: "SMS, звонки и черновики писем работают всегда — открываются приложения телефона.",
    stop: "Стоп",
    newChat: "Новый разговор",
    menu: "Меню",
    greeting: { morning: "Доброе утро", afternoon: "Добрый день", evening: "Добрый вечер", sir: "сэр", madam: "мадам", howIsItGoing: "Как ваши дела?" },
    signInTitle: "Вход",
    continueGoogle: "Продолжить с Google",
    emailLabel: "Адрес эл. почты",
    codeLabel: "6-значный код",
    codeSent: "Мы отправили код для входа на вашу почту.",
    signOut: "Выйти",
    lessonLevel: { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" },
    lessonLine: "{level}, шаг {step}, {score}%",
    connectGmail: "Подключить Gmail",
    gmailConnected: "Gmail подключён",
    gmailNote: "Только чтение: Аспайр смотрит отправителя, тему и краткий текст последних писем для утренней сводки или когда вы спрашиваете. Ничего не отправляется и не хранится. Google предупредит, что приложение не проверено: нажмите «Дополнительные настройки» (Advanced), затем «Перейти» (Continue).",
    briefing: "Сводка",
    reconnectGmail: "Переподключить Gmail",
    botsTitle: "Боты",
    botConsent: "Синхронизировать мою память, напоминания и Gmail с облаком, чтобы бот мог действовать от моего имени",
    botLink: "Привязать",
    botConsentFirst: "Сначала отметьте пункт выше.",
    botTelegramHow: "Отправьте /start {code} боту {bot}",
    botOpenTelegram: "Открыть Telegram",
    botDiscordHow: "В Discord введите /aspire link code:{code}",
    botSlackHow: "В Slack отправьте приложению Aspire личное сообщение: link {code}",
    botGroupHow: "Чтобы Аспайр мог писать в группу Telegram: добавьте бота в группу и отправьте там /link {code}.",
    botCodeExpires: "Код действует один раз, 10 минут.",
    botWaiting: "Ждём бота…",
    botLinkedOk: "Привязано.",
    botLinkedChats: "Привязанные чаты",
    botNoLinks: "Пока нет привязанных чатов.",
    botPrimary: "Напоминания приходят сюда",
    botUnlink: "Отвязать",
    botDeleteCloud: "Удалить мои данные из облака",
    botDeleteConfirm: "Все чаты и подключённые компьютеры будут отвязаны, а память, напоминания и настройки удалены из облака. Копия на телефоне останется. Нажмите ещё раз для подтверждения.",
    botDeleted: "Данные в облаке удалены.",
    botUnavailable: "Привязка сейчас недоступна.",
    botAddSlack: "Добавить в Slack",
    botPrivateChat: "Личный чат",
    botCopy: "Скопировать код",
    botCopied: "Скопировано",
    botCancel: "Отмена",
    skipToConversation: "Перейти к разговору",
    skipToMic: "Перейти к микрофону",
    location: "Местоположение",
    display: "Экран",
    textSize: "Размер текста",
    textNormal: "Обычный",
    textLarge: "Крупный",
    textLargest: "Самый крупный",
    calmMode: "Спокойный режим",
    calmHelp: "Небо и сфера неподвижны, без вспышек, плотные панели.",
    screenReaderMode: "Режим программы чтения с экрана",
    screenReaderHelp: "Каждый ответ читает ваша программа чтения с экрана. Собственный голос Aspire молчит.",
    tapToHear: "Воспроизведение заблокировано. Нажмите на сферу, чтобы воспроизвести.",
    skyEffects: "Эффекты неба",
    skyEffectsHelp: "Дождь, снег и облака по текущей погоде. Если выключить, будет неподвижный градиент.",
    on: "Вкл.",
    off: "Выкл.",
    units: "Единицы",
    unitsAuto: "Автоматически",
    unitsMetric: "Метрические (°C, км/ч)",
    unitsImperial: "Имперские (°F, миль/ч)",
    startListening: "Начать слушать",
    stopListening: "Остановить запись",
    stopSpeaking: "Остановить речь",
    saved: "Сохранено",
    daily: "Каждый день",
    suggestionsLabel: "Подсказки",
    language: "Язык",
    notable: { rain: "На улице идёт дождь.", snow: "На улице идёт снег.", storm: "На улице гроза.", air: "Сегодня воздух вреден для здоровья.", traffic: "На дорогах сильные пробки.", bus: "Автобус {route} будет примерно через {n} мин (оценка)." },
    hud: { status: "Отвечают {n} из {m} источников", agent: "Спросить", approx: "примерно", kinds: {"clear": "Ясно", "partly": "Переменная облачность", "cloudy": "Облачно", "fog": "Туман", "drizzle": "Морось", "rain": "Дождь", "storm": "Гроза", "snow": "Снег", "sleet": "Мокрый снег", "hail": "Град"}, feels: "Ощущается как {t}", today: "Сегодня", whereTitle: "Где вы?", whereWhy: "Джарвис использует точное местоположение телефона, чтобы показывать погоду, фото, воздух, пробки и автобусы там, где вы на самом деле. Оно нужно только для каждого запроса и никогда не сохраняется.", allow: "Использовать точное местоположение", setCity: "Указать мой город", notNow: "Не сейчас", myCity: "Мой город", cityPlaceholder: "например, Эрдэнэт", cityHelp: "Используется, когда GPS выключен или недоступен.", voiceVia: "Голос: {name}", noLocation: "Местоположение неизвестно", denied: "Доступ к местоположению запрещён. Укажите ваш город." },
  },
  de: {
    repeat: "Nochmal hören",
    voiceOffline: "Die Stimme ist gerade offline. Die Antwort steht im Gespräch, und Ihr Screenreader kann sie vorlesen.",
    voiceInputOffline: "Die Spracheingabe ist gerade offline. Bitte tippen Sie Ihre Frage.",
    brainOffline: "Der Assistent ist noch nicht verbunden.",
    noMic: "Bitte erlauben Sie das Mikrofon.",
    notHeard: "Ich habe nichts gehört. Bitte drücken und noch einmal sprechen.",
    error: "Etwas ist schiefgelaufen. Bitte noch einmal versuchen.",
    consent: "Ihre Stimme wird nur für die Antwort verwendet. Bitte nennen Sie keine persönlichen Daten. Mit dem Drücken stimmen Sie den Bedingungen zu.",
    privacy: "Datenschutz",
    terms: "Bedingungen",
    desktopDownload: "Aspire Desktop herunterladen",
    desktopDownloadHelp: "Öffnet die Download-Seite von Aspire Desktop auf GitHub.",
    memory: "Gedächtnis",
    reminders: "Erinnerungen",
    nothingSaved: "Noch nichts gespeichert.",
    remove: "Löschen",
    call: "Anrufen",
    close: "Schließen",
    settings: "Einstellungen",
    voice: "Stimme",
    voiceJarvis: "Jarvis (männlich)",
    voiceFriday: "Friday (weiblich)",
    address: "Anrede",
    addressMr: "Herr",
    addressMrs: "Frau",
    addressNone: "Ohne Anrede",
    voiceSample: "Stets zu Diensten.",
    tapOrSay: "Tippen und sprechen oder unten schreiben",
    connections: "Verbindungen",
    learning: "Lernen",
    routines: "Meine Routinen",
    sources: "Quellen",
    sendNow: "Senden",
    sending: "Wird gesendet…",
    sent: "Gesendet",
    sendFailed: "Senden fehlgeschlagen",
    retry: "Erneut",
    openGmail: "In Gmail öffnen",
    otherMail: "Andere Mail-App",
    openSms: "SMS schreiben",
    shareTelegram: "Über Telegram teilen",
    addCalendar: "Zum Kalender",
    openMaps: "In Google Maps öffnen",
    useLocation: "Meinen Standort für Routen und Orte in der Nähe verwenden",
    newNumber: "Neue Nummer – vor dem Anruf prüfen",
    to: "An",
    discordWebhook: "Discord-Kanal-Webhook",
    slackWebhook: "Slack-Kanal-Webhook",
    webhookHelp: "Discord: Servereinstellungen > Integrationen > Webhooks. Slack: Incoming Webhooks.",
    save: "Speichern",
    invalidLink: "Dieser Link ist ungültig",
    alwaysOn: "SMS, Anrufe und E-Mail-Entwürfe gehen immer – sie öffnen die Apps Ihres Telefons.",
    stop: "Stopp",
    newChat: "Neuer Chat",
    menu: "Menü",
    greeting: { morning: "Guten Morgen", afternoon: "Guten Tag", evening: "Guten Abend", sir: "Sir", madam: "gnädige Frau", howIsItGoing: "Wie geht es Ihnen?" },
    signInTitle: "Anmelden",
    continueGoogle: "Weiter mit Google",
    emailLabel: "E-Mail-Adresse",
    codeLabel: "6-stelliger Code",
    codeSent: "Wir haben Ihnen einen Anmeldecode per E-Mail geschickt.",
    signOut: "Abmelden",
    lessonLevel: { beginner: "Anfänger", intermediate: "Mittelstufe", advanced: "Fortgeschritten" },
    lessonLine: "{level}, Schritt {step}, {score} %",
    connectGmail: "Gmail verbinden",
    gmailConnected: "Gmail verbunden",
    gmailNote: "Nur lesen: Aspire sieht Absender, Betreff und eine kurze Vorschau neuer Mails für Ihr Morgen-Briefing oder wenn Sie fragen. Nichts wird gesendet oder gespeichert. Google meldet, dass die App noch nicht überprüft ist: Tippen Sie auf „Erweitert“ (Advanced) und dann auf „Weiter“ (Continue).",
    briefing: "Briefing",
    reconnectGmail: "Gmail neu verbinden",
    botsTitle: "Bots",
    botConsent: "Mein Gedächtnis, meine Erinnerungen und Gmail in die Cloud synchronisieren, damit der Bot für mich handeln kann",
    botLink: "Verknüpfen",
    botConsentFirst: "Bitte zuerst das Kästchen oben ankreuzen.",
    botTelegramHow: "Senden Sie /start {code} an {bot}",
    botOpenTelegram: "Telegram öffnen",
    botDiscordHow: "Geben Sie in Discord /aspire link code:{code} ein",
    botSlackHow: "Senden Sie der Aspire-App in Slack eine Direktnachricht: link {code}",
    botGroupHow: "Damit Aspire in eine Telegram-Gruppe senden kann: Bot zur Gruppe hinzufügen und dort /link {code} senden.",
    botCodeExpires: "Der Code gilt einmal, 10 Minuten lang.",
    botWaiting: "Warte auf den Bot…",
    botLinkedOk: "Verknüpft.",
    botLinkedChats: "Verknüpfte Chats",
    botNoLinks: "Noch keine Chats verknüpft.",
    botPrimary: "Erinnerungen kommen hierher",
    botUnlink: "Trennen",
    botDeleteCloud: "Meine Cloud-Daten löschen",
    botDeleteConfirm: "Alle Chats und gekoppelten Computer werden getrennt und Gedächtnis, Erinnerungen und Einstellungen aus der Cloud gelöscht. Die Kopie auf dem Telefon bleibt. Zum Bestätigen erneut tippen.",
    botDeleted: "Cloud-Daten gelöscht.",
    botUnavailable: "Verknüpfen ist gerade nicht möglich.",
    botAddSlack: "Zu Slack hinzufügen",
    botPrivateChat: "Privater Chat",
    botCopy: "Code kopieren",
    botCopied: "Kopiert",
    botCancel: "Abbrechen",
    skipToConversation: "Zum Gespräch springen",
    skipToMic: "Zum Mikrofon springen",
    location: "Standort",
    display: "Anzeige",
    textSize: "Textgröße",
    textNormal: "Normal",
    textLarge: "Groß",
    textLargest: "Sehr groß",
    calmMode: "Ruhemodus",
    calmHelp: "Ruhiger Himmel und ruhige Kugel, keine Blitze, feste Flächen.",
    screenReaderMode: "Screenreader-Modus",
    screenReaderHelp: "Ihr Screenreader liest jede Antwort vor. Die eigene Stimme von Aspire bleibt still.",
    tapToHear: "Die Wiedergabe wurde blockiert. Tippen Sie auf die Kugel, um sie abzuspielen.",
    skyEffects: "Himmelseffekte",
    skyEffectsHelp: "Regen, Schnee und Wolken nach dem aktuellen Wetter. Aus zeigt einen ruhigen Farbverlauf.",
    on: "An",
    off: "Aus",
    units: "Einheiten",
    unitsAuto: "Automatisch",
    unitsMetric: "Metrisch (°C, km/h)",
    unitsImperial: "Imperial (°F, mph)",
    startListening: "Zuhören starten",
    stopListening: "Zuhören beenden",
    stopSpeaking: "Sprechen beenden",
    saved: "Gespeichert",
    daily: "Täglich",
    suggestionsLabel: "Vorschläge",
    language: "Sprache",
    notable: { rain: "Draußen regnet es.", snow: "Draußen schneit es.", storm: "Draußen ist ein Gewitter.", air: "Die Luft ist heute ungesund.", traffic: "Es ist viel Verkehr.", bus: "Bus {route} kommt in etwa {n} Minuten (Schätzung)." },
    hud: { status: "{n} von {m} Quellen antworten", agent: "Fragen", approx: "ungefähr", kinds: {"clear": "Klar", "partly": "Teils bewölkt", "cloudy": "Bewölkt", "fog": "Nebel", "drizzle": "Nieselregen", "rain": "Regen", "storm": "Gewitter", "snow": "Schnee", "sleet": "Schneeregen", "hail": "Hagel"}, feels: "Gefühlt {t}", today: "Heute", whereTitle: "Wo sind Sie?", whereWhy: "Jarvis nutzt den genauen Standort Ihres Telefons für Wetter, Foto, Luft, Verkehr und Busse dort, wo Sie wirklich sind. Er dient nur der jeweiligen Anfrage und wird nie gespeichert.", allow: "Genauen Standort verwenden", setCity: "Meine Stadt festlegen", notNow: "Nicht jetzt", myCity: "Meine Stadt", cityPlaceholder: "z. B. Erdenet", cityHelp: "Wird genutzt, wenn GPS aus oder nicht verfügbar ist.", voiceVia: "Stimme: {name}", noLocation: "Standort unbekannt", denied: "Standortzugriff abgelehnt. Bitte Stadt festlegen." },
  },
};

/** Part of the day for a local hour (0-23). Late night counts as evening. */
export function greetingPart(hour: number): GreetingPart {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  return "evening";
}

/**
 * The short Jarvis greeting, e.g. "Good evening, sir. How is it going?".
 * `title` is the saved form of address ("" = none); `first` adds sentence 2 (first open of a session).
 * `name` (optional) is the person's first name, used instead of the title when they chose it.
 * It never lists capabilities and is shown and spoken identically.
 */
export function jarvisGreeting(lang: Lang, part: GreetingPart, title: "mr" | "mrs" | "" = "", first = true, name = ""): string {
  const g = UI[lang].greeting;
  const given = name.replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  const who = given || (title === "mr" ? g.sir : title === "mrs" ? g.madam : "");
  const cjk = lang === "zh";
  const hello = who ? `${g[part]}${cjk ? "\uFF0C" : ", "}${who}${cjk ? "\u3002" : "."}` : `${g[part]}${cjk ? "\u3002" : "."}`;
  return first ? `${hello}${cjk ? "" : " "}${g.howIsItGoing}` : hello;
}
