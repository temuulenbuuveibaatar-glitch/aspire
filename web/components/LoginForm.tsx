"use client";

import { SignIn, useClerk } from "@clerk/nextjs";
import { Clock } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useCalm } from "@/lib/display-prefs";
import { Sky } from "@/components/aspire/Sky";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { UI } from "@/lib/ui-text";

// Sign-in (spec section 16). A calm, location-free sky behind everything (clear, no particles,
// day or night from the device clock), the orb in its 24h clock ring, the wordmark, then
// Clerk's <SignIn> themed to the v3 tokens. Hash routing keeps every step on /login?next=...,
// so `next` and the `expired` notice survive the email-code step and the return from Google/Apple.
//
// Every piece of text sits on a `.panel` (spec 2.2: "Gradients never sit directly under text"),
// because a clear day or golden-hour sky is far too light for ink text on its own.

type LoginText = { tagline: string; title: string; notice: string; privacy: string; terms: string; legal: string };

const TEXT: Record<Lang, LoginText> = {
  mn: {
    tagline: "Таны дуут туслах, аль ч хотод.",
    title: "Нэвтрэх",
    notice: "Нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.",
    privacy: "Нууцлал",
    terms: "Нөхцөл",
    legal: "Эрх зүйн мэдээлэл",
  },
  zh: {
    tagline: "您的语音助手，无论身在哪座城市。",
    title: "登录",
    notice: "登录已过期，请重新登录。",
    privacy: "隐私",
    terms: "条款",
    legal: "法律信息",
  },
  en: {
    tagline: "Your voice assistant, in any city.",
    title: "Sign in",
    notice: "Your session ended. Please sign in again.",
    privacy: "Privacy",
    terms: "Terms",
    legal: "Legal",
  },
  ru: {
    tagline: "Ваш голосовой помощник в любом городе.",
    title: "Вход",
    notice: "Сеанс завершён. Пожалуйста, войдите снова.",
    privacy: "Конфиденциальность",
    terms: "Условия",
    legal: "Правовая информация",
  },
  de: {
    tagline: "Ihr Sprachassistent, in jeder Stadt.",
    title: "Anmelden",
    notice: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    privacy: "Datenschutz",
    terms: "Bedingungen",
    legal: "Rechtliches",
  },
};


// Clerk's <SignIn> card in the visitor's language, built from the UI strings we already ship
// (no @clerk/localizations dependency). Only the visible keys of the email-code and Google flow.
const CONTINUE: Record<Lang, string> = { mn: "Үргэлжлүүлэх", zh: "继续", en: "Continue", ru: "Продолжить", de: "Weiter" };

function clerkLocalization(l: Lang) {
  const u = UI[l] ?? UI.en;
  return {
    signIn: {
      start: { title: u.signInTitle, titleCombined: u.signInTitle },
      emailCode: { formTitle: u.codeLabel, subtitle: u.codeSent },
    },
    socialButtonsBlockButton: u.continueGoogle.replace("Google", "{{provider|titleize}}"),
    formFieldLabel__emailAddress: u.emailLabel,
    formButtonPrimary: CONTINUE[l] ?? CONTINUE.en,
  };
}

type UpdatableClerk = { __internal_updateProps?: (props: { options: { localization: unknown } }) => unknown };

// ---- Clerk theme (spec 16) ----
// Colours are literal v3 tokens: Clerk needs real colours, not CSS variables.
// Sizes are style objects, not utility classes: Clerk's own styles are unlayered and would beat
// Tailwind utilities (no cssLayerName is configured), but element style objects always win.

const TAP = { minHeight: "3rem" } as const; // 48px floor (spec 13.1)
const SMALL_TEXT = { fontSize: "1rem" } as const; // 16px floor: Clerk derives its caption size as 0.8 x fontSize

