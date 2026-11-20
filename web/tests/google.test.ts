import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleAuthError, listRecentMail, senderName } from "@/lib/google";
import { runTool, type ToolStep } from "@/lib/tools";
import type { ToolContext } from "@/lib/tools/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TOKEN = "ya29.test-token";

/** A fake Gmail API: `count` messages in the list, metadata for each. */
function gmailFetch(count: number) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    const u = new URL(url);
    if (u.pathname.endsWith("/messages")) {
      return Response.json({ messages: Array.from({ length: count }, (_, i) => ({ id: `m${i}` })) });
    }
    const id = u.pathname.split("/").pop();
    return Response.json({
      id,
      snippet: "Your order &amp; invoice &#39;123&#39;",
      internalDate: String(Date.UTC(2026, 10, 20, 1, 0)),
      payload: {
        headers: [
          { name: "From", value: id === "m0" ? '"NVIDIA" <news@nvidia.com>' : "noreply@school.mn" },
          { name: "Subject", value: `Subject ${id}` },
          { name: "Date", value: "Fri, 20 Nov 2026 09:00:00 +0800" },
        ],
      },
    });
  });
}

describe("listRecentMail", () => {
  it("maps headers to display names and caps at 10", async () => {
    const fetchMock = gmailFetch(12);
    vi.stubGlobal("fetch", fetchMock);
    const mail = await listRecentMail(TOKEN, { query: "in:inbox newer_than:1d", max: 50 });

    expect(mail).toHaveLength(10);
    expect(mail[0]).toEqual({ from: "NVIDIA", subject: "Subject m0", date: "2026-11-20T01:00:00.000Z", snippet: "Your order & invoice '123'" });
    expect(mail[1].from).toBe("school.mn"); // bare address -> domain, never the address
    expect(JSON.stringify(mail)).not.toContain("@");

    const listUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(listUrl.searchParams.get("maxResults")).toBe("10");
    expect(listUrl.searchParams.get("q")).toBe("in:inbox newer_than:1d");
    expect(fetchMock).toHaveBeenCalledTimes(11); // 1 list + 10 metadata
    const getUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(getUrl.searchParams.get("format")).toBe("metadata");
    expect(getUrl.searchParams.getAll("metadataHeaders")).toEqual(["From", "Subject", "Date"]);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("returns an empty list when nothing matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ resultSizeEstimate: 0 })));
    expect(await listRecentMail(TOKEN, { query: "from:nobody", max: 5 })).toEqual([]);
  });

  it("throws GoogleAuthError on 401 and 403, flagging a missing Gmail scope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: 401 } }, { status: 401 })));
    const e401 = await listRecentMail(TOKEN, { query: "", max: 10 }).catch((e) => e);
    expect(e401).toBeInstanceOf(GoogleAuthError);
    expect(e401.missingScope).toBe(false);
    expect(String(e401.message)).not.toContain(TOKEN);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: 403, errors: [{ reason: "insufficientPermissions" }] } }, { status: 403 })),
    );
    const e403 = await listRecentMail(TOKEN, { query: "", max: 10 }).catch((e) => e);
    expect(e403).toBeInstanceOf(GoogleAuthError);
    expect(e403.missingScope).toBe(true);
  });

  it("other Gmail failures are plain errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    const e = await listRecentMail(TOKEN, { query: "", max: 10 }).catch((x) => x);
    expect(e).not.toBeInstanceOf(GoogleAuthError);
  });
});

describe("senderName", () => {
  it("keeps only the display name", () => {
    expect(senderName('"Bat, Dorj" <dorj@example.com>')).toBe("Bat, Dorj");
    expect(senderName("Erdenet Mining <info@erdenet.mn>")).toBe("Erdenet Mining");
    expect(senderName("<alerts@bank.mn>")).toBe("bank.mn");
    expect(senderName("")).toBe("unknown");
  });
});

describe("check_email", () => {
  const ctx = (gmailToken?: () => Promise<string | null>): ToolContext => ({
    now: new Date("2026-11-20T10:00:00+08:00"),
    device: { memory: {}, reminders: [] },
    actions: [],
    gmailToken,
  });
  const run = async (input: unknown, c: ToolContext) => {
    const steps: ToolStep[] = [];
    return { out: JSON.parse(await runTool("check_email", input, c, steps)), steps };
  };

  it("errors when Gmail is not connected", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const c of [ctx(), ctx(async () => null)]) {
      const { out, steps } = await run({ query: "from:nvidia" }, c);
      expect(out.error).toMatch(/Gmail is not connected/);
      expect(steps[0].ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns up to 10 messages for a query", async () => {
    vi.stubGlobal("fetch", gmailFetch(3));
    const { out } = await run({ query: "from:nvidia" }, ctx(async () => TOKEN));
    expect(out.count).toBe(3);
    expect(out.messages[0]).toMatchObject({ from: "NVIDIA", subject: "Subject m0" });
  });

  it("asks to reconnect when Google refuses the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 401 })));
    const { out } = await run({ query: "" }, ctx(async () => TOKEN));
    expect(out.error).toMatch(/Reconnect Gmail/);
  });
});
