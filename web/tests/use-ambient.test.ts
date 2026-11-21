// What the dashboard, a question and the location buttons wait for: the device position (one lookup
// shared by every caller, short timeouts, a failure remembered so nobody waits for it twice), the
// answer to a refused dashboard request, the snapshot of another place, and the saved settings that
// the briefing, the "Where are you?" prompt and the first dashboard request must not run ahead of.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserState } from "@/lib/device-store";
import { emptyState } from "@/lib/state";
import { devicePosition, positionRefused, resetDevicePosition, retryAfterMs, snapshotFor, whereKey, within } from "@/lib/use-ambient";

type Options = { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number };
type Lookup = { ok: (p: unknown) => void; fail: (e: unknown) => void; options: Options };

/** A fake navigator.geolocation: every lookup waits until the test answers it. */
function geo(touchPoints = 0): Lookup[] {
  const lookups: Lookup[] = [];
  vi.stubGlobal("navigator", {
    maxTouchPoints: touchPoints,
    geolocation: { getCurrentPosition: (ok: Lookup["ok"], fail: Lookup["fail"], options: Options) => void lookups.push({ ok, fail, options }) },
  });
  return lookups;
}
const at = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } });
// GeolocationPositionError: code 1 = the person or the browser said no, 3 = no fix in time.
const REFUSED = { code: 1, PERMISSION_DENIED: 1 };
const TIMED_OUT = { code: 3, PERMISSION_DENIED: 1 };

beforeEach(() => resetDevicePosition());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("devicePosition", () => {
  it("a device without touch gets one coarse try of 4 s and no GPS-grade try", async () => {
    const lookups = geo();
    const pos = devicePosition();
    expect(lookups).toHaveLength(1);
    expect(lookups[0].options).toMatchObject({ enableHighAccuracy: false, timeout: 4_000 });
    lookups[0].fail(TIMED_OUT);
    await expect(pos).resolves.toBeNull();
    expect(lookups).toHaveLength(1);
  });

  it("a phone is asked for GPS-grade accuracy for 6 s, then for whatever fix it has for 4 s", async () => {
    const lookups = geo(5);
    const pos = devicePosition(3);
    expect(lookups[0].options).toMatchObject({ enableHighAccuracy: true, timeout: 6_000 });
    lookups[0].fail(TIMED_OUT);
    await vi.waitFor(() => expect(lookups).toHaveLength(2));
    expect(lookups[1].options).toMatchObject({ enableHighAccuracy: false, timeout: 4_000 });
    lookups[1].ok(at(49.03471, 104.08281));
    await expect(pos).resolves.toEqual({ lat: 49.035, lng: 104.083 });
  });

  it("callers share the one lookup in flight, and its fix is reused for 10 minutes", async () => {
    const lookups = geo();
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const all = [devicePosition(), devicePosition(2), devicePosition(4, { retry: true })];
    expect(lookups).toHaveLength(1);
    lookups[0].ok(at(49.03471, 104.08281));
    expect(await Promise.all(all)).toEqual([{ lat: 49.0347, lng: 104.0828 }, { lat: 49.03, lng: 104.08 }, { lat: 49.0347, lng: 104.0828 }]);
    clock.mockReturnValue(t0 + 9 * 60_000);
    await expect(devicePosition()).resolves.toEqual({ lat: 49.0347, lng: 104.0828 });
    expect(lookups).toHaveLength(1);
    clock.mockReturnValue(t0 + 11 * 60_000);
    void devicePosition();
    expect(lookups).toHaveLength(2);
  });

  it("a lookup that found nothing is not repeated for 10 minutes, except for a button the person pressed", async () => {
    const lookups = geo();
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const first = devicePosition();
    lookups[0].fail(TIMED_OUT);
    await expect(first).resolves.toBeNull();
    // The dashboard and a question, nine minutes on: no position, and no second wait for one.
    clock.mockReturnValue(t0 + 9 * 60_000);
    await expect(devicePosition()).resolves.toBeNull();
    expect(lookups).toHaveLength(1);
    // A location button: the person asked, so the browser is asked again.
    const pressed = devicePosition(4, { retry: true });
    expect(lookups).toHaveLength(2);
    lookups[1].fail(TIMED_OUT);
    await expect(pressed).resolves.toBeNull();
    // Ten minutes after that failure the background callers ask again too.
    clock.mockReturnValue(t0 + 20 * 60_000);
    void devicePosition();
    expect(lookups).toHaveLength(3);
  });

  it("tells a refusal from no fix in time, and never asks twice after a refusal", async () => {
    const lookups = geo(5);
    const refused = devicePosition();
    lookups[0].fail(REFUSED);
    await expect(refused).resolves.toBeNull();
    expect(lookups).toHaveLength(1); // no coarse try: it would put the browser's question up again
    expect(positionRefused()).toBe(true);

    const late = devicePosition(4, { retry: true });
    lookups[1].fail(TIMED_OUT);
    await vi.waitFor(() => expect(lookups).toHaveLength(3));
    lookups[2].fail(TIMED_OUT);
    await expect(late).resolves.toBeNull();
    expect(positionRefused()).toBe(false); // "Location unknown", not "refused"
  });

  it("is null at once where the browser has no location service", async () => {
    vi.stubGlobal("navigator", {});
    await expect(devicePosition()).resolves.toBeNull();
    expect(positionRefused()).toBe(false);
  });
});

