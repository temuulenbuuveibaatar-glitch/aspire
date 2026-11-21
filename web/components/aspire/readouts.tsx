// The HUD readouts (docs/design/aspire-v4-hud.md sections 5-6): here-and-now facts from
// /api/ambient, already translated, for HudFrame. A readout with no data is left out.

import { Bus, CarFront, CarTaxiFront, Leaf, MapPin, Thermometer } from "lucide-react";
import type { HudReadout } from "@/components/aspire/HudFrame";
import { AQI_ORDER, type Ambient } from "@/lib/ambient-types";
import type { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

/** Display minus (U+2212) and the unit the person chose; `unit` false gives just the degrees. */
export function temp(c: number, imperial: boolean, unit = true): string {
  const n = Math.round(imperial ? (c * 9) / 5 + 32 : c);
  return `${n < 0 ? "−" : ""}${Math.abs(n)}°${unit ? (imperial ? "F" : "C") : ""}`;
}

/** "Erdenet, GPS", "Erdenet, Set", "Ulaanbaatar, approx." */
function placeLabel(a: Ambient | null, t: T): string {
  if (!a?.place) return t.hud.noLocation;
  const src = a.locatedBy === "device" ? t.hud.gps : a.locatedBy === "city" ? t.hud.set : t.hud.approx;
  return `${a.place}, ${src}`;
}

export function hudReadouts(a: Ambient | null, t: T, opts: { imperial: boolean; openMap: () => void; openLocation: () => void }): HudReadout[] {
  const out: HudReadout[] = [];
  const h = t.hud;
  // A temperature from the network (IP) position is a guess: say so, and let the person fix the place.
  const guessed = !!a && a.locatedBy !== "device" && a.locatedBy !== "city";
  if (a?.weather) {
    const value = `${temp(a.weather.tempC, opts.imperial)} ${a.weather.text}${guessed ? ` (${h.approx})` : ""}`.trim();
    out.push({ id: "weather", icon: <Thermometer />, label: h.weather, value, tone: guessed ? "warn" : undefined, onClick: guessed ? opts.openLocation : undefined });
  }
  if (a?.air) {
    const sev = AQI_ORDER.indexOf(a.air.category);
    out.push({ id: "air", icon: <Leaf />, label: h.air, value: `${h.aqiShort} ${Math.round(a.air.aqi)} ${h.aqi[a.air.category]}`, tone: sev <= 0 ? "ok" : sev <= 2 ? "warn" : "bad" });
  }
  if (a?.traffic) {
    const { level, delayMin } = a.traffic;
    const delay = delayMin >= 1 ? ` +${Math.round(delayMin)} ${h.min}` : "";
    out.push({ id: "traffic", icon: <CarFront />, label: h.traffic, value: `${h.level[level]}${delay}`, tone: level === "light" ? "ok" : level === "moderate" ? "warn" : "bad" });
  }
  if (a?.nextBus) {
    const b = a.nextBus;
    const approx = b.source === "erdenet-live" ? ` (${h.approx})` : "";
    out.push({ id: "bus", icon: <Bus />, label: h.bus, value: `${b.line} ${Math.max(0, Math.round(b.departsInMin))} ${h.min}${approx}`, onClick: opts.openMap, hint: h.openMap });
  }
  const taxi = a?.taxis?.[0];
  if (taxi) {
    const km = taxi.distanceM >= 1000 ? `${(taxi.distanceM / 1000).toFixed(1)} km` : `${Math.round(taxi.distanceM)} m`;
    out.push({ id: "taxi", icon: <CarTaxiFront />, label: h.taxi, value: `${km} ${taxi.name}`.slice(0, 40), onClick: opts.openMap, hint: h.openMap });
  }
  out.push({ id: "map", icon: <MapPin />, label: h.map, value: placeLabel(a, t), tone: guessed ? "warn" : undefined, onClick: opts.openMap, hint: h.openMap });
  return out;
}
