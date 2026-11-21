import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { codeFileName, formText, TaskCard } from "@/components/aspire/TaskCard";
import { contextNote, ON_IT, SYSTEM } from "@/lib/brain/shared";
import { LANGS } from "@/lib/lang";
import { fillForm, languageTag, MAX_FIELDS, SECRET_FIELD, taskTools, writeCode } from "@/lib/tools/tasks";
import type { TaskAction, Title, ToolContext } from "@/lib/tools/types";

const ctx = (title?: Title): ToolContext => ({ now: new Date("2026-11-21T09:00:00Z"), device: { memory: {}, reminders: [], settings: { title } }, actions: [] });

describe("write_code", () => {
  it("puts a code card on screen, keeps indentation, never echoes the code back", async () => {
    const c = ctx();
    const out = (await writeCode.run({ language: " Python ", title: " Sum ", code: "\n\n    def f():\n        return 1\n  \n" }, c)) as Record<string, unknown>;
    expect(c.actions).toEqual([{ type: "code", language: "python", title: "Sum", code: "    def f():\n        return 1" }]);
    expect(out).toMatchObject({ shown: "code card", language: "python", lines: 2 });
    expect(JSON.stringify(out)).not.toContain("return 1");
  });

  it("rejects empty code and cleans odd languages", async () => {
    const c = ctx();
    expect(await writeCode.run({ language: "js", title: "x", code: "  " }, c)).toEqual({ error: "code is required" });
    expect(c.actions).toEqual([]);
    expect(languageTag("<script>")).toBe("text");
    expect(languageTag(42)).toBe("text");
    expect(languageTag("C++")).toBe("c++");
    expect(languageTag("C#")).toBe("c#");
  });

  it("caps very long code", async () => {
    const c = ctx();
    const out = await writeCode.run({ language: "text", title: "", code: "a".repeat(50_000) }, c);
    const a = c.actions[0] as Extract<TaskAction, { type: "code" }>;
    expect(a.code.length).toBe(20_000);
    expect(a.title).toBe("text");
    expect(out).toHaveProperty("truncated");
    expect(await writeCode.run({ language: "js", title: "x", code: "1" }, ctx())).not.toHaveProperty("truncated");
  });
});

describe("fill_form", () => {
  it("shows the form, keeps empty values empty and reports them", async () => {
    const c = ctx();
    const out = await fillForm.run(
      {
        title: "Hotel booking",
        fields: [{ label: "Name", value: "Bat" }, { label: "Passport number", value: "" }, null, { label: "", value: "x" }, "bad", { label: "City", value: 5 }],
      },
      c,
    );
    expect(c.actions).toEqual([
      { type: "form", title: "Hotel booking", fields: [{ label: "Name", value: "Bat" }, { label: "Passport number", value: "" }, { label: "City", value: "" }] },
    ]);
    expect(out).toMatchObject({ shown: "form card", filled: 1, empty: ["Passport number", "City"] });
  });

  it("rejects a form without fields and caps the field count", async () => {
    const c = ctx();
    expect(await fillForm.run({ title: "x", fields: "Name: Bat" }, c)).toHaveProperty("error");
    expect(c.actions).toEqual([]);
    await fillForm.run({ title: "", fields: Array.from({ length: 99 }, (_, i) => ({ label: `F${i}`, value: "v" })) }, c);
    const a = c.actions[0] as Extract<TaskAction, { type: "form" }>;
    expect(a.fields).toHaveLength(MAX_FIELDS);
    expect(a.title).toBe("Form");
  });

  it("blanks passwords, PINs, card, account and ID numbers whatever the model sends", async () => {
    const c = ctx();
    const out = await fillForm.run(
      { title: "Bank", fields: [{ label: "Name", value: "Bat" }, { label: "Card number", value: "4111 1111" }, { label: "Нууц үг", value: "x" }, { label: "Регистрийн дугаар", value: "УБ99" }, { label: "Shipping address", value: "Erdenet" }] },
      c,
    );
    const a = c.actions[0] as Extract<TaskAction, { type: "form" }>;
    expect(a.fields.map((f) => f.value)).toEqual(["Bat", "", "", "", "Erdenet"]);
    expect(out).toMatchObject({ empty: ["Card number", "Нууц үг", "Регистрийн дугаар"] });
    for (const label of ["Password", "PIN", "IBAN", "密码", "Пароль", "Passwort", "Passport number"]) expect(SECRET_FIELD.test(label)).toBe(true);
    for (const label of ["Shipping", "Account name", "Spinner", "Company"]) expect(SECRET_FIELD.test(label)).toBe(false);
  });

  it("declares an array schema with items (Gemini needs it)", () => {
    expect(fillForm.parameters.properties.fields).toMatchObject({ type: "array", items: { type: "object" } });
    expect(taskTools.map((t) => t.name)).toEqual(["write_code", "fill_form"]);
  });
});

