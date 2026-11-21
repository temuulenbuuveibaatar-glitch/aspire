// Fixed lines the bots say (not AI answers), in all five languages.
import { isLang, type Lang } from "@/lib/lang";

export interface BotText {
  welcome: string;
  linked: string;
  linkUnavailable: string;
  linkUsage: string;
  didntHear: string;
  thinking: string;
  askUsage: string;
  call: string;
  /** Label for a message card rendered as text. */
  message: string;
  calendar: string;
  /** Discord/Slack messages are sent from the web app. */
  openApp: string;
  /** Appended once per chat for accounts that are not linked yet. */
  linkHint: string;
  /** Prefix for reminders the bot delivers. */
  reminder: string;
}

export const BOT_TEXT: Record<Lang, BotText> = {
  mn: {
    welcome:
      "Сайн байна уу, би Аспайр, таны AI туслах. Надаас текст эсвэл дуут мессежээр юу ч асууж болно. Аспайр бүртгэлээ холбохын тулд апп дээр Тохиргоо, Холболтууд руу орж, надад /link <код> илгээнэ үү.",
    linked: "Холбогдлоо. Одоо би энд таны Аспайр бүртгэлээр хариулна.",
    linkUnavailable:
      "Холбох боломж одоогоор алга, эсвэл энэ кодын хугацаа дууссан. Аспайр апп-ын Тохиргоо, Холболтууд хэсгээс шинэ код аваарай.",
    linkUsage: "Аспайр апп-ын Тохиргоо, Холболтууд хэсгийн 10 тэмдэгттэй кодыг хамт илгээнэ үү.",
    didntHear: "Уучлаарай, тэр дуут мессежээс юу ч сонсож чадсангүй.",
    thinking: "Бодож байна…",
    askUsage: "Надаас юу ч асуугаарай: /aspire <асуулт>. Бүртгэлээ холбох: /aspire link <код>.",
    call: "Залгах",
    message: "Илгээх мессеж",
    calendar: "Календарьт нэмэх",
    openApp: "Илгээхийн тулд Аспайр апп-ыг нээнэ үү.",
    linkHint: "Аспайр бүртгэлээ холбоорой: апп дээр Тохиргоо, Холболтууд руу орно уу.",
    reminder: "Сануулга",
  },
  zh: {
    welcome:
      "你好，我是 Aspire，你的 AI 助手。可以用文字或语音消息问我任何问题。要关联你的 Aspire 账户，请在应用中打开 设置中的连接，然后发送 /link <代码>。",
    linked: "已关联。现在我会以你的 Aspire 账户在这里回答。",
    linkUnavailable: "暂时还不能关联，或者这个代码已过期。请在 Aspire 的 设置中的连接 中获取新代码。",
    linkUsage: "请附上 Aspire 设置中的连接 中的 10 位代码。",
    didntHear: "对不起，我没听清那条语音消息。",
    thinking: "思考中…",
    askUsage: "问我任何问题：/aspire <问题>。关联账户：/aspire link <代码>。",
    call: "拨打",
    message: "待发送消息",
    calendar: "添加到日历",
    openApp: "请打开 Aspire 应用发送。",
    linkHint: "关联你的 Aspire 账户：在应用中打开 设置中的连接。",
    reminder: "提醒",
  },
  en: {
    welcome:
      "Hi, I'm Aspire, your AI assistant. Ask me anything by text or voice message. To link your Aspire account, open Settings, Connections in the app and send me /link <code>.",
    linked: "Linked. I'll now answer here as your Aspire account.",
    linkUnavailable:
      "Linking isn't available yet, or this code has expired. Get a new code in Aspire: Settings, Connections.",
    linkUsage: "Please include the 10-character code from Aspire: Settings, Connections.",
    didntHear: "Sorry, I couldn't hear anything in that voice message.",
    thinking: "Thinking…",
    askUsage: "Ask me anything: /aspire <question>. Link your account: /aspire link <code>.",
    call: "Call",
    message: "Message to send",
    calendar: "Add to calendar",
    openApp: "Open the Aspire app to send it.",
    linkHint: "Link your Aspire account: open Settings, Connections in the app.",
    reminder: "Reminder",
  },
  ru: {
    welcome:
      "Здравствуйте, я Аспайр, ваш ИИ-помощник. Спрашивайте что угодно текстом или голосовым сообщением. Чтобы привязать аккаунт Аспайр, откройте в приложении Настройки, Подключения и отправьте мне /link <код>.",
    linked: "Готово, аккаунт привязан. Теперь я отвечаю здесь от имени вашего аккаунта Аспайр.",
    linkUnavailable:
      "Привязка пока недоступна или срок действия кода истёк. Получите новый код в Аспайр: Настройки, Подключения.",
    linkUsage: "Пожалуйста, укажите 10-значный код из Аспайр: Настройки, Подключения.",
    didntHear: "Извините, я ничего не расслышал в этом голосовом сообщении.",
    thinking: "Думаю…",
    askUsage: "Спросите что угодно: /aspire <вопрос>. Привязать аккаунт: /aspire link <код>.",
    call: "Позвонить",
    message: "Сообщение для отправки",
    calendar: "Добавить в календарь",
    openApp: "Откройте приложение Аспайр, чтобы отправить.",
    linkHint: "Привяжите аккаунт Аспайр: откройте в приложении Настройки, Подключения.",
    reminder: "Напоминание",
  },
  de: {
    welcome:
      "Hallo, ich bin Aspire, Ihr KI-Assistent. Fragen Sie mich alles per Text oder Sprachnachricht. Um Ihr Aspire-Konto zu verknüpfen, öffnen Sie in der App Einstellungen, Verbindungen und senden Sie mir /link <Code>.",
    linked: "Verknüpft. Ich antworte hier jetzt als Ihr Aspire-Konto.",
    linkUnavailable:
      "Die Verknüpfung ist noch nicht verfügbar, oder dieser Code ist abgelaufen. Einen neuen Code erhalten Sie in Aspire unter Einstellungen, Verbindungen.",
    linkUsage: "Bitte geben Sie den 10-stelligen Code aus Aspire an: Einstellungen, Verbindungen.",
    didntHear: "Entschuldigung, ich konnte in dieser Sprachnachricht nichts verstehen.",
    thinking: "Einen Moment…",
    askUsage: "Fragen Sie mich alles: /aspire <Frage>. Konto verknüpfen: /aspire link <Code>.",
    call: "Anrufen",
    message: "Nachricht zum Senden",
    calendar: "Zum Kalender hinzufügen",
    openApp: "Öffnen Sie die Aspire-App, um sie zu senden.",
    linkHint: "Verknüpfen Sie Ihr Aspire-Konto: in der App unter Einstellungen, Verbindungen.",
    reminder: "Erinnerung",
  },
};

export const botText = (lang: Lang): BotText => BOT_TEXT[lang];

/** "ru", "zh-CN", "en-US" (Telegram/Discord user locale) -> one of our languages. */
export function langFromLocale(locale: string | null | undefined, fallback: Lang = "en"): Lang {
  const code = (locale ?? "").slice(0, 2).toLowerCase();
  return isLang(code) ? code : fallback;
}
