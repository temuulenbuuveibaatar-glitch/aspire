"use client";

// The conversation, as a presentational component (design spec v3, section 10.1 and 10.2):
// the morning briefing above the thread, user and assistant messages, the tool ledger,
// sources, send-for-me, map, code, form and cameras cards, the thinking row, follow-the-stream scrolling with a
// "Jump to latest" pill, the reminder banner, and one sr-only live region for the newest reply.
// All state that matters (messages, phase, audio) lives in the shell; this file only renders.

import {
  ArrowDown,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  BookOpenCheck,
  Brain,
  Bus,
  Calculator,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
  Clock,
  ClipboardList,
  CloudSun,
  Code,
  Coins,
  Copy,
  Eraser,
  ExternalLink,
  FileText,
  Fuel,
  GraduationCap,
  ListChecks,
  ListPlus,
  ListX,
  LoaderCircle,
  Mail,
  MapPin,
  Music,
  Navigation,
  Newspaper,
  Phone,
  Play,
  RotateCw,
  Search,
  Send,
  SquareParking,
  TriangleAlert,
  Video,
  Volume2,
  Wind,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ActionCard, isCard } from "@/components/aspire/ActionCard";
import { BriefingCard } from "@/components/aspire/BriefingCard";
import { CAMERA_TEXT } from "@/components/aspire/CameraSheet";
import { MediaCard } from "@/components/aspire/MediaCard";
import { OpenAppCard } from "@/components/aspire/OpenAppCard";
import { TaskCard } from "@/components/aspire/TaskCard";
import { detectTextLanguage, HTML_LANG, type Lang, speechLang } from "@/lib/lang";
import type { Headline } from "@/lib/news";
import type { CameraAction, ClientAction, MediaAction, OpenAppAction, Reminder, TaskAction, Title } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------------------- */
/* Types                                                                                    */
/* ---------------------------------------------------------------------------------------- */

/** One tool the assistant ran for a reply. `icon` (legacy emoji from the server) is never rendered. */
export interface ChatStep {
  tool: string;
  label: string;
  ok: boolean;
  /** Legacy field from /api/ask; ignored. */
  icon?: string;
  /** Still running (shows a loader instead of Check / X). */
  pending?: boolean;
}

export interface ChatSource {
  title: string;
  url: string;
}

/** Structurally compatible with the shell's `Msg`. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  lang: Lang;
  steps?: ChatStep[];
  cards?: ClientAction[];
  sources?: ChatSource[];
  error?: boolean;
  /** The reply was cut off (barge-in): muted text plus an "Interrupted" label. */
  interrupted?: boolean;
}

export interface MessageListBriefing {
  text: string;
  lang: Lang;
  gmailError: boolean;
  headlines?: Headline[];
}

export interface MessageListProps {
  messages: ChatMessage[];
  /** Screen language (the language the person last spoke). */
  lang: Lang;
  /** Any phase other than idle: replay and retry are disabled. */
  busy: boolean;
  /** phase === "thinking": shows the thinking row under the last message. */
  thinking: boolean;
  /** Saved Discord / Slack webhooks, passed to the send-for-me cards. */
  webhooks: { discord?: string; slack?: string };
  /** Hear a reply again. */
  onReplay: (message: ChatMessage) => void;
  /** Opens Settings > Connections (send-for-me cards and the briefing's "Reconnect Gmail"). */
  onOpenConnections: () => void;
  /** Opens the camera sheet again for a find_cameras answer. Omit to hide those buttons. */
  onCameras?: (action: CameraAction) => void;
  /** Ask the same question again. Omit to hide every Retry button. */
  onRetry?: (question: ChatMessage, reply: ChatMessage) => void;
  /** Override copying (default: navigator.clipboard). */
  onCopy?: (message: ChatMessage) => void | Promise<void>;
  /** Form of address for "One moment, sir." Default "mr" (sir). */
  address?: Title;
  /** Morning briefing, shown above the thread exactly where v2 showed it. */
  briefing?: MessageListBriefing | null;
  onReplayBriefing?: () => void;
  /** Due reminder banner (fixed under the top bar, role="alert"). */
  alarm?: Reminder | null;
  onDismissAlarm?: () => void;
  /** Follow the stream: scroll to the newest message when the person is near the bottom. Default true. */
  autoScroll?: boolean;
  /** Render the sr-only live region with the newest reply. Default true. */
  announceReplies?: boolean;
  /** Reduced motion or Calm mode. Default: the OS setting. */
  reducedMotion?: boolean;
  /** id of the thread wrapper, the skip-link target. Default "aspire-thread". */
  id?: string;
  className?: string;
}

