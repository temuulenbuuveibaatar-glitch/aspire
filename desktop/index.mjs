#!/usr/bin/env node
// Aspire Desktop: lets Aspire do small things on this computer, only after you allow each one.
// Zero dependencies (Node.js 20+ built-ins only). Every job is shown here in full (for an app:
// the exact shortcut or program it starts) and runs only when you type "y". Child processes get
// argument arrays (no shell) and system tools are called by absolute path; job text goes to
// PowerShell through an environment variable, never into the command itself.
import { execFile, spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import {
  checkJob,
  confinedPath,
  describeJob,
  displaySafe,
  formSendKeys,
  matchApp,
  normalizePairCode,
  numberedName,
  PAIR_CODE_RE,
  publicError,
  safeReason,
  serverUrl,
  WINDOWS_APPS,
} from "./escape.mjs";

const DEFAULT_SERVER = "https://aspire-mn.vercel.app";
const POLL_MS = 3000;
const TYPE_DELAY_S = 5;
const run = promisify(execFile);
const platform = process.platform;
const ASPIRE_DIR = path.join(os.homedir(), "Aspire");
// Absolute paths: on Windows a bare program name is looked up in the current folder first.
const POWERSHELL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const OPEN = "/usr/bin/open";
const OSASCRIPT = "/usr/bin/osascript";

if (Number(process.versions.node.split(".")[0]) < 20) {
  console.error("Aspire Desktop needs Node.js 20 or newer.");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Arguments and config

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: aspire-desktop [--server https://aspire-mn.vercel.app] [--unpair]");
  process.exit(0);
}
const serverAt = args.indexOf("--server");
if (serverAt >= 0 && !args[serverAt + 1]) {
  console.error("--server needs an address, for example --server https://aspire-mn.vercel.app");
  process.exit(1);
}
const serverArg = serverAt >= 0 ? args[serverAt + 1] : process.env.ASPIRE_URL;

function configDir() {
  if (platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "aspire-desktop");
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "aspire-desktop");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "aspire-desktop");
}
const CONFIG = path.join(configDir(), "config.json");

function loadConfig() {
  try {
    const c = JSON.parse(readFileSync(CONFIG, "utf8"));
    return typeof c.token === "string" && typeof c.server === "string" ? c : null;
  } catch {
    return null;
  }
}

function saveConfig(c) {
  mkdirSync(path.dirname(CONFIG), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
  chmodSync(CONFIG, 0o600); // also when the file already existed
}

const forget = () => rmSync(CONFIG, { force: true });

// ---------------------------------------------------------------------------------------------
// Terminal

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Nobody can allow jobs without input, so Ctrl+C or a closed input ends the helper.
rl.on("SIGINT", () => process.exit(0));
rl.on("close", () => process.exit(0));

/** The answer, or null when the time runs out. */
async function ask(question, ms) {
  try {
    return (await rl.question(question, ms ? { signal: AbortSignal.timeout(ms) } : undefined)).trim();
  } catch {
    process.stdout.write("\n");
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Server

async function api(server, token, route, body) {
  return fetch(`${server}${route}`, {
    method: body ? "POST" : "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
}

async function pair(server) {
  console.log(`Pair this computer with Aspire (${server}).`);
  console.log("In Aspire, open Settings, Desktop, and press Get pairing code.");
  for (let tries = 0; tries < 3; tries++) {
    const code = normalizePairCode((await ask("Pairing code (10 letters and digits): ")) ?? "");
    if (!PAIR_CODE_RE.test(code)) {
      console.log("The code has 10 letters and digits, like ABCDE-23456.");
      continue;
    }
    const res = await api(server, null, "/api/desktop/pair", { code, deviceName: os.hostname() });
    if (res.ok) {
      const body = await res.json();
      if (typeof body.token !== "string") break;
      const config = { server, token: body.token, deviceId: body.deviceId, name: body.name };
      saveConfig(config);
      console.log(`Paired as "${displaySafe(body.name)}". The token is saved in ${CONFIG}`);
      return config;
    }
    console.log(res.status === 429 ? "Too many tries. Wait a minute." : "That code did not work (wrong or expired). Get a new one in Aspire.");
  }
  console.log("Not paired.");
  process.exit(1);
}

/** flags: { denied: true } when the person said no, { expired: true } when nobody answered in time. */
async function report(config, jobId, ok, message, flags = {}) {
  try {
    await api(config.server, config.token, "/api/desktop/result", { jobId, ok, message: message.slice(0, 300), ...flags });
  } catch {
    console.log("Could not report the result to Aspire.");
  }
}

// ---------------------------------------------------------------------------------------------
// Executors

/**
 * Start a program (no shell) and wait briefly: a quick non-zero exit is a failure, a program
 * still running after 5 seconds is taken as started and left running.
 */
function launch(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { detached: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.unref();
      resolve();
    }, 5000);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? publicError(`${cmd} is not installed.`) : e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(publicError(`${cmd} could not open it (exit ${code}).`));
    });
  });
}

