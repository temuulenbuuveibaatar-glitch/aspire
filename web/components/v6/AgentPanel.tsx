// The right-hand agent panel (spec: AgentPanel). A frame only: the shell passes in the existing voice
// orb, MessageList and Composer, so voice, chat and cards keep one implementation. It adds the header
// (name, role, spoken answers on/off, expand), the opener line, the source chips with their ages, and
// the model label.
//
// Two shapes. Roomy (an empty panel on a tall screen): the orb stands on its own row with the opener
// under it. Compact (once a conversation exists, on a short screen, or with spoken answers off): the orb
// sits in the header row and the opener scrolls with the thread, so the thread keeps the height and a
// typed answer is on screen at once.

import type { ReactNode } from "react";
import { Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { ageText, LiveDot, type Provenance } from "@/components/v6/Card";
import { textFor } from "@/components/v6/text";

interface AgentPanelProps {
  lang: Lang;
  /** The agent's name in the header. */
  name?: string;
  /** The <VoiceOrb> element; null when spoken answers are off (a text chat has no orb). */
  orb: ReactNode;
  /** First line before any conversation ("A local instinct. An extra hand."). */
  opener?: ReactNode;
  /** The <MessageList> element. */
  messages: ReactNode;
  /** The <Composer> element. */
  composer: ReactNode;
  /** What the answers are built on, each with its topic ("Weather"), source and age. */
  sources?: (Provenance & { label: string })[];
  /** "Model / harness" label. */
  model?: string | null;
  expanded?: boolean;
  onExpand?: () => void;
  /** The orb moves into the header row and the opener joins the thread. */
  compact?: boolean;
  /** Compact only: the state word beside the name ("Thinking", "Speaking"), in place of the role. */
  status?: string;
  /** The spoken answers switch. `label` never changes (the state is aria-pressed); `hint` is the tooltip. */
  voice?: { on: boolean; label: string; hint: string; disabled?: boolean; onToggle: () => void };
  className?: string;
}

const iconBtn = "press grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] hover:text-ink";

export function AgentPanel({ lang, name = "Aspire", orb, opener, messages, composer, sources = [], model, expanded = false, onExpand, compact = false, status, voice, className }: AgentPanelProps) {
  const t = textFor(lang);
  return (
    <aside aria-label={`${name}, ${t.agentRole}`} className={cn("v6-card flex min-h-0 flex-col p-5", compact ? "gap-3" : "gap-4", className)}>
      <header className="flex min-h-11 shrink-0 items-center gap-2">
        {compact && orb ? <div className="grid shrink-0 place-items-center text-accent">{orb}</div> : <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
        <h2 className="text-meta font-semibold tracking-[0.14em] text-ink uppercase">{name}</h2>
        {compact && status ? (
          <span aria-hidden className="truncate text-meta tracking-[0.12em] text-ink-muted uppercase">
            {status}
          </span>
        ) : (
          <span className="truncate rounded-md bg-surface-3 px-2 py-0.5 text-meta text-ink-muted">{t.agentRole}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center">
          {voice && (
            // aria-disabled, not disabled: focus stays put while screen reader mode holds the switch off.
            <button
              type="button"
              onClick={() => !voice.disabled && voice.onToggle()}
              aria-label={voice.label}
              aria-pressed={voice.on}
              aria-disabled={voice.disabled || undefined}
              title={voice.hint}
              className={cn(iconBtn, voice.on ? "text-accent" : "text-ink-muted", voice.disabled && "cursor-default opacity-60")}
            >
              {voice.on ? <Volume2 aria-hidden className="size-5" /> : <VolumeX aria-hidden className="size-5" />}
            </button>
          )}
          {onExpand && (
            <button type="button" onClick={onExpand} aria-label={t.expand} aria-pressed={expanded} className={cn(iconBtn, "text-ink-muted")}>
              {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
            </button>
          )}
        </span>
      </header>
      {!compact && orb && <div className="grid shrink-0 place-items-center text-accent">{orb}</div>}
      {/* Short screens (laptops): a smaller opener and no chips, so the starters and the thread keep their room. */}
      {!compact && opener && <div className="shrink-0 text-[1.5rem] leading-tight font-medium text-ink [@media(max-height:52rem)]:lg:text-[1.125rem]">{opener}</div>}
      {/* Desktop: the thread scrolls in its own region. Top padding with a fade of the same height means a
          line scrolled past the top melts away instead of showing half cut, and costs no room at rest;
          scroll-padding keeps a focused or followed message clear of that fade. min-h: the thread never
          collapses, whatever else the panel carries. Phones scroll the page, so no mask there (it would
          also trap the fixed jump-to-latest button in the thread's stacking layer). */}
      <div data-thread-scroll className="relative -mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 lg:min-h-28 lg:scroll-pt-4 lg:pt-4 lg:[mask-image:linear-gradient(to_bottom,transparent,#000_1rem)]">
        {compact && opener && <div className="mb-3 text-[1.25rem] leading-tight font-medium text-ink [@media(max-height:52rem)]:lg:text-[1.125rem]">{opener}</div>}
        {messages}
      </div>
      {sources.length > 0 && (
        <ul aria-label={t.sources} className="flex shrink-0 flex-wrap gap-1.5 [@media(max-height:52rem)]:lg:hidden">
          {sources.map((s) => (
            <li key={s.label} className="v6-chip max-w-full gap-1.5 px-2.5 py-1 text-meta" title={`${s.label} · ${s.source}`}>
              {s.kind === "live" && <LiveDot />}
              <span className="shrink-0 text-ink-muted">{s.label}</span>
              <span className="truncate">{s.source}</span>
              {s.ageS != null && <span className="num shrink-0 text-ink-faint">{ageText(s.ageS, lang)}</span>}
            </li>
          ))}
        </ul>
      )}
      {model && <p className="shrink-0 border-t border-line pt-3 text-meta text-ink-faint">{model}</p>}
      {composer && <div className="shrink-0">{composer}</div>}
    </aside>
  );
}
