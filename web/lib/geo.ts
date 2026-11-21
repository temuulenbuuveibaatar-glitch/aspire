// Pure geo helpers and Erdenet constants shared by server code and the browser (no env, no fetch).
import type { Lang } from "@/lib/lang";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const GOOGLE_LANG: Record<Lang, string> = { mn: "mn", zh: "zh-CN", en: "en", ru: "ru", de: "de" };
export const googleLanguage = (lang: Lang): string => GOOGLE_LANG[lang] ?? "en";

/** Erdenet's centre; the city's live bus feed covers 30 km around it. */
export const ERDENET_CENTER: LatLng = { lat: 49.0333, lng: 104.0833 };
export const isErdenet = (lat: number, lng: number): boolean => haversineKm({ lat, lng }, ERDENET_CENTER) <= 30;
/** Owner of the Erdenet transit feed, credited wherever its data is shown. */
export const ERDENET_CREDIT = "Орхон ТКХДТ";
