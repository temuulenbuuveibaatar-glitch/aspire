import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import Assistant from "@/components/Assistant";
import { Landing, landingLang, landingMetadata } from "@/components/landing/Landing";
import { requireUser } from "@/lib/auth";
import { landingWeather } from "@/lib/landing-weather";
import { langFrom, type Lang } from "@/lib/lang";

// "/" is public (lib/auth.ts isPublicPath): signed-out visitors and search engines get the landing
// page, signed-in people get the app. Language: ?lang= when present, else Accept-Language.
async function pageLang(searchParams: PageProps<"/">["searchParams"]): Promise<{ lang: Lang; bare: boolean }> {
  const raw = (await searchParams).lang;
  if (raw !== undefined) return { lang: landingLang(raw), bare: false };
  return { lang: langFrom((await headers()).get("accept-language")), bare: true };
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { lang, bare } = await pageLang(searchParams);
  return landingMetadata(lang, bare);
}

// Cache Components: request data (searchParams, headers, the Clerk session) is read inside a Suspense boundary.
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-bg" />}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

async function Gate({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  if (await requireUser()) return <Assistant />;
  const [{ lang }, { sky, hour }, head] = await Promise.all([pageLang(searchParams), searchParams, headers()]);
  // The weather where the visitor roughly is (lib/landing-weather.ts; ?sky= and ?hour= preview a look).
  // Started here and passed on WITHOUT awaiting it: the headline never waits for it, Landing reads
  // the promise inside its own Suspense boundary.
  return <Landing lang={lang} weather={landingWeather(head, { sky, hour })} />;
}
