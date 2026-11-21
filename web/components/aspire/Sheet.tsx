"use client";

import { X } from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type PanInfo,
} from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";
import { LANGS, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

// Spec section 15. Phone: a bottom sheet with snap points, dragged from the grabber or header
// (or from the content when it is scrolled to the top). Desktop (1024px and up): an inset side
// panel that slides in on translateX. Springs never bounce; reduced motion and Calm mode fade only.

const SPRING = { type: "spring", bounce: 0, duration: 0.38 } as const;
const SPRING_EXIT = { type: "spring", bounce: 0, duration: 0.25 } as const; // about 65% of the enter
const FADE = { duration: 0.15 } as const;
const FADE_EXIT = { duration: 0.1 } as const;
const BACKDROP = 0.55;
const DEFAULT_SNAPS = [0.6, 0.92];

const TEXT: Record<Lang, { resize: string; small: string; half: string; full: string }> = {
  mn: {
    resize: "Самбарын хэмжээг өөрчлөх",
    small: "Жижиг",
    half: "Хагас өндөр",
    full: "Бүтэн өндөр",
  },
  zh: { resize: "调整面板大小", small: "小", half: "半高", full: "全高" },
  en: {
    resize: "Resize panel",
    small: "Small",
    half: "Half height",
    full: "Full height",
  },
  ru: {
    resize: "Изменить размер панели",
    small: "Маленькая",
    half: "Половина высоты",
    full: "Полная высота",
  },
  de: {
    resize: "Panelgröße ändern",
    small: "Klein",
    half: "Halbe Höhe",
    full: "Volle Höhe",
  },
};

/** The sheet does not get a lang prop; the close label (from UI[lang].close) tells us which. */
function langFor(closeLabel: string): Lang {
  const byLabel = LANGS.find((l) => UI[l].close === closeLabel);
  if (byLabel) return byLabel;
  const doc = typeof document !== "undefined" ? document.documentElement.lang.slice(0, 2) : "";
  return (LANGS as readonly string[]).includes(doc) ? (doc as Lang) : "en";
}

/** True under prefers-reduced-motion or the in-app Calm mode (lib/display-prefs). */
export const useStillMotion = useStill;

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** Fractions of the viewport height, phone only. Default [0.6, 0.92]. */
  snapPoints?: number[];
  /** Index into snapPoints to open at. Default: the tallest. */
  initialSnap?: number;
  /**
   * Optional: where the new size word is announced. Spec 13.2 allows two live regions, so the
   * app passes its own status region; without it the sheet keeps a small one of its own.
   */
  onAnnounce?: (text: string) => void;
  children: React.ReactNode;
}

export function Sheet({ open, title, closeLabel, onClose, snapPoints, initialSnap, onAnnounce, children }: SheetProps) {
  const wide = useMedia("(min-width: 1024px)");
  const still = useStillMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Callers pass an inline onClose; keep the latest one without re-running the open effect
  // (re-running it on every parent render would yank focus out of inputs inside the sheet).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const back = opener.current as HTMLElement | null;
      if (back?.isConnected) back.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <SheetBody
          key="sheet"
          panelRef={panel}
          wide={wide}
          still={still}
          title={title}
          closeLabel={closeLabel}
          onClose={onClose}
          snapPoints={snapPoints}
          initialSnap={initialSnap}
          onAnnounce={onAnnounce}
        >
          {children}
        </SheetBody>
      )}
    </AnimatePresence>
  );
}

interface Level {
  frac: number;
  y: number; // translateY that shows this much of the sheet
}

