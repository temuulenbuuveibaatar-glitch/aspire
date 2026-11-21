// The right-hand agent panel (spec: AgentPanel). A frame only: the shell passes in the existing voice
// orb, MessageList and Composer, so voice, chat and cards keep one implementation. It adds the header
// (name, role, expand), the opener line, the source chips with their ages, and the model label.

import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { ageText, LiveDot, type Provenance } from "@/components/v6/Card";
import { textFor } from "@/components/v6/text";

interface AgentPanelProps {
  lang: Lang;
  /** The agent's name in the header. */
  name?: string;
  /** The <VoiceOrb> element. */
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
  className?: string;
}

export function AgentPanel({ lang, name = "Aspire", orb, opener, messages, composer, sources = [], model, expanded = false, onExpand, className }: AgentPanelProps) {
  const t = textFor(lang);
  return (
    <aside aria-label={`${name}, ${t.agentRole}`} className={cn("v6-card flex min-h-0 flex-col gap-4 p-5", className)}>
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        <h2 className="text-meta font-semibold tracking-[0.14em] text-ink uppercase">{name}</h2>
        <span className="truncate rounded-md bg-surface-3 px-2 py-0.5 text-meta text-ink-muted">{t.agentRole}</span>
        {onExpand && (
          <button type="button" onClick={onExpand} aria-label={t.expand} aria-pressed={expanded} className="press ml-auto grid size-11 place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:text-ink">
            {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
          </button>
        )}
      </header>
      <div className="grid place-items-center text-accent">{orb}</div>
      {opener && <div className="text-[1.5rem] leading-tight font-medium text-ink">{opener}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{messages}</div>
      {sources.length > 0 && (
        <ul aria-label={t.sources} className="flex flex-wrap gap-1.5">
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
      {model && <p className="border-t border-line pt-3 text-meta text-ink-faint">{model}</p>}
      {composer}
    </aside>
  );
}
