import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_SC, Tektur } from "next/font/google";
import { ServiceWorker } from "@/components/aspire/PushToggle";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// next/font emits an @font-face (with its unicode-range) for EVERY subset Google serves, so
// latin-ext (place names worldwide: Lodz, Istanbul, Plzen...), cyrillic-ext (Mongolian
// U+04E8/9 and U+04AE/F), greek and vietnamese all download on demand. `subsets` only picks
// which files get a <link rel="preload">, so it lists just what the first paint needs.

// Inter: all prose, replies, buttons and labels. Preload Latin plus the full Cyrillic set, so
// Mongolian (cyrillic-ext for its extra letters) and Russian paint without a font swap.
const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  axes: ["opsz"],
  display: "swap",
});

// JetBrains Mono: the small uppercase labels, telemetry lines and readouts (--font-mono in
// globals.css). It has the full Cyrillic set, so Mongolian and Russian labels stay in one face.
// Only the Latin file is preloaded; Cyrillic downloads when a Cyrillic label is on the page.
const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  display: "swap",
});

// Tektur: the wordmark only. Cyrillic loads on demand.
const brand = Tektur({
  variable: "--font-brand",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// Simplified Chinese. Not preloaded: the unicode-range slices download only when CJK text appears.
// System CJK fonts (PingFang SC, Microsoft YaHei, Noto Sans CJK SC) follow it in --font-sans.
const cjk = Noto_Sans_SC({
  variable: "--font-cjk",
  weight: ["400", "700"],
  preload: false,
  display: "swap",
  adjustFontFallback: false,
});

const TITLE = "Aspire - voice city assistant for Erdenet and every city";
const DESCRIPTION =
  "Aspire, a Jarvis-style voice assistant for Erdenet and every city: live buses, weather, traffic and news. Ask out loud in Mongolian, Chinese, English, Russian or German.";

// Site-wide defaults. The homepage (app/page.tsx) localises title, description and Open Graph per
// language via landingMetadata; the Open Graph image comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Aspire" },
  description: DESCRIPTION,
  applicationName: "Aspire",
  keywords: [
    "Aspire",
    "Aspire Erdenet",
    "Aspire Mongolia",
    "voice assistant",
    "Jarvis",
    "Erdenet bus",
    "Эрдэнэт автобус",
    "Aspire туслах",
    "Orkhon Hackathon",
  ],
  // No canonical, hreflang or og:url here: every route would inherit the homepage ones.
  // landingMetadata sets them for "/", and each public page sets its own canonical.
  openGraph: {
    type: "website",
    siteName: "Aspire",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  // app/favicon.ico is also picked up by the file convention as rel="icon".
  icons: { shortcut: "/favicon.ico" },
  category: "lifestyle",
};

export const viewport: Viewport = {
  themeColor: "#050505", // = --color-bg (globals.css): the status bar blends into the page
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Lets env(safe-area-inset-*) report real values so the composer clears the home indicator.
  viewportFit: "cover",
  // Android Chrome shrinks the layout viewport for the keyboard, so the fixed composer stays above it
  // (iOS ignores this; Assistant lifts the composer by --kb from visualViewport there).
  interactiveWidget: "resizes-content",
};

// Mirrors lib/display-prefs.ts (key "aspire-display-v1"). Inline and blocking by design: tiny,
// no network, wrapped in try/catch so blocked storage never breaks the page. It also preloads the cached
// city photo (lib/use-ambient.ts, "aspire-photo-v1"), so it downloads before the JS bundle is parsed.
const PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("aspire-display-v1")||"null");if(p&&typeof p==="object"){var h=document.documentElement;if(p.calm===true)h.setAttribute("data-calm","true");if(p.textSize==="lg"||p.textSize==="xl")h.setAttribute("data-text-size",p.textSize);if(p.units==="metric"||p.units==="imperial")h.setAttribute("data-units",p.units);}}catch(e){}try{var c=JSON.parse(localStorage.getItem("aspire-photo-v1")||"null");if(c&&typeof c.url==="string"&&c.url.indexOf("https://")===0&&(!/google/.test(c.url)||Date.now()-c.savedAt<864e5)){var l=document.createElement("link");l.rel="preload";l.as="image";l.href=c.url;l.setAttribute("referrerpolicy","no-referrer");document.head.appendChild(l);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: prefs (text size, Calm mode) and the sky write attributes and
    // CSS variables on <html> on the client.
    // lang="en": English is the app's own fallback. Assistant and LoginForm set the real
    // language on <html> after mount, Landing sets it with an inline script, and the legal
    // sections carry their own lang attributes.
    <html lang="en" className={`${body.variable} ${code.variable} ${brand.variable} ${cjk.variable}`} suppressHydrationWarning>
      <head>
        {/* Display prefs before first paint: Calm mode, text size and units apply on every page
            (including /login) and from the very first frame, not only after hydration. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        {/* Clerk components use the app tokens; with no fontFamily set they inherit the page font. */}
        <ClerkProvider
          appearance={{
            theme: dark,
            variables: {
              // The app's own tokens (globals.css): the sign-in screen is the same product.
              colorBackground: "#0d0d0d",
              colorPrimary: "#fc4f00",
              colorPrimaryForeground: "#050505",
              colorForeground: "#dddddd",
              colorMutedForeground: "#a8a8a8",
              colorNeutral: "#dddddd",
              colorInput: "#151515",
              colorInputForeground: "#dddddd",
              colorDanger: "#ff6b6b",
              colorSuccess: "#5be3a4",
              borderRadius: "3px",
              fontSize: "1.125rem",
            },
          }}
        >
          {children}
        </ClerkProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