/* ---------------------------------------------------------------------------------------- */
/* Tool icons and labels (lucide only; step.icon is never shown)                              */
/* ---------------------------------------------------------------------------------------- */

/** Every tool in lib/tools/*.ts plus the provider's web_search and web_fetch. */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  get_calendar: CalendarDays,
  play_video: Play,
  play_music: Music,
  // connect.ts
  send_message: Send,
  call_phone: Phone,
  add_to_calendar: CalendarDays,
  // email.ts
  check_email: Mail,
  // learning.ts
  start_lesson: GraduationCap,
  save_progress: BookOpenCheck,
  save_routine: ListPlus,
  list_routines: ListChecks,
  delete_routine: ListX,
  // local.ts
  get_next_bus: Bus,
  plan_trip: Bus, // spec 10.1: transit is Bus (plan_trip is bus between two stops)
  // city.ts
  get_traffic: CarFront,
  get_parking: SquareParking,
  get_fuel: Fuel,
  // cameras.ts
  find_cameras: Video,
  get_local_time: Clock,
  set_reminder: Bell,
  list_reminders: BellRing,
  cancel_reminder: BellOff,
  remember: Brain,
  forget: Eraser,
  // maps.ts
  get_directions: Navigation,
  find_places: MapPin,
  // world.ts
  get_weather: CloudSun,
  get_air_quality: Wind,
  convert_currency: Coins,
  encyclopedia: BookOpen,
  calculate: Calculator,
  // news.ts, tasks.ts
  get_news: Newspaper,
  write_code: Code,
  fill_form: ClipboardList,
  // research (Claude server tools)
  web_search: Search,
  web_fetch: FileText,
};

export function toolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[tool] ?? Wrench;
}

type L5 = Record<Lang, string>;

