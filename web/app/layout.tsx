import type { Metadata, Viewport } from "next";
import { Nunito, Orbitron } from "next/font/google";
import "./globals.css";

const body = Nunito({ variable: "--font-body", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const display = Orbitron({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Эмээ товч",
  description: "One big button: ask out loud in Mongolian, Chinese, English, Russian or German. Bus times for Erdenet and answers to anything.",
  applicationName: "Эмээ товч",
};

export const viewport: Viewport = {
  themeColor: "#050b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