describe("TaskCard", () => {
  it("renders code in a monospace block with Copy and Download, escaped", () => {
    const html = renderToString(
      createElement(TaskCard, { action: { type: "code", language: "html", title: "Page", code: "<b>hi</b>" }, lang: "de" }),
    );
    expect(html).toContain("font-mono");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("Kopieren");
    expect(html).toContain("Herunterladen");
    expect(html).toContain("Code / html");
  });

  it("labels a plain-text draft as a draft and wraps it", () => {
    const html = renderToString(createElement(TaskCard, { action: { type: "code", language: "text", title: "Letter", code: "Dear Bat" }, lang: "en" }));
    expect(html).toContain("Draft");
    expect(html).not.toContain("Code / text");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("renders form rows with Copy all and marks empty fields", () => {
    const action: TaskAction = { type: "form", title: "Visa", fields: [{ label: "Name", value: "Bat" }, { label: "Passport", value: "" }] };
    const html = renderToString(createElement(TaskCard, { action, lang: "mn" }));
    expect(html).toContain("Бүгдийг хуулах");
    expect(html).toContain("Та бөглөнө");
    expect(html).not.toContain("Татах");
    expect(formText(action.fields)).toBe("Name: Bat\nPassport: ");
  });

  it("renders nothing for an empty card", () => {
    expect(renderToString(createElement(TaskCard, { action: { type: "code", language: "js", title: "x", code: "" }, lang: "en" }))).toBe("");
    expect(renderToString(createElement(TaskCard, { action: { type: "form", title: "x", fields: [] }, lang: "en" }))).toBe("");
  });

  it("makes safe file names with a sensible extension", () => {
    expect(codeFileName("Sum two numbers", "python")).toBe("Sum-two-numbers.py");
    expect(codeFileName("../../etc/passwd", "bash")).toBe("etc-passwd.sh");
    expect(codeFileName("Хоёр тоо", "c#")).toBe("Хоёр-тоо.cs");
    expect(codeFileName("", "cobol")).toBe("code.txt");
  });
});

describe("On it prompt", () => {
  const run = (title?: Title) => ({ ctx: ctx(title), steps: [], sources: [] });

  it("has an acknowledgement for every language and title, with no symbols", () => {
    for (const t of ["mr", "mrs", ""] as const) for (const l of LANGS) expect(ON_IT[t][l]).toMatch(/^[\p{L}\p{N}\s,.'，。]+$/u);
    expect(ON_IT.mr.en).toBe("On it, sir.");
    expect(ON_IT.mrs.en).toBe("On it, ma'am.");
    expect(ON_IT[""].en).toBe("On it.");
  });

  it("tells the model which acknowledgement to use, neutral when the title is unknown", () => {
    expect(contextNote("en", run("mr"))).toContain('begin with: "On it, sir."');
    expect(contextNote("ru", run("mrs"))).toContain('begin with: "Уже делаю, мэм."');
    expect(contextNote("en", run())).toContain('begin with: "On it."');
    expect(contextNote("en", run("" as Title))).toContain('begin with: "On it."');
  });

  it("explains the task tools and is honest about other apps", () => {
    expect(SYSTEM).toContain("write_code");
    expect(SYSTEM).toContain("fill_form");
    expect(SYSTEM).toContain("never invent personal data");
    expect(SYSTEM).toContain("cannot open or operate apps");
  });
});
