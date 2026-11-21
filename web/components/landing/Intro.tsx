"use client";

// The opening of the opening page: for 1.2 seconds, once per browser session, a black screen with
// the core (the still orb inside its gauge), one line in mono and a counter from 000 to 100 in giant
// figures where the headline will stand; then the screen opens in a circle from the orb onto the
// hero, whose own core sits in the same place.
//
// The page has one inline script: it sets the document's language, and the whole intro belongs to
// it. It runs while the page is being parsed, before the first paint, builds the overlay itself and
// adds it to the end of <body>, outside anything React
// renders, so hydration (or React rendering the page again in the browser) can neither restart it
// nor leave it behind. It also marks the page it was sent with (data-lp-intro on the script's
// parent, the page's root): landing.css then starts the hero's entrance as the screen opens.
// How it stays out of the way:
// - No JavaScript, reduced motion, Calm mode, a phone or a touch screen, or a second visit in the
//   tab: the script adds nothing.
// - The overlay never takes a click or a tap (pointer-events: none), and a wheel, a touch, a key or
//   a press ends it at once.
// - Once started it is CSS only (transform, opacity and clip-path: landing.css), so it keeps time
//   while the page's own scripts are still loading, and the script removes it when it is over.
// A client component, so that the script tag is inert when React renders the page in the browser
// (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).

import { useEffect } from "react";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { CORE } from "./HeroScene";

/** sessionStorage key: the intro has played in this tab. */
const KEY = "aspire-intro-v1";
/** The whole intro, in ms. landing.css times the overlay's animations and the hero's entrance to it. */
const TOTAL = 1200;
/** When the hero's entrance starts, in ms into the intro: as the screen opens (--lp-t0 in landing.css). */
const ENTRANCE = 800;

/* ---- the circle that opens ---- */

/** Points on the circle: enough that the polygon reads as round while it moves. */
const POINTS = 48;

/**
 * The overlay with a round hole of `radius` at the core (--lp-core-x and --lp-core-y, the measures
 * the hero places its own core by), as a clip-path: a polygon clipped by the
 * even-odd rule (the screen's outline, then a circle inside it), so only what lies between the two
 * stays. clip-path: circle() keeps the inside, which is the opposite of what an opening needs.
 */
