// News headlines from newsdata.io (GET /api/1/latest). Server only: NEWSDATA_API_KEY goes in the URL
// because the API requires it there, so the URL is never logged and never put in an error message.
// Every filter is whitelisted before it reaches the URL; titles are stripped of HTML. One upstream
// call per distinct query per hour per instance (the free plan has a small daily credit budget).
import "server-only";
import { LANGS, type Lang } from "@/lib/lang";
import { UA } from "@/lib/site";

export interface Headline {
  title: string;
  /** The publisher's name as newsdata.io reports it. */
  source: string;
  /** http(s) link to the article. */
  url: string;
  /** ISO instant, or null when the feed gave no usable date. */
  publishedAt: string | null;
  category: string[];
}

export interface NewsQuery {
  country?: string[];
  language?: string[];
  category?: string[];
  q?: string;
  /** How many headlines to return, 1-10 (default 5). */
  size?: number;
}

/** "not_configured" = no NEWSDATA_API_KEY; "unavailable" = newsdata.io failed, timed out or refused. */
export class NewsError extends Error {
  constructor(readonly code: "not_configured" | "unavailable") {
    super(`news ${code}`);
    this.name = "NewsError";
  }
}

// ISO 3166-1 alpha-2 (newsdata.io uses these, lowercase).
const COUNTRIES = new Set(
  ("ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz " +
    "ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr " +
    "ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo " +
    "jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr " +
    "ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro " +
    "rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv " +
    "tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw").split(" "),
);
export const CATEGORIES = [
  "breaking", "business", "crime", "domestic", "education", "entertainment", "environment", "food", "health",
  "lifestyle", "other", "politics", "science", "sports", "technology", "top", "tourism", "world",
] as const;

/** The owner's default mix when the person's country is unknown or has nothing. */
export const DEFAULT_COUNTRIES = ["mn", "cn", "ru", "us", "de"];
export const DEFAULT_CATEGORIES = ["breaking", "business", "domestic", "education", "technology"];

/** A whitelisted lowercase country code, or null ("MN" -> "mn", "Mongolia" -> null). */
export function toCountry(v: unknown): string | null {
  const c = typeof v === "string" ? v.trim().toLowerCase() : "";
  return COUNTRIES.has(c) ? c : null;
}

/** Keeps whitelisted values only, deduplicated, at most 5 (the API's limit per filter). */
function pick(values: string[] | undefined, ok: (v: string) => boolean): string[] {
  return [...new Set((values ?? []).map((v) => String(v).trim().toLowerCase()).filter(ok))].slice(0, 5);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text: tags removed, common entities decoded, whitespace collapsed. */
export function stripHtml(s: unknown, max = 300): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    })
    .replace(/<[^>]*>/g, " ") // tags that were entity-encoded
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** newsdata.io pubDate is "YYYY-MM-DD HH:MM:SS" in UTC. */
function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface RawArticle {
  title?: unknown;
  link?: unknown;
  source_name?: unknown;
  source_id?: unknown;
  pubDate?: unknown;
  category?: unknown;
}

function toHeadlines(results: unknown): Headline[] {
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const r of results as RawArticle[]) {
    const title = stripHtml(r?.title);
    const url = httpUrl(r?.link);
    const key = title.toLowerCase();
    if (!title || !url || seen.has(key)) continue; // the same story often arrives from several outlets
    seen.add(key);
    out.push({
      title,
      source: stripHtml(r.source_name, 60) || stripHtml(r.source_id, 60),
      url,
      publishedAt: isoDate(r.pubDate),
      category: Array.isArray(r.category) ? r.category.map((c) => stripHtml(c, 30)).filter(Boolean).slice(0, 5) : [],
    });
  }
  return out;
}

// An hour: one query costs 24 credits a day per instance (free plan: 200), even with the fallback mix.
const TTL_MS = 60 * 60_000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; value: Promise<Headline[]> }>();

/** Test hook. */
export function clearNewsCache(): void {
  cache.clear();
}

/** The latest headlines for a query. Throws NewsError; never logs or exposes the key. */
export async function latestNews(query: NewsQuery = {}): Promise<Headline[]> {
  const key = process.env.NEWSDATA_API_KEY?.trim();
  if (!key) throw new NewsError("not_configured");

  const params = new URLSearchParams();
  const country = pick(query.country, (c) => COUNTRIES.has(c));
  const language = pick(query.language, (l) => (LANGS as readonly string[]).includes(l));
  const category = pick(query.category, (c) => (CATEGORIES as readonly string[]).includes(c));
  const q = stripHtml(query.q, 100);
  if (country.length) params.set("country", country.join(","));
  if (language.length) params.set("language", language.join(","));
  if (category.length) params.set("category", category.join(","));
  if (q) params.set("q", q);
  params.set("size", "10"); // always the free plan's maximum, so every size shares one cache entry
  const size = Math.min(10, Math.max(1, Math.round(Number(query.size) || 5)));

  const cacheKey = params.toString(); // no key in it
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < TTL_MS) return (await hit.value).slice(0, size);

  const value = (async () => {
    let res: Response;
    try {
      res = await fetch(`https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}&${cacheKey}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
    } catch {
      throw new NewsError("unavailable"); // the original error may carry the URL
    }
    const body = (await res.json().catch(() => null)) as { status?: unknown; results?: unknown } | null;
    if (!res.ok || body?.status !== "success") {
      console.error("news: newsdata.io", res.status); // status only: the body may echo the request
      throw new NewsError("unavailable");
    }
    return toHeadlines(body.results);
  })();
  cache.set(cacheKey, { at: now, value });
  value.catch(() => cache.delete(cacheKey)); // failures are not cached
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return (await value).slice(0, size);
}

/**
 * Headlines for a person: their country in their language (plus English) first; when the country
 * is unknown or has nothing, the default mix. Used by /api/news, get_news and the briefing.
 */
export async function headlinesFor(lang: Lang, country: unknown, size = 5): Promise<Headline[]> {
  const language = [...new Set([lang, "en"])];
  const c = toCountry(country);
  const own = c ? await latestNews({ country: [c], language, category: DEFAULT_CATEGORIES, size }) : [];
  return own.length ? own : latestNews({ country: DEFAULT_COUNTRIES, language, category: DEFAULT_CATEGORIES, size });
}
