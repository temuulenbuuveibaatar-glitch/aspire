"use client";

// Composer (design spec v3, section 10.3): the fixed-bottom text box with ONE 56px primary
// button that morphs between Mic (empty draft), Send (text present) and Stop (listening or
// speaking). Presentational only: the shell (Assistant.tsx) owns the draft, the phase and the
// audio; this component just renders them and reports intent through callbacks.

import { ArrowUp, LoaderCircle, Mic, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { LANG_NAMES, type Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";

export type ComposerPhase = "idle" | "listening" | "thinking" | "speaking";

/** What the primary button does right now. */
export type ComposerMode = "mic" | "send" | "stop" | "busy";

export interface ComposerLabels {
  /** Placeholder and accessible name of the text box. */
  placeholder: string;
  /** aria-label of the primary button when the draft is empty. */
  startListening: string;
  /** aria-label of the primary button when there is text to send. */
  send: string;
  /** aria-label of the primary button while listening or speaking. */
  stop: string;
  /** aria-label of the (inactive) primary button while thinking. */
  thinking: string;
  /** Shown in the read-only box while listening, before any interim words arrive. */
  listening: string;
}

export interface ComposerProps {
  phase: ComposerPhase;
  draft: string;
  onDraft: (value: string) => void;
  /** Called with the trimmed draft, only when phase is "idle" and the draft is not blank. */
  onSubmit: (text: string) => void;
  /**
   * The mic/stop action (Assistant's `onCore`): starts listening when idle with an empty draft,
   * stops recording while listening, stops playback while speaking. Never called while thinking.
   */
  onMic: () => void;
  /** Live microphone level getter, 0..1 (same getter the orb uses). Drives the waveform. */
  level?: () => number;
  /** UI language: picks the strings and the 2-letter tag shown while listening. */
  lang: Lang;
  /** Interim transcript shown in the read-only box while listening. */
  interim?: string;
  /** Override any string (for example with values from lib/ui-text.ts). */
  labels?: Partial<ComposerLabels>;
  /** Ref to the textarea, e.g. to focus it from the shell. */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Rendered above the panel inside the safe-area wrapper (consent note, notices, jump pill). */
  before?: ReactNode;
  /** Classes for the outer wrapper (positioning / width). Defaults to a centred max-w-3xl column. */
  className?: string;
}

const COPY: Record<Lang, ComposerLabels> = {
  mn: {
    placeholder: "Бичих эсвэл микрофон дарна уу",
    startListening: "Сонсож эхлэх",
    send: "Илгээх",
    stop: "Зогсоох",
    thinking: "Бодож байна",
    listening: "Сонсож байна",
  },
  zh: {
    placeholder: "输入文字或点击麦克风",
    startListening: "开始聆听",
    send: "发送",
    stop: "停止",
    thinking: "正在思考",
    listening: "正在聆听",
  },
  en: {
    placeholder: "Type or tap the mic",
    startListening: "Start listening",
    send: "Send",
    stop: "Stop",
    thinking: "Thinking",
    listening: "Listening",
  },
  ru: {
    placeholder: "Напишите или нажмите на микрофон",
    startListening: "Начать слушать",
    send: "Отправить",
    stop: "Остановить",
    thinking: "Думаю",
    listening: "Слушаю",
  },
  de: {
    placeholder: "Schreiben oder Mikrofon antippen",
    startListening: "Zuhören starten",
    send: "Senden",
    stop: "Stopp",
    thinking: "Denke nach",
    listening: "Ich höre zu",
  },
};

/** Pure state machine for the primary button (exported for tests and the shell). */
export function composerMode(phase: ComposerPhase, draft: string): ComposerMode {
  if (phase === "listening" || phase === "speaking") return "stop";
  if (phase === "thinking") return "busy";
  return draft.trim() ? "send" : "mic";
}

const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
const EXIT = { duration: 0.23 } as const; // 65% of the enter duration
const CALM = { duration: 0.15 } as const;

// ---- motion policy (reduced motion + in-app Calm mode on <html data-calm="true">) -----------

function subscribeCalm(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-calm"] });
  return () => mo.disconnect();
}
function useStill(): boolean {
  const reduced = useReducedMotion() ?? false;
  const calm = useSyncExternalStore(
    subscribeCalm,
    () => document.documentElement.dataset.calm === "true",
    () => false,
  );
  return reduced || calm;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Locale strings, falling back to English for an unknown lang, then applying non-empty overrides only. */
function resolveLabels(lang: Lang, labels?: Partial<ComposerLabels>): ComposerLabels {
  const out: ComposerLabels = { ...(COPY[lang] ?? COPY.en) };
  if (labels) {
    for (const k of Object.keys(out) as (keyof ComposerLabels)[]) {
      const v = labels[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
  }
  return out;
}

/** Safe read of the level getter: a throwing or missing getter reads as silence. */
function readLevel(get: (() => number) | undefined): number {
  try {
    return clamp01(get ? get() : 0);
  } catch {
    return 0;
  }
}

// ---- component ----------------------------------------------------------------------------

export function Composer({
  phase,
  draft,
  onDraft,
  onSubmit,
  onMic,
  level,
  lang,
  interim,
  labels,
  inputRef,
  before,
  className,
}: ComposerProps) {
  const still = useStill();
  const L = resolveLabels(lang, labels);
  const tag = LANG_NAMES[lang]?.code ?? "EN";
  const mode = composerMode(phase, draft);
  const listening = phase === "listening";

  const box = useRef<HTMLTextAreaElement | null>(null);
  const attach = useCallback(
    (el: HTMLTextAreaElement | null) => {
      box.current = el;
      setRef(inputRef, el);
    },
    [inputRef],
  );

  const shown = (listening ? interim : draft) ?? "";

  // Grow from 1 to 4 rows (works in every browser, unlike field-sizing). Re-measured when the
  // text, the language (zh uses taller leading) or the box width (rotation, A/A+/A++ text size,
  // browser zoom) changes.
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 28;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, line * 4 + pad)}px`;
  }, []);
  useLayoutEffect(fit, [fit, shown, lang]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    let fontSize = getComputedStyle(document.documentElement).fontSize;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const f = getComputedStyle(document.documentElement).fontSize;
      if (w === width && f === fontSize) return; // our own height writes do not loop
      width = w;
      fontSize = f;
      fit();
    });
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [fit]);

  const submit = () => {
    const q = draft.trim();
    if (!q || phase !== "idle") return;
    onSubmit(q);
  };

  const press = () => {
    if (mode === "busy") return; // aria-disabled: keep focus, do nothing
    if (mode === "mic" || mode === "stop") onMic();
  };

  const accentFill = mode === "mic" || mode === "send";
  const label = { mic: L.startListening, send: L.send, stop: L.stop, busy: L.thinking }[mode];
  const iconIn = still ? { opacity: 0 } : { opacity: 0, scale: 0.9 };
  const iconOut = still ? { opacity: 0, transition: CALM } : { opacity: 0, scale: 0.9, transition: EXIT };

  return (
    <div className={cn("mx-auto w-full max-w-3xl pb-[max(8px,env(safe-area-inset-bottom))]", className)}>
      {before}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "panel flex flex-col gap-1 rounded-xl p-2 pl-4",
          "has-[textarea:focus-visible]:outline-3 has-[textarea:focus-visible]:outline-offset-3 has-[textarea:focus-visible]:outline-accent",
        )}
      >
        {listening && (
          <div className="flex items-center gap-3 pt-1 text-small text-ink-muted">
            <span className="rounded-sm border border-line-strong px-2 font-display leading-6 font-medium tracking-[0.08em] text-ink">
              {tag}
            </span>
            <Elapsed />
            {level && (still ? <LevelBar level={level} /> : <Waveform level={level} />)}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={attach}
            value={shown}
            readOnly={listening}
            onChange={(e) => {
              if (!listening) onDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line; never send mid-IME (Chinese, Mongolian keyboards).
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              submit();
            }}
            rows={1}
            enterKeyHint="send"
            placeholder={listening ? L.listening : L.placeholder}
            aria-label={listening ? L.listening : L.placeholder}
            className={cn(
              "min-h-14 flex-1 resize-none overflow-y-auto bg-transparent py-3.5 text-body outline-none placeholder:text-ink-faint focus-visible:outline-none",
              listening ? "text-ink-muted" : "text-ink",
            )}
          />

          <button
            type={mode === "send" ? "submit" : "button"}
            onClick={mode === "send" ? undefined : press}
            aria-label={label}
            aria-disabled={mode === "busy" || undefined}
            className={cn(
              "press relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full",
              accentFill ? "focus-visible:outline-ink" : "focus-visible:outline-accent",
              mode === "busy" && "cursor-default active:scale-100",
            )}
          >
            {/* Two fills crossfaded by opacity (never animate background-color). */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-full bg-accent transition-opacity duration-200 motion-reduce:duration-150 calm:duration-150",
                accentFill ? "opacity-100" : "opacity-0",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-full border border-line-strong bg-panel-3 transition-opacity duration-200 motion-reduce:duration-150 calm:duration-150",
                accentFill ? "opacity-0" : "opacity-100",
              )}
            />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={mode}
                aria-hidden
                initial={iconIn}
                animate={{ opacity: 1, scale: 1, transition: still ? CALM : SPRING }}
                exit={iconOut}
                className={cn(
                  "relative grid place-items-center",
                  accentFill ? "text-on-accent" : mode === "busy" ? "text-ink-muted" : "text-accent",
                )}
              >
                {mode === "mic" && <Mic className="size-6" strokeWidth={2.25} />}
                {mode === "send" && <ArrowUp className="size-6" strokeWidth={2.5} />}
                {mode === "stop" && <Square className="size-5 fill-current" />}
                {mode === "busy" && <LoaderCircle className="size-6" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- listening telemetry ------------------------------------------------------------------

/** mm:ss since mount (mounted only while listening, so it starts at 00:00). */
function Elapsed() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 250);
    return () => window.clearInterval(id);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="font-display tabular-nums text-ink-muted">
      {mm}:{ss}
    </span>
  );
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** 24px canvas waveform from the real AnalyserNode level (history of bars, DPR capped at 2). */
function Waveform({ level }: { level: () => number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const get = useLatest(level);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = 96;
    const H = 24;
    const BAR = 3;
    const GAP = 2;
    const N = Math.floor((W + GAP) / (BAR + GAP));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = getComputedStyle(c).color || "#5EE7FF";
    const hist: number[] = Array.from({ length: N }, () => 0);
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 50) return; // about 20 samples a second
      last = t;
      hist.shift();
      hist.push(readLevel(get.current));
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      for (let i = 0; i < N; i++) {
        const h = Math.max(2, hist[i] * H);
        ctx.fillRect(i * (BAR + GAP), (H - h) / 2, BAR, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [get]);

  return <canvas ref={canvas} aria-hidden className="h-6 w-24 shrink-0 text-accent" />;
}

/** Reduced motion / Calm: a plain level bar, stepped 4 times a second, no easing. */
function LevelBar({ level }: { level: () => number }) {
  const fill = useRef<HTMLSpanElement>(null);
  const get = useLatest(level);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (fill.current) fill.current.style.transform = `scaleX(${readLevel(get.current)})`;
    }, 250);
    return () => window.clearInterval(id);
  }, [get]);
  return (
    <span aria-hidden className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-panel-3">
      <span ref={fill} className="absolute inset-0 origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
    </span>
  );
}
