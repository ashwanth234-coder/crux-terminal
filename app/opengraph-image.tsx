import { ImageResponse } from "next/og";

export const alt = "Crux — Every chain. One market. Zero friction.";
export const size = { width: 1200, height: 800 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(circle at 78% 40%, #23262c 0%, #0a0a0a 45%, #050505 100%)",
          color: "#E0E2EC",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              border: "3px solid #D4F933",
              borderRadius: 10,
              transform: "rotate(45deg)",
            }}
          />
          <div style={{ fontSize: 34, letterSpacing: 12, fontWeight: 700 }}>CRUX</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 800, lineHeight: 0.95, letterSpacing: -4 }}>
          <div>Every chain.</div>
          <div>One market.</div>
          <div style={{ color: "#8f949e" }}>Zero friction.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ background: "#D4F933", color: "#050505", padding: "14px 30px", borderRadius: 999, fontSize: 28, fontWeight: 700 }}>
            Launch Crux ↗
          </div>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#8A8F98" }}>OMNICHAIN EXECUTION PROTOCOL</div>
        </div>
      </div>
    ),
    size,
  );
}
