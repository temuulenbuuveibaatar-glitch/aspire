import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SITE } from "@/lib/site";

type LegalLang = "mn" | "zh" | "en" | "ru" | "de";

/** "The team" in each section's own language (the event name stays as written). */
const TEAM: Record<LegalLang, (event: string) => string> = {
  mn: (e) => `${e}-ийн баг`,
  zh: (e) => `${e} 项目团队`,
  en: (e) => `the project team at the ${e}`,
  ru: (e) => `команда проекта на ${e}`,
  de: (e) => `das Projektteam beim ${e}`,
};

export function Contact({ lang = "en" }: { lang?: LegalLang }) {
  if (SITE.contactEmail) return <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>;
  if (SITE.repoUrl) return <a href={`${SITE.repoUrl}/issues`}>{SITE.repoUrl}/issues</a>;
  return <span>{(TEAM[lang] ?? TEAM.en)(SITE.event)}</span>;
}

/** Jump links to the other language sections of a legal page. */
export function LangJump() {
  const links: [string, string, string][] = [
    ["#mn", "mn", "Монгол"],
    ["#en", "en", "English"],
    ["#zh", "zh-Hans", "中文"],
    ["#ru", "ru", "Русский"],
    ["#de", "de", "Deutsch"],
  ];
  return (
    <nav aria-label="Language / Хэл" className="mb-4 flex flex-wrap gap-2">
      {links.map(([href, lang, name]) => (
        <a key={href} href={href} lang={lang} className="inline-flex min-h-12 items-center rounded-full border border-line px-4 text-body">
          {name}
        </a>
      ))}
    </nav>
  );
}

export default function LegalPage({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="legal">
      <nav>
        <Link
          href="/"
          style={{ color: "var(--color-ink)", textDecoration: "none" }}
          className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong bg-panel-2 px-5 text-body font-medium hover:bg-panel-3"
        >
          <ArrowLeft className="size-5" aria-hidden />
          <span className="font-display tracking-[0.18em] uppercase">Aspire</span>
        </Link>
      </nav>
      <article className="panel mt-6 px-5 py-6 sm:px-8 sm:py-8">
        <h1 className="text-ink">{title}</h1>
        <p className="legal-updated num">
          {SITE.name} · {SITE.updated}
        </p>
        <hr className="my-6!" />
        {children}
      </article>
    </main>
  );
}
