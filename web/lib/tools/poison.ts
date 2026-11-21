// Poisoning (a swallowed battery, bleach, pills, mushrooms): the country's emergency number
// first, then its poison centre. Data only, no network. Each number was checked against the
// official source named beside it on 2026-11-21; a country that could not be verified is left
// out and gets "unknown" (the model then calls call_phone with the emergency number).
import type { Lang } from "@/lib/lang";
import { str, type Tool } from "./types";

interface Line {
  number: string;
  /** Who it serves, for picking the line by city; "" = the whole country. */
  area: string;
}

export const POISON: Record<string, { emergency: string; lines: Line[] }> = {
  // HRSA Poison Help line, poisonhelp.hrsa.gov
  US: { emergency: "911", lines: [{ number: "18002221222", area: "" }] },
  // Health Canada news release 2023-03-20 (canada.ca): 1-844-POISON-X; Quebec keeps its own centre
  CA: {
    emergency: "911",
    lines: [
      { number: "18447647669", area: "" },
      { number: "18004635060", area: "Quebec Québec Montreal Montréal" },
    ],
  },
  // healthdirect (Australian Government), healthdirect.gov.au/poisoning: Poisons Information Centre
  AU: { emergency: "000", lines: [{ number: "131126", area: "" }] },
  // National Poisons Centre, poisons.co.nz
  NZ: { emergency: "111", lines: [{ number: "0800764766", area: "" }] },
  // Tox Info Suisse, toxinfo.ch
  CH: { emergency: "112", lines: [{ number: "145", area: "" }] },
  // BVL (Federal Office of Consumer Protection), list of Giftnotrufzentralen; every centre answers calls from anywhere
  DE: {
    emergency: "112",
    lines: [
      { number: "03019240", area: "Berlin Brandenburg Potsdam" },
      { number: "022819240", area: "Bonn Nordrhein-Westfalen Köln Cologne Düsseldorf Dortmund Essen" },
      { number: "0361730730", area: "Erfurt Thüringen Sachsen Dresden Leipzig Sachsen-Anhalt Magdeburg Mecklenburg-Vorpommern Rostock" },
      { number: "076119240", area: "Freiburg Baden-Württemberg Stuttgart" },
      { number: "055119240", area: "Göttingen Niedersachsen Hannover Bremen Hamburg Schleswig-Holstein Kiel" },
      { number: "0613119240", area: "Mainz Rheinland-Pfalz Hessen Frankfurt Wiesbaden Saarland Saarbrücken" },
      { number: "08919240", area: "München Munich Bayern Bavaria Nürnberg Nuremberg" },
    ],
  },
  // Vergiftungsinformationszentrale Wien, as listed by the BVL
  AT: { emergency: "112", lines: [{ number: "+4314064343", area: "" }] },
};

const WORDS: Record<Lang, { emergency: string; poison: string }> = {
  mn: { emergency: "Яаралтай тусламж", poison: "Хордлогын төв" },
  zh: { emergency: "紧急求助", poison: "中毒控制中心" },
  en: { emergency: "Emergency", poison: "Poison centre" },
  ru: { emergency: "Экстренная помощь", poison: "Токсикологический центр" },
  de: { emergency: "Notruf", poison: "Giftnotruf" },
};

/** The poison line for a city: the one whose area names it, else the country-wide (first) one. */
export function poisonLine(country: string, city = ""): Line | null {
  const lines = POISON[country]?.lines ?? [];
  const c = city.trim().toLowerCase();
  return (c && lines.find((l) => l.area.toLowerCase().split(" ").includes(c))) || lines[0] || null;
}

export const poisonHelp: Tool = {
  name: "poison_help",
  label: { mn: "Хордлого", en: "Poison help" },
  description:
    "Someone swallowed or breathed something harmful (medicine, battery, bleach, cleaning liquid, mushrooms, carbon monoxide). Shows the emergency call button first, then the national poison centre where one is verified. Then say: call now; do not make the person vomit unless the centre tells you to; if they are unconscious, not breathing or having a fit, call the emergency number. If it returns poisonCentre 'unknown', call call_phone with the country's emergency number.",
  parameters: {
    type: "object",
    properties: { country: { type: "string", description: "ISO 3166-1 alpha-2 code, e.g. 'DE'. Empty string = the person's country." } },
    required: ["country"],
  },
  async run(input, ctx) {
    const country = (str(input.country, 40) || ctx.country || "").toUpperCase();
    const entry = /^[A-Z]{2}$/.test(country) ? POISON[country] : undefined;
    const advice = "Call now. Do not make the person vomit unless the centre tells you to.";
    if (!entry) return { country: country || "unknown", poisonCentre: "unknown", advice };
    const w = WORDS[ctx.lang ?? "en"] ?? WORDS.en;
    const line = poisonLine(country, ctx.city);
    ctx.actions.push({ type: "call", number: entry.emergency, label: `${w.emergency} ${entry.emergency}`, known: true });
    if (line) ctx.actions.push({ type: "call", number: line.number, label: w.poison, known: true });
    return { country, emergency: entry.emergency, poisonCentre: line?.number ?? "unknown", shown: "call buttons", advice };
  },
};

export const poisonTools: Tool[] = [poisonHelp];
