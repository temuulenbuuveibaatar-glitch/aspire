// "On it, sir." Task tools: the result appears in the app as a card (code or a filled-in form).
// Nothing here touches the person's phone or computer apps; the card is the result.
import { type FormField, str, type Tool } from "./types";

export const MAX_CODE = 20_000;
export const MAX_FIELDS = 40;

/** Field labels whose value is never filled in by Aspire (passwords, PINs, card, account and ID numbers), in the 5 languages. */
export const SECRET_FIELD =
  /\b(pass(word|code)?|pin|cvv|cvc|card\s*(number|no)|credit card|iban|account\s*(number|no)|ssn|social security|passport|national id|id number|tax id)\b|регистр|нууц үг|пин[ -]?код|паспорт|密码|卡号|身份证|护照|пароль|номер карты|снилс|passwort|kartennummer|ausweis|reisepass/i;

/** Lowercase language tag ("python", "c++", "c#"); anything odd becomes "text". */
export function languageTag(v: unknown): string {
  const s = str(v, 30).toLowerCase();
  return /^[a-z][a-z0-9+#.-]{0,19}$/.test(s) ? s : "text";
}

/** Keep indentation: drop only blank lines and trailing spaces at the ends. */
const codeText = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_CODE).replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd() : "");

export const writeCode: Tool = {
  name: "write_code",
  label: { mn: "Код", en: "Code" },
  description:
    "Show code the person asked for in a code card inside the app (monospace, with Copy and Download). Use for any code, script, config or query you write, and with language \"text\" for a longer draft (letter, essay, post). Do not repeat it in your spoken reply.",
  parameters: {
    type: "object",
    properties: {
      language: { type: "string", description: "Language tag, lowercase: python, javascript, typescript, html, css, sql, bash, json, java, c, cpp, csharp, go, rust, ... or text" },
      title: { type: "string", description: "Short title of what the code does, in the person's language" },
      code: { type: "string", description: "The complete code, plain text, no markdown fences" },
    },
    required: ["language", "title", "code"],
  },
  async run(input, ctx) {
    const code = codeText(input.code);
    if (!code) return { error: "code is required" };
    const language = languageTag(input.language);
    const title = str(input.title, 120) || language;
    ctx.actions.push({ type: "code", language, title, code });
    const cut = typeof input.code === "string" && input.code.length > MAX_CODE;
    return {
      shown: "code card",
      language,
      lines: code.split("\n").length,
      ...(cut && { truncated: `Only the first ${MAX_CODE} characters fit: tell the person the card is cut off` }),
      note: "The code is on screen with Copy and Download; do not read it aloud",
    };
  },
};

export const fillForm: Tool = {
  name: "fill_form",
  label: { mn: "Маягт", en: "Form" },
  description:
    "Show a filled-in form card inside the app (label: value rows, Copy all). Use only facts the person gave or saved memory; never invent personal data. Leave a value empty when unknown, and always empty for passwords, card numbers, PIN codes and ID numbers.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the form is, e.g. 'Job application' or 'Hotel booking'" },
      fields: {
        type: "array",
        description: "The form fields in order",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Field name" },
            value: { type: "string", description: "Filled-in value, or empty if not known" },
          },
          required: ["label", "value"],
        },
      },
    },
    required: ["title", "fields"],
  },
  async run(input, ctx) {
    const fields: FormField[] = (Array.isArray(input.fields) ? input.fields : [])
      .slice(0, MAX_FIELDS)
      .map((f) => (f && typeof f === "object" ? { label: str((f as FormField).label, 80), value: str((f as FormField).value, 1000) } : null))
      .filter((f): f is FormField => Boolean(f?.label))
      // Enforced here, not only in the prompt: a secret field always stays empty for the person to fill in.
      .map((f) => (SECRET_FIELD.test(f.label) ? { ...f, value: "" } : f));
    if (!fields.length) return { error: "fields are required: a list of {label, value}" };
    const title = str(input.title, 120) || "Form";
    ctx.actions.push({ type: "form", title, fields });
    const empty = fields.filter((f) => !f.value).map((f) => f.label);
    return { shown: "form card", filled: fields.length - empty.length, empty, note: empty.length ? "Tell the person which fields they still need to fill in" : "All fields filled" };
  },
};

export const taskTools: Tool[] = [writeCode, fillForm];
