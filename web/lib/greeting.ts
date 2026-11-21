// The Jarvis greeting on the empty screen (spec 14.1).
// Sentence 1: time-of-day hello plus the form of address, in the place's time zone.
// Sentence 2: one notable fact when something matters right now (precipitation, unhealthy air,
// a bus within 10 minutes, heavy traffic); otherwise "How is it going?" on the first open of a
// session; otherwise nothing. It never lists capabilities and never exclaims.
import type { Ambient } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";
import type { Title } from "@/lib/tools/types";
import { greetingPart, jarvisGreeting, UI, type NotableText } from "@/lib/ui-text";

export type NotableKind = keyof NotableText;

export interface Notable {
  kind: NotableKind;
  route?: string;
  minutes?: number;
}

const BAD_AIR = new Set(["unhealthy", "very_unhealthy", "hazardous"]);

/** The single most notable fact in the snapshot, in the spec's urgency order, or null. */
export function notableFrom(a: Ambient | null | undefined): Notable | null {
  if (!a) return null;
  if (a.air && BAD_AIR.has(a.air.category)) return { kind: "air" };
  const k = a.sky?.kind;
  if (k === "storm") return { kind: "storm" };
  if (k === "snow") return { kind: "snow" };
  if (k === "rain" || k === "drizzle" || k === "sleet" || k === "hail") return { kind: "rain" };
  let best: { route: string; minutes: number } | null = null;
  for (const s of a.stops ?? []) {
    for (const l of s.lines ?? []) {
      if (Number.isFinite(l.minutes) && l.minutes >= 1 && l.minutes <= 10 && (!best || l.minutes < best.minutes)) {
        best = { route: String(l.route).slice(0, 12), minutes: Math.round(l.minutes) };
      }
    }
  }
  if (best) return { kind: "bus", route: best.route, minutes: best.minutes };
  if (a.traffic && (a.traffic.level === "heavy" || a.traffic.delayMin >= 10)) return { kind: "traffic" };
  return null;
}

export function notableSentence(lang: Lang, n: Notable): string {
  const tpl = UI[lang].notable[n.kind];
  return tpl.replace("{route}", n.route ?? "").replace("{n}", String(n.minutes ?? "")).replace(/\s{2,}/g, " ").trim();
}

/**
 * The greeting line, shown (and, when spoken, said) identically.
 * `hour` is the local hour at the place (0-23); `first` is the first open of this browser session.
 */
export function greeting(lang: Lang, title: Title, hour: number, ambient: Ambient | null, first: boolean): string {
  const part = greetingPart(hour);
  const fact = notableFrom(ambient);
  if (!fact) return jarvisGreeting(lang, part, title, first);
  const hello = jarvisGreeting(lang, part, title, false);
  const sentence = notableSentence(lang, fact);
  return lang === "zh" ? `${hello}${sentence}` : `${hello} ${sentence}`;
}