const PS = ["-NoProfile", "-NonInteractive", "-Command"];
/**
 * Run a fixed PowerShell script; the job's value arrives only as $env:ASPIRE_ARG. It runs from
 * System32, never the folder the helper was started in, so a bare name such as chrome.exe can
 * not resolve to a file planted next to the helper (Downloads, a repo).
 */
const SYSTEM_DIR = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
const powershell = (script, value) =>
  run(POWERSHELL, [...PS, script], { cwd: SYSTEM_DIR, env: { ...process.env, ASPIRE_ARG: value }, timeout: 60_000, windowsHide: true });
const startProcess = (target) => powershell("Start-Process -FilePath $env:ASPIRE_ARG", target);

function listFiles(dirs, ext, recursive = true) {
  const out = [];
  for (const dir of dirs) {
    try {
      for (const rel of readdirSync(dir, { recursive })) {
        if (String(rel).toLowerCase().endsWith(ext)) out.push(path.join(dir, String(rel)));
      }
    } catch {
      /* folder missing */
    }
  }
  return out;
}

/**
 * What open_app would start, decided before asking: { label, targets: [{ show, run }] } (tried
 * in order), or null when nothing on this computer fits. `show` is printed in the prompt.
 */
function resolveApp(app) {
  if (platform === "win32") {
    const menus = [
      path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    ];
    const hit = matchApp(app, listFiles(menus, ".lnk").map((f) => ({ name: path.basename(f), target: f })));
    const known = WINDOWS_APPS.get(app.toLowerCase());
    const targets = [known, hit?.target].filter(Boolean).map((t) => ({ show: t, run: t }));
    return targets.length ? { label: hit ? path.basename(hit.target, ".lnk") : app, targets } : null;
  }
  if (platform === "darwin") {
    const dirs = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities", path.join(os.homedir(), "Applications")];
    const hit = matchApp(app, listFiles(dirs, ".app", false).map((f) => ({ name: path.basename(f), target: f })));
    return hit ? { label: path.basename(hit.target, ".app"), targets: [{ show: hit.target, run: hit.target }] } : null;
  }
  const dirs = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    "/var/lib/flatpak/exports/share/applications",
    path.join(os.homedir(), ".local", "share", "applications"),
  ];
  const entries = listFiles(dirs, ".desktop").flatMap((f) => {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      return [];
    }
    if (/^NoDisplay=true$/m.test(text)) return [];
    const id = path.basename(f);
    const name = /^Name=(.+)$/m.exec(text)?.[1] ?? id;
    return [{ name, target: { id, file: f, name } }, { name: id, target: { id, file: f, name } }];
  });
  const hit = matchApp(app, entries);
  return hit ? { label: hit.target.name, targets: [{ show: `${hit.target.name} (${hit.target.file})`, run: hit.target.id }] } : null;
}

async function launchApp(resolved) {
  let last;
  for (const t of resolved.targets) {
    try {
      if (platform === "win32") await startProcess(t.run);
      else if (platform === "darwin") await run(OPEN, [t.run], { timeout: 30_000 });
      else await launch("gtk-launch", [t.run]);
      return `Opened ${resolved.label}.`;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function openUrl(url) {
  if (platform === "win32") await startProcess(url);
  else if (platform === "darwin") await run(OPEN, [url], { timeout: 30_000 });
  else await launch("xdg-open", [url]);
  return "Opened the page.";
}

/** Copy `text` to the macOS clipboard (UTF-8, through stdin). */
function pbcopy(text, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/pbcopy", [], { env, stdio: ["pipe", "ignore", "ignore"] });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(publicError("Could not use the clipboard."))));
    child.stdin.end(text);
  });
}

/**
 * macOS: System Events `keystroke` maps characters to keys of the current layout, so Chinese or
 * Cyrillic come out wrong. Each part is pasted instead (Cmd+V), Tab between parts; the old text
 * clipboard is put back afterwards.
 */
async function pasteParts(parts) {
  const env = { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };
  const keys = (what) => run(OSASCRIPT, ["-e", `tell application "System Events" to ${what}`], { timeout: 30_000 });
  let old = "";
  try {
    old = (await run("/usr/bin/pbpaste", [], { env, timeout: 5000 })).stdout;
  } catch {
    /* empty or not text */
  }
  try {
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        await pbcopy(parts[i], env);
        await keys('keystroke "v" using command down');
        await sleep(300); // let the app read the clipboard before it changes
      }
      if (i < parts.length - 1) await keys("key code 48");
    }
  } finally {
    await pbcopy(old, env).catch(() => {});
  }
}

/** Types `parts` into the focused window, pressing Tab between parts. */
async function typeParts(parts) {
  console.log(`Click the window to type into. Typing starts in ${TYPE_DELAY_S} seconds.`);
  for (let s = TYPE_DELAY_S; s > 0; s--) {
    process.stdout.write(`${s} `);
    await sleep(1000);
  }
  process.stdout.write("\n");
  if (platform === "win32") {
    await powershell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($env:ASPIRE_ARG)", formSendKeys(parts));
  } else if (platform === "darwin") {
    await pasteParts(parts);
  } else {
    for (let i = 0; i < parts.length; i++) {
      try {
        if (parts[i]) await run("xdotool", ["type", "--clearmodifiers", "--delay", "12", "--", parts[i]], { timeout: 120_000 });
        if (i < parts.length - 1) await run("xdotool", ["key", "Tab"]);
      } catch (e) {
        if (e.code === "ENOENT") throw publicError("Typing needs xdotool (X11). Install it, for example: sudo apt install xdotool");
        throw e;
      }
    }
  }
  return "Typed.";
}