/** Ledger labels in the message's language; unknown tools fall back to the server label. */
const TOOL_TEXT: Record<string, L5> = {
  send_message: { mn: "Мессежийн ноорог", zh: "消息草稿", en: "Message draft", ru: "Черновик сообщения", de: "Nachrichtenentwurf" },
  call_phone: { mn: "Утасны дуудлага", zh: "拨打电话", en: "Phone call", ru: "Звонок", de: "Anruf" },
  add_to_calendar: { mn: "Хуанли", zh: "日历", en: "Calendar", ru: "Календарь", de: "Kalender" },
  check_email: { mn: "Имэйл", zh: "邮件", en: "Email", ru: "Почта", de: "E-Mail" },
  start_lesson: { mn: "Хичээл", zh: "课程", en: "Lesson", ru: "Урок", de: "Lektion" },
  save_progress: { mn: "Хичээлийн явц", zh: "学习进度", en: "Lesson progress", ru: "Прогресс урока", de: "Lernfortschritt" },
  save_routine: { mn: "Горим хадгалах", zh: "保存流程", en: "Save routine", ru: "Сохранить сценарий", de: "Ablauf speichern" },
  list_routines: { mn: "Горимууд", zh: "流程列表", en: "Routines", ru: "Сценарии", de: "Abläufe" },
  delete_routine: { mn: "Горим устгах", zh: "删除流程", en: "Delete routine", ru: "Удалить сценарий", de: "Ablauf löschen" },
  get_next_bus: { mn: "Дараагийн автобус", zh: "下一班公交", en: "Next bus", ru: "Ближайший автобус", de: "Nächster Bus" },
  plan_trip: { mn: "Аялал төлөвлөх", zh: "行程规划", en: "Trip planner", ru: "План поездки", de: "Routenplanung" },
  get_traffic: { mn: "Замын хөдөлгөөн", zh: "实时路况", en: "Live traffic", ru: "Пробки сейчас", de: "Verkehr live" },
  get_parking: { mn: "Зогсоол", zh: "停车", en: "Parking", ru: "Парковки", de: "Parken" },
  get_fuel: { mn: "Шатахуун", zh: "加油", en: "Fuel", ru: "Топливо", de: "Tanken" },
  find_cameras: { mn: "Камер хайх", zh: "查找摄像头", en: "Finding cameras", ru: "Поиск камер", de: "Kameras suchen" },
  get_local_time: { mn: "Орон нутгийн цаг", zh: "当地时间", en: "Local time", ru: "Местное время", de: "Ortszeit" },
  set_reminder: { mn: "Сануулга тавих", zh: "设置提醒", en: "Set a reminder", ru: "Создать напоминание", de: "Erinnerung stellen" },
  list_reminders: { mn: "Сануулгууд", zh: "提醒列表", en: "Reminders", ru: "Напоминания", de: "Erinnerungen" },
  cancel_reminder: { mn: "Сануулга цуцлах", zh: "取消提醒", en: "Cancel reminder", ru: "Отмена напоминания", de: "Erinnerung löschen" },
  remember: { mn: "Санах ойд хадгалах", zh: "记住", en: "Remember", ru: "Запомнить", de: "Merken" },
  forget: { mn: "Мартах", zh: "忘记", en: "Forget", ru: "Забыть", de: "Vergessen" },
  get_directions: { mn: "Чиглэл", zh: "路线", en: "Directions", ru: "Маршрут", de: "Wegbeschreibung" },
  find_places: { mn: "Ойролцоох газрууд", zh: "附近地点", en: "Places nearby", ru: "Места рядом", de: "Orte in der Nähe" },
  get_weather: { mn: "Цаг агаар", zh: "天气", en: "Weather", ru: "Погода", de: "Wetter" },
  get_air_quality: { mn: "Агаарын чанар", zh: "空气质量", en: "Air quality", ru: "Качество воздуха", de: "Luftqualität" },
  convert_currency: { mn: "Ханш", zh: "汇率", en: "Exchange rate", ru: "Курс валют", de: "Wechselkurs" },
  encyclopedia: { mn: "Нэвтэрхий толь", zh: "百科", en: "Encyclopedia", ru: "Энциклопедия", de: "Lexikon" },
  calculate: { mn: "Тооцоолуур", zh: "计算器", en: "Calculator", ru: "Калькулятор", de: "Rechner" },
  web_search: { mn: "Вэб хайлт", zh: "网页搜索", en: "Web search", ru: "Поиск в интернете", de: "Websuche" },
  web_fetch: { mn: "Хуудас унших", zh: "阅读网页", en: "Reading page", ru: "Чтение страницы", de: "Seite lesen" },
  get_calendar: { mn: "Хуанли унших", zh: "查看日历", en: "Calendar", ru: "Календарь", de: "Kalender" },
  play_video: { mn: "Видео", zh: "视频", en: "Video", ru: "Видео", de: "Video" },
  play_music: { mn: "Хөгжим", zh: "音乐", en: "Music", ru: "Музыка", de: "Musik" },
  get_news: { mn: "Мэдээ", zh: "新闻", en: "News", ru: "Новости", de: "Nachrichten" },
  write_code: { mn: "Код бичих", zh: "编写代码", en: "Writing code", ru: "Пишу код", de: "Code schreiben" },
  fill_form: { mn: "Маягт бөглөх", zh: "填写表格", en: "Filling in a form", ru: "Заполняю форму", de: "Formular ausfüllen" },
};

/* ---------------------------------------------------------------------------------------- */
/* Strings owned by this component (all 5 languages)                                         */
/* ---------------------------------------------------------------------------------------- */

const TEXT: Record<
  Lang,
  {
    copy: string;
    copied: string;
    interrupted: string;
    jumpLatest: string;
    steps: string;
    stepDone: string;
    stepFailed: string;
    stepWorking: string;
    newTab: string;
    /** Speaker label read before the person's own messages (sr-only). */
    you: string;
    oneMoment: Record<"mr" | "mrs" | "none", string>;
  }
