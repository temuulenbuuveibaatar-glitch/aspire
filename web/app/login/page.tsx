import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { requireUser, safeNext } from "@/lib/auth";
import { isLang, type Lang } from "@/lib/lang";

export const metadata: Metadata = {
  title: "Sign in · Aspire",
  description:
    "Aspire, a Jarvis-style voice assistant for any city. Ask out loud in Mongolian, Chinese, English, Russian or German.",
};

export const viewport: Viewport = { themeColor: "#060B16" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * `safeNext` keeps `next` same-origin. On top of that, never send people back to /login (a signed-in
 * visitor would bounce between the redirect below and this page forever) or to a JSON API route.
 */
function destination(raw: string | undefined): string {
  const next = safeNext(raw);
  const path = next.split(/[?#]/, 1)[0];
  const blocked = ["/login", "/api"].some((p) => path === p || path.startsWith(`${p}/`));
  return blocked ? "/" : next;
}

/**
 * The best supported language from an Accept-Language header (untrusted input: capped, parsed
 * defensively, q-values honoured). English when nothing matches, so the page suits any country.
 */
function langFrom(header: string | null): Lang {
  if (!header) return "en";
  const ranked = header
    .slice(0, 512)
    .split(",", 24)
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { base } of ranked) if (isLang(base)) return base;
  return "en";
}

// Cache Components: request data (searchParams, headers, the Clerk session) is read inside a Suspense boundary.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-bg" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = destination(first(params.next));
  // Already signed in (e.g. back button after login): go straight on.
  if (await requireUser()) redirect(next);
  const lang = langFrom((await headers()).get("accept-language"));
  return <LoginForm next={next} expired={first(params.expired) === "1"} lang={lang} />;
}
