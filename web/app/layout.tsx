import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_SC, Tektur } from "next/font/google";
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

// Tektur: wordmark and the HUD clock only. The wdth axis gives condensed numerals. Other values
// use --font-mono (system monospace, globals.css), so no third font downloads.
// Digits, the degree sign and U+2212 minus are all in its latin file; Cyrillic loads on demand.
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

export const metadata: Metadata = {
  title: "Aspire",
  description:
    "Aspire, a Jarvis-style voice assistant for any city. Ask out loud in Mongolian, Chinese, English, Russian or German.",
  applicationName: "Aspire",
};

export const viewport: Viewport = {
  themeColor: "#040810", // = --color-hud-glass without alpha: the status bar blends into the HUD
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
    // language on <html> after mount, and the legal sections carry their own lang attributes.
    <html lang="en" className={`${body.variable} ${brand.variable} ${cjk.variable}`} suppressHydrationWarning>
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
              colorBackground: "#0B1220",
              colorPrimary: "#5EE7FF",
              colorPrimaryForeground: "#0B1220",
              colorForeground: "#F2F6FC",
              colorMutedForeground: "#B6C2D6",
              colorNeutral: "#F2F6FC",
              colorInput: "#121C2E",
              colorInputForeground: "#F2F6FC",
              colorDanger: "#FF8A8A",
              colorSuccess: "#5BE3A4",
              borderRadius: "16px",
              fontSize: "1.125rem",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
