// Where the person is, from the request: shared by /api/ask and /api/briefing.
import { haversineKm } from "@/lib/maps";
import type { DeviceContext } from "@/lib/tools";
import { validTimeZone } from "@/lib/tools/time";

export interface Where {
  timeZone?: string;
  city?: string;
  country?: string;
  /** Network (IP) position, rounded to 2 decimals. Server only: never sent to the browser. */
  approxLocation?: { lat: number; lng: number };
}

/** Header text from Vercel (URL-encoded) or a client value, without control or markup characters. */
export function cleanText(v: unknown, max: number, decode = false): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v;
  if (decode) {
    try {
      s = decodeURIComponent(v);
    } catch {
      // keep as sent
    }
  }
  s = s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>{}[\]"`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s || undefined;
}

function headerPair(lat: string | null, lng: string | null): { lat: number; lng: number } | undefined {
  if (!lat || !lng) return undefined;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return undefined;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { lat: r2(a), lng: r2(b) };
}

/**
 * Where the person is and their time zone: the device first (client `tz` / `city`, shared location),
 * then Vercel's IP geolocation headers. The network city is dropped when the shared device location
 * is far from the network position (VPNs, travel).
 */
export function whereFrom(
  headers: Headers,
  body: { tz?: unknown; timeZone?: unknown; city?: unknown },
  device: Pick<DeviceContext, "location">,
): Where {
  const network = headerPair(headers.get("x-vercel-ip-latitude"), headers.get("x-vercel-ip-longitude"));
  const networkFits = !device.location || !network || haversineKm(device.location, network) <= 50;
  const timeZone =
    validTimeZone(body.tz) ?? validTimeZone(body.timeZone) ?? (networkFits ? validTimeZone(headers.get("x-vercel-ip-timezone")) : null);
  const city = cleanText(body.city, 80) ?? (networkFits ? cleanText(headers.get("x-vercel-ip-city"), 80, true) : undefined);
  const country = cleanText(headers.get("x-vercel-ip-country"), 2)?.toUpperCase();
  return {
    ...(timeZone ? { timeZone } : {}),
    ...(city ? { city } : {}),
    ...(country && /^[A-Z]{2}$/.test(country) && networkFits ? { country } : {}),
    ...(network ? { approxLocation: network } : {}),
  };
}