function SheetBody({
  panelRef,
  wide,
  still,
  title,
  closeLabel,
  onClose,
  snapPoints = DEFAULT_SNAPS,
  initialSnap,
  onAnnounce,
  children,
}: Omit<SheetProps, "open"> & {
  panelRef: React.RefObject<HTMLDivElement | null>;
  wide: boolean;
  still: boolean;
}) {
  const text = TEXT[langFor(closeLabel)];
  const titleId = useId();
  const sizeId = useId();

  // ---- snap model (phone) -------------------------------------------------------------------
  // Keyed by value so an inline `snapPoints={[...]}` does not rebuild the snap model every render.
  const snapKey = snapPoints.join(",");
  const fracs = useMemo(() => {
    const f = snapKey
      .split(",")
      .map(Number)
      .filter((x) => Number.isFinite(x) && x > 0 && x <= 1)
      .sort((a, b) => a - b);
    return f.length ? f : [0.92];
  }, [snapKey]);
  const maxFrac = fracs[fracs.length - 1];
  // initialSnap indexes the caller's snapPoints (not the sorted copy); default is the tallest.
  const wanted = initialSnap === undefined ? undefined : snapPoints[initialSnap];
  const startFrac = wanted !== undefined && Number.isFinite(wanted) && wanted > 0 && wanted <= 1 ? wanted : maxFrac;

  const [box, setBox] = useState({ h: 0, vh: 0 });
  // Lowest first (largest y). Snaps that would show the whole sheet collapse into one.
  const levels = useMemo<Level[]>(() => {
    const out: Level[] = [];
    for (const frac of fracs) {
      const y = Math.max(0, Math.min(box.h, box.h - frac * box.vh));
      const prev = out[out.length - 1];
      if (prev && prev.y - y < 1) prev.frac = frac;
      else out.push({ frac, y });
    }
    return out;
  }, [fracs, box]);
  const [level, setLevel] = useState<number | null>(null);
  const [announceOwn, setAnnounceOwn] = useState("");
  const setAnnounce = (word: string) => (onAnnounce ? onAnnounce(word) : setAnnounceOwn(word));

  const y = useMotionValue(typeof window !== "undefined" ? window.innerHeight : 1000);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const measured = useRef({ h: 0, top: 0 });
  const dragControls = useDragControls();
  const contentPull = useRef<{ y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const target = useRef<number | null>(null);
  const go = useCallback(
    (to: number) => {
      if (target.current === to) return; // already there or on the way
      target.current = to;
      anim.current?.stop();
      if (still) {
        y.jump(to);
        return;
      }
      anim.current = animate(y, to, SPRING);
    },
    [still, y],
  );

  // Measure the sheet and the viewport; keep the current snap when either changes.
  useLayoutEffect(() => {
    if (wide) return;
    const el = panelRef.current;
    if (!el) return;
    const read = () => setBox({ h: el.offsetHeight, vh: window.innerHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [wide, panelRef]);

  // Until the person picks a size, the sheet sits at the requested snap.
  const initialLevel = useMemo(() => {
    let idx = levels.length - 1;
    let best = Infinity;
    const want = Math.max(0, box.h - startFrac * box.vh);
    levels.forEach((l, i) => {
      const d = Math.abs(l.y - want);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    return Math.max(0, idx);
  }, [levels, box, startFrac]);
  const at = Math.min(level ?? initialLevel, Math.max(0, levels.length - 1));
  const current: Level | undefined = levels[at];
  const currentY = current?.y;
  const topY = levels.length ? levels[levels.length - 1].y : 0;

  // Follow the current snap when it, the sheet or the viewport changes (not mid-drag).
  useLayoutEffect(() => {
    if (wide || box.h === 0 || currentY === undefined) return;
    measured.current = { h: box.h, top: topY };
    if (!dragging.current) go(currentY);
  }, [wide, box.h, topY, currentY, go]);

  const backdropOpacity = useTransform(y, (v) => {
    const { h, top } = measured.current;
    if (!h) return 0;
    const span = Math.max(1, h - top);
    return BACKDROP * Math.min(1, Math.max(0, 1 - (v - top) / span));
  });

  const nameOf = (l: Level | null | undefined, i: number, count: number) => {
    if (!l) return text.full;
    if (i === count - 1 || l.y === 0) return text.full;
    return l.frac < 0.45 ? text.small : text.half;
  };
  const sizeName = nameOf(current, at, levels.length);

  const toLevel = (i: number) => {
    if (!levels.length) return;
    const idx = Math.max(0, Math.min(levels.length - 1, i));
    setLevel(idx);
    go(levels[idx].y);
    setAnnounce(nameOf(levels[idx], idx, levels.length));
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    dragging.current = false;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 250);
    if (!levels.length) return;
    const cur = y.get();
    const lowest = levels[0];
    const lowestVisible = Math.max(1, box.h - lowest.y);
    if (info.velocity.y > 600 || cur > lowest.y + 0.35 * lowestVisible) {
      onClose();
      return;
    }
    const projected = cur + info.velocity.y * 0.2;
    let idx = 0;
    let best = Infinity;
    levels.forEach((l, i) => {
      const d = Math.abs(l.y - projected);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    if (idx !== at) setAnnounce(nameOf(levels[idx], idx, levels.length));
    setLevel(idx);
    go(levels[idx].y);
  };

  const startDrag = (e: React.PointerEvent) => {
    if (wide) return;
    dragControls.start(e);
  };

  // Tab stays inside the sheet.
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // ---- motion props ---------------------------------------------------------------------------
  const sideHidden = { x: "calc(100% + 24px)" };
  const panelMotion = still
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: FADE },
        exit: { opacity: 0, transition: FADE_EXIT },
      }
    : wide
      ? {
          initial: sideHidden,
          animate: { x: 0, transition: SPRING },
          exit: { ...sideHidden, transition: SPRING_EXIT },
        }
      : { exit: { y: (box.h || 800) + 24, transition: SPRING_EXIT } };

  const phoneDrag = !wide;

  return (
    <div className="fixed inset-0 z-50">
      <motion.button
        type="button"
        aria-label={closeLabel}
        // Pointer-only (a tap outside closes): hidden from screen readers, who have Escape and the dialog's Close.
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-bg"
        {...(!wide && !still
          ? { style: { opacity: backdropOpacity } }
          : {
              initial: { opacity: 0 },
              animate: { opacity: BACKDROP, transition: still ? FADE : SPRING },
              exit: { opacity: 0, transition: still ? FADE_EXIT : SPRING_EXIT },
            })}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        // WCAG 2.4.11: at a partial snap the lower part of the scroller sits below the viewport,
        // so a control focused there would be off-screen. Any such focus raises the sheet to full.
        onFocus={(e) => {
          if (wide || e.target === panelRef.current || at >= levels.length - 1) return;
          if ((e.target as HTMLElement).getBoundingClientRect().bottom > window.innerHeight - 8) toLevel(levels.length - 1);
        }}
        {...panelMotion}
        style={
          wide
            ? { borderRadius: "var(--radius-xl)" }
            : {
                y,
                maxHeight: `${maxFrac * 100}dvh`,
                borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              }
        }
        drag={phoneDrag ? "y" : false}
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={{
          top: levels.length ? levels[levels.length - 1].y : 0,
          bottom: box.h || 0,
        }}
        dragElastic={{ top: 0.04, bottom: 0.2 }}
        onDragStart={() => {
          dragging.current = true;
          target.current = null;
          anim.current?.stop();
        }}
        onDragEnd={onDragEnd}
        className={
          (wide ? "absolute top-3 right-3 bottom-3 w-[440px] max-w-[calc(100vw-24px)] " : "absolute inset-x-0 bottom-0 ") +
          "panel flex flex-col overflow-hidden bg-[rgb(11_18_32/0.94)] shadow-lift outline-none opaque:bg-panel"
        }
      >
        <div aria-hidden className="hairline-sky pointer-events-none absolute inset-x-8 top-0" />

        {wide ? (
          <div className="h-3" aria-hidden />
        ) : (
          <button
            type="button"
            aria-label={text.resize}
            aria-describedby={sizeId}
            onPointerDown={startDrag}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              // Enter / click steps up and stays at the top (ArrowDown or a drag makes it smaller).
              toLevel(Math.min(at + 1, levels.length - 1));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                toLevel(at + 1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                toLevel(at - 1);
              }
            }}
            className="group grid h-12 w-full shrink-0 cursor-grab touch-none place-items-center rounded-t-[var(--radius-xl)] active:cursor-grabbing"
          >
            <span className="h-[5px] w-10 rounded-full bg-ink-faint/70 transition-colors group-hover:bg-ink-muted" />
            <span id={sizeId} className="sr-only">
              {sizeName}
            </span>
          </button>
        )}

        <div
          className={"flex shrink-0 items-center justify-between gap-3 px-5 pb-3 " + (wide ? "pt-2" : "-mt-2 touch-none")}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            startDrag(e);
          }}
        >
          <h2 id={titleId} className="min-w-0 text-lead font-semibold text-ink [overflow-wrap:anywhere]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="press grid size-12 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ink-muted hover:bg-panel-3 hover:text-ink"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]"
          onPointerDown={(e) => {
            contentPull.current = wide || e.pointerType === "touch" ? null : { y: e.clientY };
          }}
          onPointerMove={(e) => {
            const start = contentPull.current;
            if (!start || dragging.current) return;
            if ((scroller.current?.scrollTop ?? 0) > 0) {
              contentPull.current = null;
              return;
            }
            if (e.clientY - start.y > 8) {
              contentPull.current = null;
              dragControls.start(e);
            }
          }}
          onPointerUp={() => (contentPull.current = null)}
          onPointerCancel={() => (contentPull.current = null)}
        >
          {children}
        </div>

        {!wide && !onAnnounce && (
          <p role="status" className="sr-only">
            {announceOwn}
          </p>
        )}
      </motion.div>
    </div>
  );
}
