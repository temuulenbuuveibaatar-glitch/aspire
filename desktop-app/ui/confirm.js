// The Allow / Deny window. Deny has the focus, so Enter or Space typed into this window by
// accident denies; Escape denies; Allow is enabled only after a short delay (Rust checks it too).
"use strict";

const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);
const answer = (allow) => invoke("confirm_answer", { allow }).catch(() => {});

async function start() {
  const p = await invoke("confirm_info");
  document.documentElement.lang = p.lang || "en";
  $("title").textContent = p.title;
  $("text").textContent = p.text;
  $("deny").textContent = p.deny;
  $("allow").textContent = p.allow;
  $("deny").focus();
  $("deny").addEventListener("click", () => answer(false));
  $("allow").addEventListener("click", () => answer(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") answer(false);
  });
  setTimeout(() => ($("allow").disabled = false), p.delayMs + 100);
}

start().catch(() => answer(false));
