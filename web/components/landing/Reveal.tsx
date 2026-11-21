"use client";

// Scroll reveals for the opening page. Everything is visible by default (no JS, a slow script or a
// missed observer can never leave content hidden); an element that is still below the screen plays
// its entrance once, at the moment it scrolls into view.
import { useEffect } from "react";

export function Reveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.in = "";
        io.unobserve(e.target);
      }
    });
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return null;
}
