// Bus arrivals from a timetable (first/last departure + headway per route).
// A GTFS / GTFS-Realtime provider can implement the same functions later.

import raw from "@/data/erdenet.sample.json";

export type StopNames = Partial<Record<"mn" | "en" | "ru" | "zh" | "de", string>>;
export interface Stop {
  id: string;
  names: StopNames;
}
export interface Route {
  id: string;
  names: StopNames;
  stops: Array<{ stop: string; offsetMin: number }>;
  firstDeparture: string; // "HH:MM" from the first stop
  lastDeparture: string;
  headwayMin: number;
}
export interface Timetable {
  city: string;
  timezone: string;
  sample: boolean;
  note: string;
  stops: Stop[];
  routes: Route[];
}

export const timetable = raw as Timetable;

export interface Arrival {
  route: string;
  routeName: string;
  minutes: number; // minutes from now
  time: string; // "HH:MM" local
  towards: string; // last stop id of the route
}

export interface NextBusResult {
  stop: Stop;
  now: string;
  arrivals: Arrival[];
  /** When no bus runs anymore today: first arrival tomorrow per route. */
  tomorrow: Array<{ route: string; time: string }>;
  sampleData: boolean;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Minutes since local midnight in the timetable's time zone. */
export function localMinutes(date: Date, timeZone = timetable.timezone): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Find a stop by id or by its name in any language (loose match). */
export function findStop(query: string, tt: Timetable = timetable): Stop | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const byId = tt.stops.find((s) => s.id === query);
  if (byId) return byId;
  return (
    tt.stops.find((s) => Object.values(s.names).some((n) => n && norm(n) === q)) ??
    tt.stops.find((s) => Object.values(s.names).some((n) => n && (norm(n).includes(q) || q.includes(norm(n)))))
  );
}

/** Next arrivals at a stop, at most `limit` per route, sorted by time. */
export function nextArrivals(
  stopQuery: string,
  nowMin: number,
  opts: { route?: string; limit?: number } = {},
  tt: Timetable = timetable,
): NextBusResult | { error: string; knownStops: string[] } {
  const stop = findStop(stopQuery, tt);
  if (!stop) {
    return { error: `Unknown stop "${stopQuery}"`, knownStops: tt.stops.map((s) => `${s.id}: ${s.names.mn} / ${s.names.en}`) };
  }
  const limit = opts.limit ?? 2;
  const arrivals: Arrival[] = [];
  const tomorrow: Array<{ route: string; time: string }> = [];

  for (const r of tt.routes) {
    if (opts.route && r.id !== opts.route) continue;
    const at = r.stops.find((s) => s.stop === stop.id);
    if (!at) continue;
    const first = toMin(r.firstDeparture);
    const last = toMin(r.lastDeparture);
    const towards = r.stops[r.stops.length - 1].stop;
    let found = 0;
    for (let dep = first; dep <= last && found < limit; dep += r.headwayMin) {
      const arr = dep + at.offsetMin;
      if (arr >= nowMin) {
        arrivals.push({ route: r.id, routeName: r.names.en ?? r.id, minutes: arr - nowMin, time: fmt(arr), towards });
        found++;
      }
    }
    if (found === 0) tomorrow.push({ route: r.id, time: fmt(first + at.offsetMin) });
  }

  arrivals.sort((a, b) => a.minutes - b.minutes);
  return { stop, now: fmt(nowMin), arrivals, tomorrow, sampleData: tt.sample };
}

/** Compact stop list for the assistant's instructions. */
export function stopDirectory(tt: Timetable = timetable): string {
  const lines = tt.stops.map((s) => {
    const routes = tt.routes.filter((r) => r.stops.some((x) => x.stop === s.id)).map((r) => r.id);
    return `- ${s.id}: ${Object.values(s.names).join(" / ")} (routes ${routes.join(", ")})`;
  });
  const routes = tt.routes.map(
    (r) => `- Route ${r.id}: ${r.stops.map((x) => x.stop).join(" → ")}, every ${r.headwayMin} min, ${r.firstDeparture}–${r.lastDeparture}`,
  );
  return `City: ${tt.city}${tt.sample ? " (SAMPLE timetable for the demo)" : ""}\nStops:\n${lines.join("\n")}\nRoutes:\n${routes.join("\n")}`;
}

export interface TripOption {
  route: string;
  departs: string; // at the start stop
  arrives: string; // at the destination
  waitMinutes: number;
  rideMinutes: number;
}

/** Direct trips between two stops (no transfers), soonest first. */
export function planTrip(
  fromQuery: string,
  toQuery: string,
  nowMin: number,
  tt: Timetable = timetable,
): { from: Stop; to: Stop; options: TripOption[]; sampleData: boolean } | { error: string; knownStops: string[] } {
  const from = findStop(fromQuery, tt);
  const to = findStop(toQuery, tt);
  if (!from || !to) {
    return {
      error: `Unknown stop "${!from ? fromQuery : toQuery}"`,
      knownStops: tt.stops.map((s) => `${s.id}: ${s.names.mn} / ${s.names.en}`),
    };
  }
  const options: TripOption[] = [];
  for (const r of tt.routes) {
    const a = r.stops.find((s) => s.stop === from.id);
    const b = r.stops.find((s) => s.stop === to.id);
    if (!a || !b || b.offsetMin <= a.offsetMin) continue;
    const first = toMin(r.firstDeparture);
    const last = toMin(r.lastDeparture);
    for (let dep = first; dep <= last; dep += r.headwayMin) {
      const at = dep + a.offsetMin;
      if (at >= nowMin) {
        options.push({
          route: r.id,
          departs: fmt(at),
          arrives: fmt(dep + b.offsetMin),
          waitMinutes: at - nowMin,
          rideMinutes: b.offsetMin - a.offsetMin,
        });
        break;
      }
    }
  }
  options.sort((x, y) => x.waitMinutes - y.waitMinutes);
  return { from, to, options, sampleData: tt.sample };
}