> = {
  mn: {
    copy: "Хуулах",
    copied: "Хуулсан",
    interrupted: "Тасалдсан",
    jumpLatest: "Сүүлийнх рүү",
    steps: "Хийсэн алхмууд",
    stepDone: "болсон",
    stepFailed: "амжилтгүй",
    stepWorking: "хийж байна",
    newTab: "шинэ цонхонд нээгдэнэ",
    you: "Та",
    oneMoment: { mr: "Түр хүлээнэ үү, эрхэм ээ.", mrs: "Түр хүлээнэ үү, хатагтай.", none: "Түр хүлээнэ үү." },
  },
  zh: {
    copy: "复制",
    copied: "已复制",
    interrupted: "已中断",
    jumpLatest: "跳到最新",
    steps: "执行的步骤",
    stepDone: "完成",
    stepFailed: "失败",
    stepWorking: "进行中",
    newTab: "在新标签页中打开",
    you: "您",
    oneMoment: { mr: "请稍候，先生。", mrs: "请稍候，女士。", none: "请稍候。" },
  },
  en: {
    copy: "Copy",
    copied: "Copied",
    interrupted: "Interrupted",
    jumpLatest: "Jump to latest",
    steps: "Steps taken",
    stepDone: "done",
    stepFailed: "failed",
    stepWorking: "working",
    newTab: "opens in a new tab",
    you: "You",
    oneMoment: { mr: "One moment, sir.", mrs: "One moment, ma'am.", none: "One moment." },
  },
  ru: {
    copy: "Копировать",
    copied: "Скопировано",
    interrupted: "Прервано",
    jumpLatest: "К последнему",
    steps: "Выполненные шаги",
    stepDone: "готово",
    stepFailed: "ошибка",
    stepWorking: "выполняется",
    newTab: "откроется в новой вкладке",
    you: "Вы",
    oneMoment: { mr: "Одну минуту, сэр.", mrs: "Одну минуту, мадам.", none: "Одну минуту." },
  },
  de: {
    copy: "Kopieren",
    copied: "Kopiert",
    interrupted: "Unterbrochen",
    jumpLatest: "Zum Neuesten",
    steps: "Ausgeführte Schritte",
    stepDone: "erledigt",
    stepFailed: "fehlgeschlagen",
    stepWorking: "läuft",
    newTab: "öffnet in neuem Tab",
    you: "Sie",
    oneMoment: { mr: "Einen Moment, Sir.", mrs: "Einen Moment, gnädige Frau.", none: "Einen Moment." },
  },
};

/* ---------------------------------------------------------------------------------------- */
/* Helpers                                                                                  */
/* ---------------------------------------------------------------------------------------- */

/** BCP 47 tag for the `lang` attribute (spec 4.1: Chinese is zh-Hans). */
const htmlLang = (l: Lang) => HTML_LANG[l] ?? "en";

// A message's `lang` comes from the server; never crash on an unexpected value.
const uiFor = (l: Lang) => UI[l] ?? UI.en;
const textFor = (l: Lang) => TEXT[l] ?? TEXT.en;

// Display-side guard for the no-emoji rule (spec 14.3); the server sanitises too.
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
const clean = (s: string | null | undefined) =>
  typeof s === "string" ? s.replace(PICTOGRAPHS, "").replace(/[ \t]{2,}/g, " ").trim() : "";

