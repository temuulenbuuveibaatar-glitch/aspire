import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { requireUser, safeNext } from "@/lib/auth";
import { langFrom } from "@/lib/lang";

export const metadata: Metadata = {
  title: "Sign in", // + the root template: "Sign in | Aspire"
  description:
    "Aspire, a Jarvis-style voice assistant for any city. Ask out loud in Mongolian, Chinese, English, Russian or German.",
  // Self-canonical: /login?next=... (where the proxy sends app paths) is not a separate page.
  alternates: { canonical: "/login" },
  openGraph: { type: "website", siteName: "Aspire", title: "Sign in | Aspire", url: "/login" },
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
