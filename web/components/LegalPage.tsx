import Link from "next/link";
import { SITE } from "@/lib/site";

export function Contact() {
  if (SITE.contactEmail) return <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>;
  if (SITE.repoUrl) return <a href={`${SITE.repoUrl}/issues`}>{SITE.repoUrl}/issues</a>;
  return <span>the project team at the {SITE.event}</span>;
}

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      <p>
        <Link href="/">← Aspire</Link>
      </p>
      <h1>{title}</h1>
      <p className="legal-updated">
        {SITE.name} · {SITE.updated}
      </p>
      {children}
    </main>
  );
}