/** Only http(s) links leave the app; anything else (javascript:, data:, junk) is shown as text. */
function safeHref(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
const subscribeNothing = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;
const EXIT = { duration: 0.23 } as const;
const FADE = { duration: 0.15 } as const;
const NEAR_BOTTOM_PX = 80;

/* ---------------------------------------------------------------------------------------- */
/* Component                                                                                */
/* ---------------------------------------------------------------------------------------- */

export function MessageList({
  messages,
  lang,
  busy,
  thinking,
  webhooks,
  onReplay,
  onOpenConnections,
  onCameras,
  onRetry,
  onCopy,
  address,
  briefing,
  onReplayBriefing,
  alarm,
  onDismissAlarm,
  autoScroll = true,
  announceReplies = true,
  reducedMotion,
  id = "aspire-thread",
  className,
}: MessageListProps) {
  const osReduced = useReducedMotion();
  const portalReady = useSyncExternalStore(subscribeNothing, clientTrue, serverFalse);
  const reduced = reducedMotion ?? !!osReduced;
  const t = uiFor(lang);
  const s = textFor(lang);

  // ---- follow the stream ---------------------------------------------------------------
  // The sentinel carries a scroll-margin-bottom equal to the fixed composer's clearance, so
  // scrollIntoView never leaves the newest message hidden behind the composer, and "near the
  // bottom" is measured from that same resting position.
  const bottom = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  // While our own smooth scroll is still travelling, its scroll events must not read as
  // "the person scrolled away" (that would hide the next reply behind the pill).
  const programmaticUntil = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  const followNow = useCallback(() => {
    programmaticUntil.current = performance.now() + (reduced ? 100 : 900);
    nearBottom.current = true;
    bottom.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [reduced]);

  // The pill unmounts once used: focus moves to the newest message, not to <body>.
  const scrollToEnd = useCallback(() => {
    followNow();
    (list.current?.lastElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    setShowJump(false);
  }, [followNow]);

  useEffect(() => {
    // Read the composer clearance once (and on resize), never per scroll event; measure at most
    // once per frame so scrolling never forces style and layout work at event frequency.
    let clearance = 0;
    // Desktop (lg): the thread is its own scroll box inside the agent panel, with the composer,
    // model line and chips below it, so "near the bottom" is measured against that box, not the
    // window. Phones: the page scrolls, so the window is the reference.
    let box: HTMLElement | null = null;
    const readClearance = () => {
      const el = bottom.current;
      clearance = el ? parseFloat(getComputedStyle(el).scrollMarginBottom) || 0 : 0;
      const desktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
      box = desktop ? (el?.closest<HTMLElement>("[data-thread-scroll]") ?? null) : null;
    };
    readClearance();
    let ticking = false;
    const measureNow = () => {
      ticking = false;
      const el = bottom.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // Also near when the scroller cannot scroll any further and the sentinel is in view
      // (a shell with less bottom padding than the clearance never reaches the resting point).
      const scroller = box ?? document.scrollingElement ?? document.documentElement;
      const atEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 2;
      const limit = box ? Math.min(box.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight;
      const near = top - (limit - clearance) <= NEAR_BOTTOM_PX || (atEnd && top <= limit);
      if (!near && performance.now() < programmaticUntil.current) return;
      nearBottom.current = near;
      if (near) setShowJump(false);
    };
    const measure = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measureNow);
    };
    const onResize = () => {
      readClearance();
      measure();
    };
    // Capture: also hears scrolling inside any scroll container the shell may use.
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const last = messages[messages.length - 1];
  useEffect(() => {
    if (!autoScroll || (!last && !thinking)) return;
    // The person's own new question always brings the thread to the bottom.
    const follow = nearBottom.current || last?.role === "user";
    if (follow) followNow();
    setShowJump(!follow);
    // `reduced` is deliberately not a trigger: switching Calm mode must not move the thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, messages.length, thinking, autoScroll]);

  // Nothing to follow (cleared thread, or following turned off): never show a stale pill.
  const jumpVisible = showJump && autoScroll && (!!last || thinking);

  // ---- motion ----------------------------------------------------------------------------
  const enter = reduced ? { opacity: 0 } : { opacity: 0, y: 8 };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };
  const transition = reduced ? FADE : SPRING;

  // One pass: the newest assistant reply, and for each reply the question that preceded it.
  const { lastReply, questions } = useMemo(() => {
    const qs: (ChatMessage | undefined)[] = [];
    let q: ChatMessage | undefined;
    let reply: ChatMessage | undefined;
    for (const m of messages) {
      qs.push(q);
      if (m.role === "user") q = m;
      else reply = m;
    }
    return { lastReply: reply, questions: qs };
  }, [messages]);

  return (
    <div id={id} tabIndex={-1} className={cn("flex flex-col outline-none", className)}>
      {briefing && (
        <div className="mt-2">
          <BriefingCard
            text={clean(briefing.text)}
            t={t}
            onReplay={() => {
              if (!busy) onReplayBriefing?.();
            }}
            gmailError={briefing.gmailError}
            onReconnect={onOpenConnections}
            headlines={briefing.headlines}
            lang={briefing.lang}
            newTab={s.newTab}
          />
        </div>
      )}

      {/* ---- conversation (no aria-live here; the reply region below announces) ---- */}
      <ol ref={list} className="mt-2 flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((m, index) => (
            <motion.li
              key={m.id}
              lang={htmlLang(m.lang)}
              tabIndex={-1}
              initial={enter}
              animate={shown}
              exit={{ opacity: 0, transition: reduced ? FADE : EXIT }}
              transition={transition}
              className={cn("flex flex-col gap-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", m.role === "user" ? "items-end" : "items-stretch")}
            >
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-lg rounded-br-[6px] border border-line bg-panel-2 px-4 py-3 text-body whitespace-pre-line text-ink [overflow-wrap:anywhere]">
                  {/* In the message's language, like the li around it (WCAG 3.1.2). */}
                  <span className="sr-only">{textFor(m.lang).you}: </span>
                  {clean(m.text)}
                </p>
              ) : (
                <AssistantMessage
                  m={m}
                  t={uiFor(m.lang)}
                  s={textFor(m.lang)}
                  busy={busy}
                  reduced={reduced}
                  webhooks={webhooks}
                  question={questions[index]}
                  onReplay={onReplay}
                  onRetry={onRetry}
                  onCopy={onCopy}
                  onOpenConnections={onOpenConnections}
                  onCameras={onCameras}
                />
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {/* ---- thinking row ---- */}
      <AnimatePresence>
        {thinking && (
          <motion.div
            key="thinking"
            lang={htmlLang(lang)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: reduced ? FADE : EXIT }}
            transition={reduced ? FADE : SPRING}
            className="panel relative mt-4 overflow-hidden px-5 py-4"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-px overflow-hidden">
              {reduced ? (
                <span className="block h-px w-2/5 bg-accent opacity-60" />
              ) : (
                <motion.span
                  className="block h-px w-2/5 bg-accent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "250%" }}
                  transition={{ duration: 1.8, ease: "linear", repeat: Infinity }}
                />
              )}
            </span>
            <p className="text-body text-ink-muted">{s.oneMoment[address === "" ? "none" : (address ?? "mr")]}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* scroll-margin = the fixed composer's clearance (read back by the near-bottom check). Desktop: the
          thread scrolls inside the agent panel above its own composer, so only a small gap. */}
      <div ref={bottom} aria-hidden className="h-px scroll-mb-[calc(env(safe-area-inset-bottom)+7rem)] lg:scroll-mb-2" />

      {/* ---- the single reply live region (spec 13.2): newest finished reply only ----
          The region itself stays mounted; its child is keyed by message id so a new reply
          (even one with the same words) replaces the node and is announced once. */}
      {announceReplies && (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {lastReply && clean(lastReply.text) && (
            <p key={lastReply.id} lang={htmlLang(speechLang(clean(lastReply.text), lastReply.lang))}>
              {clean(lastReply.text)}
            </p>
          )}
        </div>
      )}

      {/* ---- jump to latest ---- */}
      <AnimatePresence>
        {jumpVisible && (
          <div
            key="jump"
            // Desktop: pinned to the bottom of the panel's thread region, not the middle of the page.
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+7rem)] z-[25] flex justify-center px-4 lg:sticky lg:bottom-2"
          >
            <motion.button
              type="button"
              onClick={scrollToEnd}
              aria-label={s.jumpLatest}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: reduced ? FADE : EXIT }}
              transition={reduced ? FADE : SPRING}
              className="press panel pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-body font-medium text-ink hover:bg-panel-3"
            >
              <ArrowDown className="size-5 shrink-0 text-accent" aria-hidden />
              {s.jumpLatest}
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* ---- reminder banner: portalled to <body>, outside the inert app root, so it is announced
          and its Close button works while a sheet is open (z 60 sits above sheets at z 50) ---- */}
      {portalReady &&
        createPortal(
          <AnimatePresence>
            {alarm && (
          <div
            key={alarm.id}
            className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+72px)] z-[60] flex justify-center px-4"
          >
            <motion.div
              role="alert"
              lang={htmlLang(detectTextLanguage(alarm.text))}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: reduced ? FADE : EXIT }}
              transition={reduced ? FADE : SPRING}
              className="panel pointer-events-auto flex w-full max-w-[560px] items-center gap-3 border-signal py-2 pr-2 pl-4"
            >
              <Bell className="size-6 shrink-0 text-signal" aria-hidden />
              <p className="flex-1 text-body font-medium text-ink [overflow-wrap:anywhere]">{clean(alarm.text)}</p>
              {onDismissAlarm && (
                <button
                  type="button"
                  onClick={onDismissAlarm}
                  aria-label={t.close}
                  title={t.close}
                  className="press grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink"
                >
                  <X className="size-5" aria-hidden />
                </button>
              )}
            </motion.div>
          </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export default MessageList;

/* ---------------------------------------------------------------------------------------- */
/* Assistant message                                                                        */
/* ---------------------------------------------------------------------------------------- */

type T = (typeof UI)["en"];
type S = (typeof TEXT)["en"];

// aria-disabled, not disabled: a natively disabled button drops keyboard focus to <body> the moment
// playback starts, so the person would lose their place in the thread.
const actionBase =
  "press shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";
const actionBtn = `${actionBase} grid size-12`;

function AssistantMessage({
  m,
  t,
  s,
  busy,
  reduced,
  webhooks,
  question,
  onReplay,
  onRetry,
  onCopy,
  onOpenConnections,
  onCameras,
}: {
  m: ChatMessage;
  t: T;
  s: S;
  busy: boolean;
  reduced: boolean;
  webhooks: { discord?: string; slack?: string };
  question: ChatMessage | undefined;
  onReplay: (m: ChatMessage) => void;
  onRetry?: (q: ChatMessage, r: ChatMessage) => void;
  onCopy?: (m: ChatMessage) => void | Promise<void>;
  onOpenConnections: () => void;
  onCameras?: (action: CameraAction) => void;
}) {
  const text = clean(m.text);
  const cards = (m.cards ?? []).filter(isCard);
  const media = (m.cards ?? []).filter((c): c is MediaAction => c.type === "video" || c.type === "spotify");
  const tasks = (m.cards ?? []).filter((c): c is TaskAction => c.type === "code" || c.type === "form");
  const apps = (m.cards ?? []).filter((c): c is OpenAppAction => c.type === "open_app");
  const cams = onCameras ? (m.cards ?? []).filter((c): c is CameraAction => c.type === "cameras" && Number.isFinite(c.lat) && Number.isFinite(c.lng)) : [];
  const canRetry = !!onRetry && !!question;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className={cn("panel p-5", m.error && "border-danger/60")}>
        <span className="sr-only">Aspire: </span>
        {!!m.steps?.length && <ToolLedger steps={m.steps} lang={m.lang} s={s} reduced={reduced} />}

        {m.error ? (
          <p className="flex max-w-[65ch] items-start gap-3 text-reply text-danger">
            <TriangleAlert className="mt-1 size-6 shrink-0" aria-hidden />
            <span className="[overflow-wrap:anywhere]">{text}</span>
          </p>
        ) : (
          <>
            {m.interrupted && (
              <p className="mb-1 text-label font-medium tracking-[0.08em] text-ink-faint uppercase">{s.interrupted}</p>
            )}
            {!!text && (
              <p
                // Interpreter mode: a Chinese reply to a Mongolian question is read with a Chinese voice.
                lang={htmlLang(speechLang(text, m.lang))}
                className={cn(
                  "max-w-[65ch] text-reply whitespace-pre-line [overflow-wrap:anywhere]",
                  m.interrupted ? "text-ink-muted" : "text-ink",
                )}
              >
                {text}
              </p>
            )}
          </>
        )}

        {m.error ? (
          canRetry && (
            <button
              type="button"
              onClick={() => {
                if (!busy && question) onRetry?.(question, m);
              }}
              aria-disabled={busy || undefined}
              className="press mt-4 inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-accent px-6 text-body font-semibold text-on-accent aria-disabled:cursor-default aria-disabled:opacity-50"
            >
              <RotateCw className="size-5" aria-hidden />
              {t.retry}
            </button>
          )
        ) : (
          <div className="mt-3 -mb-2 -ml-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!busy) onReplay(m);
              }}
              aria-disabled={busy || undefined}
              aria-label={t.repeat}
              title={t.repeat}
              className={actionBtn}
            >
              <Volume2 className="size-5" aria-hidden />
            </button>
            {!!text && <CopyButton m={m} text={text} s={s} onCopy={onCopy} />}
            {canRetry && (
              <button
                type="button"
                onClick={() => {
                  if (!busy && question) onRetry?.(question, m);
                }}
                aria-disabled={busy || undefined}
                aria-label={t.retry}
                title={t.retry}
                className={actionBtn}
              >
                <RotateCw className="size-5" aria-hidden />
              </button>
            )}
          </div>
        )}

        {!!m.sources?.length && <Sources sources={m.sources} t={t} s={s} />}
      </div>

      {tasks.map((c, i) => (
        <TaskCard key={`t${i}`} action={c} lang={m.lang} />
      ))}

      {media.map((c, i) => (
        <MediaCard key={`m${i}`} action={c} lang={m.lang} />
      ))}

      {apps.map((c, i) => (
        <OpenAppCard key={`a${i}`} action={c} lang={m.lang} />
      ))}

      {cams.map((c, i) => (
        <button key={`c${i}`} type="button" onClick={() => onCameras?.(c)} className="press panel flex min-h-14 items-center gap-3 rounded-lg px-5 text-left text-body text-ink">
          <Video aria-hidden className="size-5 shrink-0 text-accent" />
          {(CAMERA_TEXT[m.lang] ?? CAMERA_TEXT.en).title}
        </button>
      ))}

      {!!cards.length && (
        <div className="flex flex-col gap-2">
          {cards.map((c, i) => (
            <ActionCard
              key={i}
              action={c}
              t={t}
              webhooks={webhooks}
              onOpenConnections={onOpenConnections}
            />
          ))}
        </div>
      )}

    </div>
  );
}

/* ---- tool ledger (spec 10.1): icon, label, status icon plus an sr-only status word ---- */

function ToolLedger({ steps, lang, s, reduced }: { steps: ChatStep[]; lang: Lang; s: S; reduced: boolean }) {
  return (
    <ul aria-label={s.steps} className="mb-3 flex flex-col gap-1 border-b border-line pb-3">
      {steps.map((step, i) => {
        const Icon = toolIcon(step.tool);
        const label = TOOL_TEXT[step.tool]?.[lang] ?? (clean(step.label) || step.tool);
        return (
          <li key={`${step.tool}-${i}`} className="flex min-h-7 items-center gap-2 text-small text-ink-muted">
            <Icon className="size-5 shrink-0 text-ink-faint" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
            {step.pending ? (
              <LoaderCircle className={cn("size-4 shrink-0 text-ink-muted", !reduced && "animate-spin motion-reduce:animate-none")} aria-hidden />
            ) : step.ok ? (
              <Check className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <X className="size-4 shrink-0 text-danger" aria-hidden />
            )}
            <span className="sr-only">{step.pending ? s.stepWorking : step.ok ? s.stepDone : s.stepFailed}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---- copy, with a short "Copied" confirmation (icon plus word) ---- */

function CopyButton({ m, text, s, onCopy }: { m: ChatMessage; text: string; s: S; onCopy?: (m: ChatMessage) => void | Promise<void> }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (onCopy) await onCopy(m);
          else await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* clipboard blocked: nothing to confirm */
        }
      }}
      aria-label={copied ? s.copied : s.copy}
      title={copied ? s.copied : s.copy}
      className={copied ? `${actionBase} inline-flex h-12 min-w-12 items-center gap-2 px-3 text-success` : actionBtn}
    >
      {copied ? (
        <>
          <Check className="size-5" aria-hidden />
          <span className="text-small font-medium">{s.copied}</span>
        </>
      ) : (
        <Copy className="size-5" aria-hidden />
      )}
    </button>
  );
}

/* ---- sources: collapsed by default (as in v2), 48px tap rows, accent-2 underlined links ---- */

function Sources({ sources, t, s }: { sources: ChatSource[]; t: T; s: S }) {
  return (
    <details className="group mt-3 border-t border-line pt-1">
      <summary className="press -mx-2 flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-small font-medium text-ink-muted select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        {t.sources} ({sources.length})
      </summary>
      <ul className="mt-1 flex flex-wrap gap-2">
        {sources.map((src, i) => {
          const href = safeHref(src?.url);
          const name = clean(src?.title) || (href ? hostOf(href) : clean(String(src?.url ?? "")));
          if (!name) return null;
          return (
            <li key={`${src.url}-${i}`} className="max-w-full">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press inline-flex min-h-12 max-w-full items-center gap-2 rounded-md bg-panel-2 px-3 text-small text-accent-2 underline underline-offset-4 hover:bg-panel-3"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
                  <ExternalLink className="size-4 shrink-0" aria-hidden />
                  <span className="sr-only">({s.newTab})</span>
                </a>
              ) : (
                <span className="inline-flex min-h-12 max-w-full items-center rounded-md px-3 text-small text-ink-muted [overflow-wrap:anywhere]">
                  {name}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