const CLERK_APPEARANCE = {
  variables: {
    colorBackground: "#0B1220",
    colorPrimary: "#5EE7FF",
    colorPrimaryForeground: "#0B1220",
    colorForeground: "#F2F6FC",
    colorMutedForeground: "#B6C2D6",
    colorMuted: "#121C2E",
    colorNeutral: "#F2F6FC",
    colorInput: "#121C2E",
    colorInputForeground: "#F2F6FC",
    colorBorder: "rgb(242 246 252 / 0.28)",
    colorRing: "#5EE7FF",
    colorShadow: "rgb(2 6 16 / 0.65)",
    colorModalBackdrop: "rgb(6 11 22 / 0.7)",
    colorDanger: "#FF8A8A",
    colorSuccess: "#5BE3A4",
    colorWarning: "#F5C26B",
    borderRadius: "16px",
    fontSize: "1.125rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      borderRadius: "22px",
      borderColor: "rgb(242 246 252 / 0.14)",
      boxShadow: "inset 0 1px 0 rgb(242 246 252 / 0.08), 0 16px 40px -16px rgb(2 6 16 / 0.65)",
    },
    card: "panel",
    socialButtonsBlockButton: TAP,
    socialButtonsIconButton: { ...TAP, minWidth: "3rem" },
    formButtonPrimary: TAP,
    formButtonReset: TAP,
    formFieldInput: TAP,
    formFieldInputShowPasswordButton: { ...TAP, minWidth: "3rem" },
    otpCodeFieldInput: TAP,
    alternativeMethodsBlockButton: TAP,
    identityPreviewEditButton: { ...TAP, minWidth: "3rem" },
    footerActionLink: { ...TAP, display: "inline-flex", alignItems: "center" },
    footerPagesLink: { ...TAP, display: "inline-flex", alignItems: "center", ...SMALL_TEXT },
    formResendCodeLink: TAP,
    formFieldAction: { ...TAP, display: "inline-flex", alignItems: "center", ...SMALL_TEXT },
    headerBackLink: TAP,
    backLink: TAP,
    formFieldLabel: SMALL_TEXT,
    formFieldHintText: SMALL_TEXT,
    formFieldInfoText: SMALL_TEXT,
    formFieldErrorText: SMALL_TEXT,
    formFieldWarningText: SMALL_TEXT,
    formFieldSuccessText: SMALL_TEXT,
    otpCodeFieldErrorText: SMALL_TEXT,
    otpCodeFieldSuccessText: SMALL_TEXT,
    dividerText: SMALL_TEXT,
    footerActionText: SMALL_TEXT,
    identityPreviewText: SMALL_TEXT,
    alertText: SMALL_TEXT,
    badge: SMALL_TEXT,
    lastAuthenticationStrategyBadge: SMALL_TEXT,
  },
} as const;

// ---- device clock, in minutes after local midnight (null on the server) ----

function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
}
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const serverMinutes = () => null;

function useDeviceMinutes(): number | null {
  return useSyncExternalStore(subscribeMinute, nowMinutes, serverMinutes);
}

// ---- halo clock ring (spec 6.3, login variant: no sunrise/sunset, so ticks and the now marker only) ----

const ORB = 160;
const HALO = Math.round(ORB * 1.42); // the orb canvas grows to this box when `halo` is set (spec 6.1)

function HaloClock({ minutes }: { minutes: number | null }) {
  const c = HALO / 2;
  const r = HALO * 0.47;
  const step = (2 * Math.PI * r) / 96; // one tick every 15 minutes
  // Midnight at the bottom, noon at the top, so daylight sits up. The marker never spins.
  const angle = minutes == null ? 0 : (minutes / 1440) * 360;

  return (
    <svg
      aria-hidden
      focusable="false"
      width={HALO}
      height={HALO}
      viewBox={`0 0 ${HALO} ${HALO}`}
      className="pointer-events-none absolute inset-0"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--color-ink, #F2F6FC)"
        strokeOpacity={0.45}
        strokeWidth={4}
        strokeDasharray={`1 ${step - 1}`}
      />
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1={c}
          y1={c + r - 3}
          x2={c}
          y2={c + r + 3}
          stroke="var(--color-ink, #F2F6FC)"
          strokeOpacity={0.8}
          strokeWidth={1.5}
          strokeLinecap="round"
          transform={`rotate(${deg} ${c} ${c})`}
        />
      ))}
      {minutes != null && (
        <g transform={`rotate(${angle} ${c} ${c})`}>
          <circle cx={c} cy={c + r} r={3} fill="var(--color-accent, #5EE7FF)" />
        </g>
      )}
    </svg>
  );
}

const SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { ...SPRING, delay },
});

export default function LoginForm({
  next,
  expired,
  lang = "en",
}: {
  next: string;
  expired: boolean;
  /** Picked on the server from Accept-Language, so the first paint is already in the right language. */
  lang?: Lang;
}) {
  const t = TEXT[lang] ?? TEXT.en;
  const minutes = useDeviceMinutes();
  const calm = useCalm();
  const hour = minutes == null ? null : Math.floor(minutes / 60);
  const clerk = useClerk();

  // The root layout renders <html lang="en">; announce the title and any Clerk portal content
  // (outside <main lang>) in the visitor's language.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang] ?? "en";
  }, [lang]);

  // Only one ClerkProvider may exist (in the root layout, which cannot read the request language
  // under Cache Components), so the localization is merged into the loaded Clerk instance here.
  useEffect(() => {
    if (lang === "en" || !clerk.loaded) return;
    try {
      void (clerk as unknown as UpdatableClerk).__internal_updateProps?.({ options: { localization: clerkLocalization(lang) } });
    } catch {
      // Clerk keeps its English defaults.
    }
  }, [clerk, clerk.loaded, lang]);

  return (
    // "user": transforms are dropped under prefers-reduced-motion and only the fade stays.
    // Calm mode drops them as well.
    <MotionConfig reducedMotion={calm ? "always" : "user"}>
      {/* Rendered after hydration only, so a day sky never flashes at night. isDay spans 05-20 so the
          spec 5.1 fallback phases (dawn 5-6, golden 7 and 17-18, dusk 19-20) are all reachable. */}
      {hour != null && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <Sky kind="clear" intensity={0} isDay={hour >= 5 && hour < 21} windKph={0} localHour={hour} />
        </div>
      )}

      <main
        lang={HTML_LANG[lang]}
        className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10"
      >
        {/* Decorative: the wordmark below names the app. The dark lens keeps the ring and the
            accent marker at 3:1 or better on a bright day sky. */}
        <motion.div {...rise(0)} aria-hidden className="relative shrink-0" style={{ width: HALO, height: HALO }}>
          <div className="panel absolute inset-0 rounded-full" />
          <VoiceOrb size={ORB} state="idle" halo className="absolute inset-0 text-accent" />
          <HaloClock minutes={minutes} />
        </motion.div>

        <motion.div {...rise(0.05)} className="panel mt-4 flex w-full flex-col items-center px-6 py-5 text-center">
          <h1 lang="en" className="font-display pl-[0.28em] text-[1.75rem] leading-none font-bold tracking-[0.28em] text-ink uppercase">
            Aspire
          </h1>
          <p className="mt-3 text-lead text-balance text-ink-muted">{t.tagline}</p>
        </motion.div>

        {expired && (
          <motion.p
            {...rise(0.1)}
            role="status"
            className="panel mt-4 flex w-full items-start gap-3 px-4 py-3 text-body text-ink"
          >
            <Clock className="mt-1 size-5 shrink-0 text-signal" aria-hidden />
            <span>{t.notice}</span>
          </motion.p>
        )}

        <motion.section {...rise(0.15)} aria-label={t.title} className="mt-4 flex w-full justify-center">
          <SignIn
            routing="hash"
            withSignUp
            forceRedirectUrl={next}
            fallbackRedirectUrl={next}
            signUpForceRedirectUrl={next}
            signUpFallbackRedirectUrl={next}
            appearance={CLERK_APPEARANCE}
          />
        </motion.section>

        <nav aria-label={t.legal} className="panel mt-4 flex items-center gap-2 rounded-full px-2 text-small text-ink-muted">
          <Link
            href="/privacy"
            className="inline-flex min-h-12 items-center rounded-full px-4 underline underline-offset-4 hover:text-ink"
          >
            {t.privacy}
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/terms"
            className="inline-flex min-h-12 items-center rounded-full px-4 underline underline-offset-4 hover:text-ink"
          >
            {t.terms}
          </Link>
        </nav>
      </main>
    </MotionConfig>
  );
}