function saveFile(name, content) {
  mkdirSync(ASPIRE_DIR, { recursive: true, mode: 0o700 });
  const st = lstatSync(ASPIRE_DIR);
  if (!st.isDirectory() || st.isSymbolicLink()) throw publicError("The Aspire folder is not a plain folder.");
  for (let n = 1; n < 100; n++) {
    const file = confinedPath(ASPIRE_DIR, n === 1 ? name : numberedName(name, n));
    if (!file) throw publicError("Not a safe file name.");
    if (existsSync(file)) continue;
    try {
      writeFileSync(file, content, { flag: "wx" }); // never follows or replaces an existing file
      return `Saved ${path.basename(file)} in the Aspire folder.`; // no home path (user name) to the server
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  throw publicError("Too many files with that name.");
}

async function execute(job, resolved) {
  const p = job.payload;
  switch (job.kind) {
    case "open_app":
      return launchApp(resolved);
    case "open_url":
      return openUrl(p.url);
    case "type_text":
      return typeParts([p.text]);
    case "save_file":
      return saveFile(p.name, p.content);
    case "fill_form":
      return typeParts(p.fields.map((f) => f.value));
  }
  throw publicError("Unknown job.");
}

// ---------------------------------------------------------------------------------------------
// Main loop

async function handle(config, raw) {
  const checked = checkJob(raw);
  if (!checked.ok) {
    console.log(`Refused a job from Aspire: ${checked.reason}.`);
    if (typeof raw?.id === "string") await report(config, raw.id, false, `Refused by Aspire Desktop: ${checked.reason}`);
    return;
  }
  const job = checked.job;
  // Decide what an app job starts before asking, so the prompt shows exactly that.
  const resolved = job.kind === "open_app" ? resolveApp(job.payload.app) : null;
  if (job.kind === "open_app" && !resolved) {
    console.log(`Refused a job from Aspire: no app called "${displaySafe(job.payload.app)}" on this computer.`);
    await report(config, job.id, false, `Refused by Aspire Desktop: no app called "${job.payload.app}" on this computer.`);
    return;
  }
  console.log("\n==== Aspire wants to do this on your computer ====");
  for (const line of describeJob(job, ASPIRE_DIR, resolved?.targets.map((t) => t.show))) console.log(line);
  const left = job.expiresAt - Date.now(); // both on this computer's clock
  const answer = left > 0 ? await ask("Allow? Type y to allow, anything else to refuse [y/N]: ", left) : null;
  if (answer === null || Date.now() > job.expiresAt) {
    console.log("Too late: this job expired. Nothing was done.");
    await report(config, job.id, false, "Expired before anyone allowed it.", { expired: true });
    return;
  }
  if (!/^(y|yes)$/i.test(answer)) {
    console.log("Refused. Nothing was done.");
    await report(config, job.id, false, "The person refused.", { denied: true });
    return;
  }
  try {
    const message = await execute(job, resolved);
    console.log(message);
    await report(config, job.id, true, message);
  } catch (e) {
    // The full error (it may name local folders) stays here; the server gets a safe reason.
    console.log(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    await report(config, job.id, false, safeReason(e));
  }
}

async function main() {
  const wanted = serverArg ? serverUrl(serverArg) : null;
  if (serverArg && !wanted) {
    console.error("--server must be an https address (http only for localhost).");
    process.exit(1);
  }
  if (args.includes("--unpair")) {
    forget();
    console.log("This computer is unpaired. Also remove it in Aspire, Settings, Desktop.");
    process.exit(0);
  }
  let config = loadConfig();
  const server = wanted ?? config?.server ?? DEFAULT_SERVER;
  if (!config || config.server !== server) config = await pair(server);

  console.log(`Aspire Desktop is running for ${config.server}. Press Ctrl+C to stop.`);
  console.log(`Files are saved only in ${ASPIRE_DIR}. Every job waits for your y.`);
  let wait = POLL_MS;
  for (;;) {
    let res;
    try {
      res = await api(config.server, config.token, "/api/desktop/next");
    } catch {
      wait = Math.min(wait * 2, 30_000); // offline: back off
      await sleep(wait);
      continue;
    }
    if (res.status === 401) {
      forget();
      console.log("This computer was unlinked in Aspire. Run Aspire Desktop again to pair it.");
      process.exit(1);
    }
    if (!res.ok) {
      await sleep(res.status === 429 ? 60_000 : 30_000);
      continue;
    }
    wait = POLL_MS;
    const body = await res.json().catch(() => ({}));
    if (body.job) await handle(config, body.job);
    else await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