describe("within", () => {
  it("a slow lookup is not waited for, and still ends for the next caller", async () => {
    vi.useFakeTimers();
    try {
      const lookups = geo();
      const lookup = devicePosition();
      const soon = within(lookup, 300); // a question: sent without the position after 300 ms
      await vi.advanceTimersByTimeAsync(300);
      await expect(soon).resolves.toBeNull();
      lookups[0].ok(at(49.03471, 104.08281));
      await expect(lookup).resolves.toEqual({ lat: 49.0347, lng: 104.0828 });
      // The next question has it at once.
      await expect(within(devicePosition(3), 300)).resolves.toEqual({ lat: 49.035, lng: 104.083 });
      expect(lookups).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the dashboard snapshot", () => {
  const refusal = (headers: Record<string, string> = {}) => new Response(null, { status: 429, headers });

  it("asks again after a refusal when the server says so, not a whole refresh later", () => {
    expect(retryAfterMs(refusal({ "Retry-After": "60" }))).toBe(60_000);
    // Without a usable header: the normal refresh. Never later than it, and never in a tight loop.
    expect(retryAfterMs(refusal())).toBe(180_000);
    expect(retryAfterMs(refusal({ "Retry-After": "soon" }))).toBe(180_000);
    expect(retryAfterMs(refusal({ "Retry-After": "3600" }))).toBe(180_000);
    expect(retryAfterMs(refusal({ "Retry-After": "1" }))).toBe(5_000);
  });

  it("is not shown for another place: the dashboard gets none and shows its loading state", () => {
    const erdenet = { data: "Erdenet", at: 1, where: whereKey(false, "Erdenet") };
    expect(snapshotFor(erdenet, whereKey(false, "Erdenet"))).toBe(erdenet);
    expect(snapshotFor(erdenet, whereKey(false, "Berlin"))).toBeNull(); // another city was picked
    expect(snapshotFor(erdenet, whereKey(true, "Erdenet"))).toBeNull(); // back to the device's own position
    expect(snapshotFor(null, whereKey(false, "Erdenet"))).toBeNull();
  });
});

describe("the saved settings", () => {
  it("are not loaded on the first render: the empty state means not known yet", () => {
    let out: ReturnType<typeof useUserState> | undefined;
    function Probe() {
      out = useUserState("u1");
      return null;
    }
    renderToString(createElement(Probe));
    expect(out?.loaded).toBe(false);
    expect(out?.state).toEqual(emptyState());
  });

  it("gate the Where prompt, the first dashboard request and the briefing", () => {
    const app = readFileSync(new URL("../components/Assistant.tsx", import.meta.url), "utf8");
    expect(app).toContain("const { device, update, loaded } = useDevice();");
    expect(app).toContain("const whereOpen = ready && loaded && whereAsked === false && !located;");
    expect(app).toContain("const ambientOn = langReady && loaded && whereAsked !== null && (whereAsked || located);");
    expect(app).toContain("ready: ready && loaded && !whereOpen && ambient !== null,");
  });
});
