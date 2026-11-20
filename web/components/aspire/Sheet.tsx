"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Panel that slides up from the bottom on phones and in from the right on wide screens,
// and leaves the same way it came. Spring with no bounce; fades only for reduced motion.

const WIDE = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia(WIDE);
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const wide = useWide();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const hidden = reduced ? { opacity: 0 } : wide ? { x: "100%" } : { y: "100%" };
  const shown = reduced ? { opacity: 1 } : wide ? { x: 0 } : { y: 0 };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.button
            aria-label={closeLabel}
            tabIndex={-1}
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={reduced ? { duration: 0.18 } : { type: "spring", bounce: 0, duration: 0.38 }}
            drag={wide || reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className={
              wide
                ? "glass absolute top-0 right-0 flex h-full w-[420px] flex-col rounded-l-3xl bg-[#0b1424]/90 outline-none"
                : "glass absolute right-0 bottom-0 left-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-[#0b1424]/90 pb-[env(safe-area-inset-bottom)] outline-none"
            }
          >
            {!wide && <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/25" />}
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                aria-label={closeLabel}
                className="press grid size-11 place-items-center rounded-full text-ink-soft hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
