import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names, letting later Tailwind classes win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Trust boundary: only https URLs reach an img src, iframe or link (protocol-relative ones are upgraded). */
export function httpsUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const p = new URL(u.startsWith("//") ? `https:${u}` : u);
    return p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

/** Display minus (U+2212) and the unit the person chose; `unit` false gives just the degrees. */
export function temp(c: number, imperial: boolean, unit = true): string {
  const n = Math.round(imperial ? (c * 9) / 5 + 32 : c);
  return `${n < 0 ? "−" : ""}${Math.abs(n)}°${unit ? (imperial ? "F" : "C") : ""}`;
}
