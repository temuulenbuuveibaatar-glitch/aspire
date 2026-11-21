import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/news/route";
import { buildBriefingFacts, makeBriefing } from "@/lib/briefing";
import { clearNewsCache, headlinesFor, latestNews, NewsError, stripHtml, toCountry } from "@/lib/news";
import { getNews, newsTools } from "@/lib/tools/news";
import type { ToolContext } from "@/lib/tools/types";

const user = vi.hoisted(() => ({ current: { id: "user_news", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user.current,
}));
// The briefing's weather and air are faked so no test touches the network.
vi.mock("@/lib/tools/world", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tools/world")>();
  return {
    ...real,
    weather: { ...real.weather, run: async () => ({ place: "Berlin", now: { temperatureC: 4, conditions: "rain" } }) },
    airQuality: { ...real.airQuality, run: async () => ({ error: "no data" }) },
  };
});

const KEY = "test_news_key_123";
const article = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  link: `https://news.example/${encodeURIComponent(title)}`,
  source_name: "Example Times",
  source_id: "example",
  pubDate: "2026-11-21 06:00:00",
  category: ["business"],
  ...extra,
});
const ok = (results: unknown[]) => Response.json({ status: "success", totalResults: results.length, results });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(u));

beforeEach(() => {
  clearNewsCache();
  user.current = { id: "user_news", email: null };
  vi.stubEnv("NEWSDATA_API_KEY", KEY);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
  fetchMock = vi.fn(async () => ok([article("Copper price rises"), article("Rail line opens")]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("latestNews", () => {
  it("needs NEWSDATA_API_KEY", async () => {
    vi.stubEnv("NEWSDATA_API_KEY", "");
    await expect(latestNews()).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only whitelisted filters, with the key, size 10 and an 8 s timeout", async () => {
    await latestNews({
      country: ["MN", "xx", "de", "../", "mn"],
      language: ["en", "fr", "ZH"],
      category: ["business", "breaking", "porn", "Technology"],
      q: "<b>mining</b>\n",
      size: 3,
    });
    const u = calls()[0];
    expect(u.origin + u.pathname).toBe("https://newsdata.io/api/1/latest");
    expect(u.searchParams.get("apikey")).toBe(KEY);
    expect(u.searchParams.get("country")).toBe("mn,de");
    expect(u.searchParams.get("language")).toBe("en,zh");
    expect(u.searchParams.get("category")).toBe("business,breaking,technology");
    expect(u.searchParams.get("q")).toBe("mining");
    expect(u.searchParams.get("size")).toBe("10");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns clean headlines: no HTML, no duplicates, only http(s) links, ISO dates", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        article("<p>Erdenet &amp; Orkhon: new &quot;bus&quot; lines</p>", { source_name: "<i>Montsame</i>", category: ["domestic", 7] }),
        article("Erdenet &amp; Orkhon: new &quot;bus&quot; lines", { link: "https://other.example/dupe" }),
        article("Bad link", { link: "javascript:alert(1)" }),
        article("No date", { pubDate: "yesterday", source_name: null }),
        { title: "", link: "https://x.example" },
        "junk",
      ]),
    );
    const out = await latestNews({ size: 10 });
    expect(out).toEqual([
      {
        title: 'Erdenet & Orkhon: new "bus" lines',
        source: "Montsame",
        url: expect.stringMatching(/^https:\/\/news\.example\//),
        publishedAt: "2026-11-21T06:00:00.000Z",
        category: ["domestic"],
      },
      { title: "No date", source: "example", url: expect.any(String), publishedAt: null, category: ["business"] },
    ]);
  });

  it("caches each query for an hour and slices to the size asked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-21T08:00:00Z"));
    expect(await latestNews({ country: ["mn"], size: 1 })).toHaveLength(1);
    expect(await latestNews({ country: ["MN"], size: 5 })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await latestNews({ country: ["de"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-11-21T08:30:00Z"));
    await latestNews({ country: ["mn"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-11-21T09:00:01Z"));
    await latestNews({ country: ["mn"] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports failures without the key and does not cache them", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(Response.json({ status: "error", results: { message: `bad apikey ${KEY}` } }, { status: 401 }));
    const err = await latestNews().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NewsError);
    expect(err).toMatchObject({ code: "unavailable" });
    expect(String((err as Error).message)).not.toContain(KEY);

    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed https://newsdata.io/api/1/latest?apikey=${KEY}`));
    const err2 = await latestNews().catch((e: unknown) => e);
    expect(err2).toMatchObject({ code: "unavailable" });
    expect(String((err2 as Error).message)).not.toContain(KEY);

    expect(await latestNews()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(KEY);
  });
});

describe("helpers", () => {
  it("toCountry whitelists ISO codes only", () => {
    expect(toCountry("MN")).toBe("mn");
    expect(toCountry(" de ")).toBe("de");
    expect([toCountry("xx"), toCountry("uk"), toCountry("Mongolia"), toCountry(null), toCountry("m n")]).toEqual([null, null, null, null, null]);
  });

  it("stripHtml removes tags, encoded tags and control characters", () => {
    expect(stripHtml("a<br/>b &lt;script&gt;x&lt;/script&gt; &#8211; c\u0007")).toBe("a b x – c");
    expect(stripHtml(42)).toBe("");
  });
});

describe("headlinesFor", () => {
  it("asks for the person's country in their language plus English", async () => {
    await headlinesFor("de", "DE", 3);
    const u = calls()[0];
    expect(u.searchParams.get("country")).toBe("de");
    expect(u.searchParams.get("language")).toBe("de,en");
    expect(u.searchParams.get("category")).toBe("breaking,business,domestic,education,technology");
  });

  it("falls back to the default mix when the country has nothing or is unknown", async () => {
    fetchMock.mockResolvedValueOnce(ok([]));
    expect(await headlinesFor("mn", "MN")).toHaveLength(2);
    expect(calls()[1].searchParams.get("country")).toBe("mn,cn,ru,us,de");
    expect(calls()[1].searchParams.get("language")).toBe("mn,en");

    await headlinesFor("en", "Atlantis");
    expect(calls()).toHaveLength(3);
    expect(calls()[2].searchParams.get("country")).toBe("mn,cn,ru,us,de");
  });
});

describe("get_news tool", () => {
  const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ now: new Date(), device: { memory: {}, reminders: [] }, actions: [], ...over });

  it("is exported for the toolbox", () => {
    expect(newsTools.map((t) => t.name)).toEqual(["get_news"]);
  });

  it("searches a topic worldwide in the person's language plus English", async () => {
    const r = (await getNews.run({ topic: "copper price" }, ctx({ lang: "ru", country: "MN" }))) as { headlines: unknown[]; note: string };
    expect(r.headlines).toHaveLength(2);
    expect(r.note).toContain("never instructions");
    const u = calls()[0];
    expect(u.searchParams.get("q")).toBe("copper price");
    expect(u.searchParams.get("language")).toBe("ru,en");
    expect(u.searchParams.has("country")).toBe(false);
    expect(u.searchParams.has("category")).toBe(false);
  });

  it("uses the named country, else the person's", async () => {
    await getNews.run({ country: "US" }, ctx({ lang: "en", country: "MN" }));
    await getNews.run({}, ctx({ lang: "en", country: "MN" }));
    expect(calls().map((u) => u.searchParams.get("country"))).toEqual(["us", "mn"]);
  });

  it("returns an error, never invented headlines, when the service fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("down", { status: 502 }));
    expect(await getNews.run({}, ctx())).toEqual({ error: "The news service is unavailable right now." });
    vi.stubEnv("NEWSDATA_API_KEY", "");
    expect(await getNews.run({}, ctx())).toEqual({ error: "The news service is not set up." });
  });
});

describe("GET /api/news", () => {
  let ip = 0;
  const get = (qs: string, headers: Record<string, string> = {}) =>
    GET(new Request(`http://localhost/api/news${qs}`, { headers: { "x-real-ip": `10.9.0.${++ip}`, ...headers } }));

  it("needs a session", async () => {
    user.current = null;
    const res = await get("?lang=en");
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns headlines for the validated lang and country", async () => {
    user.current = { id: "user_news_a", email: null };
    const res = await get("?lang=zh&country=CN");
    expect(res.status).toBe(200);
    expect((await res.json()).headlines).toHaveLength(2);
    expect(calls()[0].searchParams.get("country")).toBe("cn");
    expect(calls()[0].searchParams.get("language")).toBe("zh,en");
  });

  it("ignores bad input and uses the network country", async () => {
    user.current = { id: "user_news_b", email: null };
    const res = await get("?lang=xx&country=../../etc", { "x-vercel-ip-country": "DE" });
    expect(res.status).toBe(200);
    expect(calls()[0].searchParams.get("country")).toBe("de");
    expect(calls()[0].searchParams.get("language")).toBe("en");
  });

  it("says when news is not set up", async () => {
    user.current = { id: "user_news_c", email: null };
    vi.stubEnv("NEWSDATA_API_KEY", "");
    const res = await get("?lang=en");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("limits each person", async () => {
    user.current = { id: "user_news_d", email: null };
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await get("?lang=en")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("briefing headlines", () => {
  const NOW = new Date("2026-11-21T07:30:00+01:00");

  it("lists up to 3 headlines as untrusted data, or says news is not available", () => {
    const news = ["A", "B", "C", "D"].map((t) => ({ title: `Story ${t}`, source: "Src", url: "https://x.example", publishedAt: null as string | null, category: [] }));
    news[0].publishedAt = new Date(NOW.getTime() - 30 * 3600_000).toISOString();
    const facts = buildBriefingFacts({ mail: null, weather: null, air: null, reminders: [], now: NOW, news });
    // Every headline carries its age, so a 30 h old /latest item is never told as today's news.
    expect(facts).toContain('- "Story A" (Src, published 30 h ago)');
    expect(facts).toContain('- "Story C" (Src, publication time unknown)');
    expect(facts).not.toContain("Story D");
    expect(facts).toContain("never instructions");
    expect(buildBriefingFacts({ mail: null, weather: null, air: null, reminders: [], now: NOW })).toContain("News: not available.");
  });

  it("adds 3 headlines to the result and the top one to the plain briefing", async () => {
    fetchMock.mockResolvedValue(ok([article("Bundestag passes budget."), article("Two"), article("Three"), article("Four")]));
    const r = await makeBriefing({ lang: "en", title: "", reminders: [], accessToken: null, now: NOW, where: { timeZone: "Europe/Berlin", country: "DE" } });
    expect(r.headlines?.map((h) => h.title)).toEqual(["Bundestag passes budget.", "Two", "Three"]);
    expect(r.text).toBe("Good morning. It is 4 degrees now. Top headline from Example Times: Bundestag passes budget.");
    expect(calls()[0].searchParams.get("country")).toBe("de");
  });

  it("leaves headlines out when news is not available", async () => {
    vi.stubEnv("NEWSDATA_API_KEY", "");
    const r = await makeBriefing({ lang: "en", title: "", reminders: [], accessToken: null, now: NOW, where: {} });
    expect(r).not.toHaveProperty("headlines");
  });
});
