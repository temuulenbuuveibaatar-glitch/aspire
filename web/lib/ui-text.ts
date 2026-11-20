import type { Lang } from "@/lib/lang";

// Short on-screen labels. The screen follows the language the person last spoke.
export const UI: Record<
  Lang,
  {
    idle: string;
    listening: string;
    thinking: string;
    speaking: string;
    repeat: string;
    type: string;
    send: string;
    placeholder: string;
    voiceOffline: string;
    brainOffline: string;
    noMic: string;
    notHeard: string;
    error: string;
    you: string;
    consent: string;
    privacy: string;
    terms: string;
  }
> = {
  mn: {
    idle: "Дараад ярина уу",
    listening: "Сонсож байна…",
    thinking: "Бодож байна…",
    speaking: "Ярьж байна…",
    repeat: "Дахин сонсох",
    type: "Бичих",
    send: "Илгээх",
    placeholder: "Асуултаа бичнэ үү…",
    voiceOffline: "Дуу хоолойн систем одоогоор унтраалттай байна. Хариултыг дэлгэцнээс уншина уу.",
    brainOffline: "Туслах одоогоор холбогдоогүй байна.",
    noMic: "Микрофон ашиглах зөвшөөрөл өгнө үү.",
    notHeard: "Сонсогдсонгүй. Дахин дараад ярина уу.",
    error: "Алдаа гарлаа. Дахин оролдоно уу.",
    you: "Та",
    consent: "Таны дуу хоолойг зөвхөн асуултад хариулахад ашиглана. Хувийн мэдээллээ бүү хэлээрэй. Товчийг дарснаар та нөхцөлийг зөвшөөрч байна.",
    privacy: "Нууцлал",
    terms: "Нөхцөл",
  },
  zh: {
    idle: "按下说话",
    listening: "正在听…",
    thinking: "正在想…",
    speaking: "正在说…",
    repeat: "再听一次",
    type: "打字",
    send: "发送",
    placeholder: "请输入您的问题…",
    voiceOffline: "语音系统暂时离线，请看屏幕上的回答。",
    brainOffline: "助手暂时未连接。",
    noMic: "请允许使用麦克风。",
    notHeard: "没听清，请再按一次说话。",
    error: "出错了，请再试一次。",
    you: "您",
    consent: "您的声音只用于回答问题。请不要说出个人信息。按下按钮即表示您同意使用条款。",
    privacy: "隐私",
    terms: "条款",
  },
  en: {
    idle: "Press and speak",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    repeat: "Hear again",
    type: "Type",
    send: "Send",
    placeholder: "Type your question…",
    voiceOffline: "The voice engine is offline right now. Please read the answer on screen.",
    brainOffline: "The assistant is not connected yet.",
    noMic: "Please allow the microphone.",
    notHeard: "I didn't hear anything. Press and speak again.",
    error: "Something went wrong. Please try again.",
    you: "You",
    consent: "Your voice is only used to answer your question. Please don't share personal details. By pressing the button you agree to the terms.",
    privacy: "Privacy",
    terms: "Terms",
  },
  ru: {
    idle: "Нажмите и говорите",
    listening: "Слушаю…",
    thinking: "Думаю…",
    speaking: "Говорю…",
    repeat: "Повторить",
    type: "Написать",
    send: "Отправить",
    placeholder: "Напишите вопрос…",
    voiceOffline: "Голосовая система сейчас недоступна. Ответ на экране.",
    brainOffline: "Помощник пока не подключён.",
    noMic: "Разрешите доступ к микрофону.",
    notHeard: "Не расслышал. Нажмите и скажите ещё раз.",
    error: "Произошла ошибка. Попробуйте ещё раз.",
    you: "Вы",
    consent: "Ваш голос используется только для ответа. Не называйте личные данные. Нажимая кнопку, вы соглашаетесь с условиями.",
    privacy: "Конфиденциальность",
    terms: "Условия",
  },
  de: {
    idle: "Drücken und sprechen",
    listening: "Ich höre zu…",
    thinking: "Ich denke nach…",
    speaking: "Ich spreche…",
    repeat: "Nochmal hören",
    type: "Tippen",
    send: "Senden",
    placeholder: "Ihre Frage eingeben…",
    voiceOffline: "Die Sprachausgabe ist gerade offline. Die Antwort steht auf dem Bildschirm.",
    brainOffline: "Der Assistent ist noch nicht verbunden.",
    noMic: "Bitte erlauben Sie das Mikrofon.",
    notHeard: "Ich habe nichts gehört. Bitte drücken und noch einmal sprechen.",
    error: "Etwas ist schiefgelaufen. Bitte noch einmal versuchen.",
    you: "Sie",
    consent: "Ihre Stimme wird nur für die Antwort verwendet. Bitte nennen Sie keine persönlichen Daten. Mit dem Drücken stimmen Sie den Bedingungen zu.",
    privacy: "Datenschutz",
    terms: "Bedingungen",
  },
};
