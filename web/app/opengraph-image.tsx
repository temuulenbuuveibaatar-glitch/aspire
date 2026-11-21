import { ImageResponse } from "next/og";

// Share card for every page (Twitter inherits it from Open Graph). Static: built once and cached.
// Colours are the globals.css tokens (--color-bg, --color-accent, --color-ink); the default
// next/og font covers the Latin text, so no font file is bundled.
export const alt = "Aspire - voice city assistant for Erdenet and every city";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "linear-gradient(135deg, #050505 0%, #0d0d0d 55%, #1f1f1f 100%)",
          color: "#f2f6f4",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, color: "#fc4f00" }}>VOICE CITY ASSISTANT</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 168, fontWeight: 700, letterSpacing: -4 }}>Aspire</div>
        <div style={{ display: "flex", marginTop: 16, maxWidth: 900, fontSize: 44, lineHeight: 1.25, color: "#c9dcd3" }}>
          Live buses, weather and news for Erdenet and every city. Just ask out loud.
        </div>
        <div style={{ display: "flex", marginTop: 48, height: 6, width: 160, borderRadius: 0, background: "#fc4f00" }} />
      </div>
    ),
    size,
  );
}
