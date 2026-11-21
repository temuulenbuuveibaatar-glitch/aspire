"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import type { Lang } from "@/lib/lang";
import type { TaskAction } from "@/lib/tools/types";

const TEXT: Record<Lang, { code: string; draft: string; form: string; copy: string; copyAll: string; copied: string; download: string; empty: string }> = {
  mn: { code: "Код", draft: "Ноорог", form: "Маягт", copy: "Хуулах", copyAll: "Бүгдийг хуулах", copied: "Хуулсан", download: "Татах", empty: "Та бөглөнө" },
  zh: { code: "代码", draft: "草稿", form: "表格", copy: "复制", copyAll: "全部复制", copied: "已复制", download: "下载", empty: "请您填写" },
  en: { code: "Code", draft: "Draft", form: "Form", copy: "Copy", copyAll: "Copy all", copied: "Copied", download: "Download", empty: "For you to fill in" },
  ru: { code: "Код", draft: "Черновик", form: "Форма", copy: "Копировать", copyAll: "Копировать всё", copied: "Скопировано", download: "Скачать", empty: "Заполните сами" },
  de: { code: "Code", draft: "Entwurf", form: "Formular", copy: "Kopieren", copyAll: "Alles kopieren", copied: "Kopiert", download: "Herunterladen", empty: "Bitte selbst ausfüllen" },
};

const EXT: Record<string, string> = {
  javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx", python: "py", py: "py",
  java: "java", kotlin: "kt", swift: "swift", c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", "c#": "cs", cs: "cs",
  go: "go", rust: "rs", ruby: "rb", php: "php", html: "html", css: "css", json: "json", sql: "sql", bash: "sh",
  sh: "sh", shell: "sh", powershell: "ps1", yaml: "yml", yml: "yml", xml: "xml", markdown: "md", md: "md", r: "r", dart: "dart",
};

/** A safe download name: the title's letters and digits plus the language's extension ("txt" if unknown). */
export function codeFileName(title: string, language: string): string {
  const base = title.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "code";
  return `${base}.${EXT[language.toLowerCase()] ?? "txt"}`;
}

/** "Label: value" lines for Copy all (empty values stay empty). */
export const formText = (fields: { label: string; value: string }[]): string => fields.map((f) => `${f.label}: ${f.value}`).join("\n");

const BTN =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-2 px-4 text-body font-medium text-ink hover:bg-panel-3 focus-visible:outline-2 focus-visible:outline-accent";

/** Result of "On it": a code block (Copy, Download) or a filled-in form (Copy all). No syntax highlighting. */
export function TaskCard({ action, lang }: { action: TaskAction; lang: Lang }) {
  const t = TEXT[lang] ?? TEXT.en;
  const [copied, setCopied] = useState(false);
  const isCode = action.type === "code";
  const fields = isCode ? [] : Array.isArray(action.fields) ? action.fields : [];
  if (isCode ? !action.code : !fields.length) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(isCode ? action.code : formText(fields));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to select */
    }
  };
  const download = () => {
    if (!isCode) return;
    const url = URL.createObjectURL(new Blob([action.code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = codeFileName(action.title, action.language);
    a.click();
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const CopyIcon = copied ? Check : Copy;
  const kind = !isCode ? t.form : action.language === "text" ? t.draft : `${t.code} / ${action.language}`;

  return (
    <section className="hud flex min-w-0 flex-col gap-3 p-3 text-ink" aria-label={`${kind}: ${action.title}`}>
      <header className="min-w-0">
        <p className="text-label uppercase tracking-[0.12em] text-ink-muted">{kind}</p>
        <p className="truncate text-body font-medium">{action.title}</p>
      </header>
      {isCode ? (
        <pre className={`max-h-96 overflow-auto rounded-md border border-line bg-black/50 p-3 font-mono text-small leading-relaxed ${action.language === "text" ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"}`} tabIndex={0}>
          <code>{action.code}</code>
        </pre>
      ) : (
        <dl className="flex flex-col divide-y divide-line rounded-md border border-line">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-4">
              <dt className="text-small text-ink-muted sm:w-2/5 sm:shrink-0">{f.label}</dt>
              <dd className={`min-w-0 text-body [overflow-wrap:anywhere] ${f.value ? "" : "text-ink-muted italic"}`}>{f.value || t.empty}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2" aria-live="polite">
        <button type="button" onClick={copy} className={BTN}>
          <CopyIcon aria-hidden className="size-5" />
          {copied ? t.copied : isCode ? t.copy : t.copyAll}
        </button>
        {isCode && (
          <button type="button" onClick={download} className={BTN}>
            <Download aria-hidden className="size-5" />
            {t.download}
          </button>
        )}
      </div>
    </section>
  );
}
