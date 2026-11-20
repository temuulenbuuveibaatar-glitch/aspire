import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { requireUser, safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in · Aspire" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Cache Components: request data (searchParams, cookies) is read inside a Suspense boundary.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  // Already signed in (e.g. back button after login): go straight on.
  if (await requireUser()) redirect(next);
  return <LoginForm next={next} expired={first(params.expired) === "1"} failed={first(params.error) === "1"} />;
}