function hole(radius: string): string {
  const ring: string[] = [];
  for (let k = 0; k <= POINTS; k++) {
    const a = (k / POINTS) * Math.PI * 2;
    ring.push(`calc(var(--lp-core-x) + ${radius} * ${Math.cos(a).toFixed(3)}) calc(var(--lp-core-y) + ${radius} * ${Math.sin(a).toFixed(3)})`);
  }
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${ring.join(", ")})`;
}

/* ---- the counter ---- */

// Three reels of digits that roll like an odometer. The count eases out (fast, then slow into
// 100); the easing is written into the keyframe times, so each reel moves in straight steps: the
// ones roll all the way, the tens only while the ones pass from 9 to 0, the hundreds once.
const at = (n: number) => `${Number(((1 - Math.sqrt(1 - n / 100)) * 100).toFixed(2))}%`;
const reel = (name: string, stops: [n: number, rows: number][]) =>
  `@keyframes ${name} {\n${stops.map(([n, rows]) => `  ${at(n)} {\n    transform: translate3d(0, ${rows ? `${-rows}em` : "0"}, 0);\n  }`).join("\n")}\n}`;

const tens: [number, number][] = [[0, 0]];
for (let k = 0; k < 10; k++) tens.push([10 * k + 9, k], [10 * k + 10, k + 1]);

/**
 * The intro's keyframes. They are written out in landing.css, between the two "intro keyframes"
 * comments, exactly as this builds them (tests/landing.test.ts compares the two): a stylesheet is
 * cached, a style tag in the page would be sent with every visit.
 */
export const INTRO_KEYFRAMES = [
  `@keyframes lp-iris {\n  from {\n    clip-path: ${hole("0vmax")};\n  }\n  to {\n    clip-path: ${hole("92vmax")};\n  }\n}`,
  reel(
    "lp-reel-1",
    Array.from({ length: 11 }, (_, k) => [k * 10, k * 10]),
  ),
  reel("lp-reel-10", tens),
  reel("lp-reel-100", [
    [0, 0],
    [99, 0],
    [100, 1],
  ]),
].join("\n");

/* ---- the overlay and its script ---- */

const digits = (count: number) => Array.from({ length: count }, (_, i) => i % 10).join("\n");
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** What the overlay holds: the wordmark where the bar has it, the core, the line and the counter. */
function overlay(line: string): string {
  return (
    `<div class="lp-intro-top"><span class="lp-wordmark" lang="en">Aspire</span></div>` +
    CORE +
    `<p class="lp-intro-line"><span class="lp-label">${escapeHtml(line)}</span>` +
    `<span class="lp-odo numeral"><span class="lp-reel lp-reel-100">${digits(2)}</span><span class="lp-reel lp-reel-10">${digits(11)}</span><span class="lp-reel lp-reel-1">${digits(101)}</span></span></p>`
  );
}

/**
 * The script, with the overlay's markup inside it. "<" is escaped so nothing in it can close the tag.
 * Its first statement sets the document's language: the root layout renders <html lang="en">, and
 * screen readers and search engines that run scripts should get the page's own.
 */
function script(line: string, lang: string): string {
  const data = JSON.stringify({ html: overlay(line), lang }).replace(/</g, "\\u003c");
  return [
    `document.documentElement.lang=${JSON.stringify(lang)};`,
    `(function(){try{var d=document,w=window,k="${KEY}",r=d.currentScript&&d.currentScript.parentNode,c=${data};`,
    // Not in Calm mode, not under reduced motion, not on a phone or a touch screen (it is busiest in
    // exactly that second, and the headline should not wait), not on a second visit in this tab.
    `if(d.documentElement.getAttribute("data-calm")==="true"||!w.matchMedia||w.matchMedia("(prefers-reduced-motion: reduce)").matches||w.matchMedia("(pointer: coarse), (max-width: 47.99rem)").matches||w.sessionStorage.getItem(k))return;`,
    `w.sessionStorage.setItem(k,"1");`,
    // The overlay, at the end of <body>.
    `var o=d.createElement("div");o.className="lp-intro";o.lang=c.lang;o.setAttribute("aria-hidden","true");o.innerHTML=c.html;d.body.appendChild(o);`,
    // Mark the page. A streamed page is parsed inside a hidden holder and moved into place a moment
    // later: until then, count down the wait before its entrance, so the headline still rises as
    // the screen opens and not that moment later.
    // (Written with ">" only: the script holds no "<" at all, so nothing in it can end the tag early.)
    `if(r&&r.setAttribute){r.setAttribute("data-lp-intro","");var t=w.performance.now(),u=function(){var s=w.performance.now()-t;if(${TOTAL}>s&&r.closest("[hidden]")){r.style.setProperty("--lp-t0",Math.max(0,${ENTRANCE}-s)+"ms");w.requestAnimationFrame(u)}};u()}`,
    // Any input ends the intro; otherwise the clock does.
    `var e=["wheel","touchstart","keydown","pointerdown"],z=0,f=function(){if(z)return;z=1;o.remove();e.forEach(function(n){w.removeEventListener(n,f)})};`,
    `e.forEach(function(n){w.addEventListener(n,f,{passive:true})});w.setTimeout(f,${TOTAL + 80})}catch(x){}})()`,
  ].join("");
}

export function Intro({ line, lang }: { line: string; lang: Lang }) {
  const tag = HTML_LANG[lang];
  // A page React renders in the browser (a client-side navigation) never runs the script below.
  useEffect(() => {
    document.documentElement.lang = tag;
  }, [tag]);
  return (
    // text/plain in the browser: React then never treats it as a script to run, or warns about one.
    <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: script(line, tag) }} />
  );
}
