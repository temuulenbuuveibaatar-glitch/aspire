import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const display = Orbitron({ variable: "--font-brand", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aspire",
  description: "Aspire, a Jarvis-style voice assistant. Ask out loud in Mongolian, Chinese, English, Russian or German. Bus times for Erdenet and answers to anything.",
  applicationName: "Aspire",
};

export const viewport: Viewport = {
  themeColor: "#060b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn" className={`${body.variable} ${display.variable}`}>
      <body>
        {/* Clerk components use the app tokens; with no fontFamily set they inherit the page font. */}
        <ClerkProvider
          appearance={{
            theme: dark,
            variables: {
              colorBackground: "#060B16",
              colorPrimary: "#38DCFF",
              colorPrimaryForeground: "#03202A",
              colorForeground: "#EEF4FF",
              colorMutedForeground: "#A7B6CC",
              colorNeutral: "#EEF4FF",
              colorInput: "#0E1626",
              colorInputForeground: "#EEF4FF",
              colorDanger: "#FF7A7A",
              colorSuccess: "#34D399",
              borderRadius: "16px",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
