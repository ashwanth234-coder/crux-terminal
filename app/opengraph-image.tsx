import { ImageResponse } from "next/og";
import { CRUX_MARK_PATH } from "@/components/site/Logo";

export const alt = "Crux — Markets without borders. Testnet on Base Sepolia.";
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
          background: "#0A0B0D",
          color: "#F5F3EE",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <path d={CRUX_MARK_PATH} fill="#FF642D" />
          </svg>
          <div style={{ fontSize: 30, letterSpacing: 14, fontWeight: 500 }}>CRUX</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 116, fontWeight: 400, lineHeight: 0.95, letterSpacing: -2 }}>
          <div>MARKETS</div>
          <div style={{ color: "#FF642D" }}>WITHOUT</div>
          <div>BORDERS.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #292B2F", paddingTop: 28 }}>
          <div style={{ fontSize: 24, color: "#A7ADB5" }}>Global markets. One execution layer.</div>
          <div style={{ fontSize: 18, letterSpacing: 5, color: "#A7ADB5" }}>BASE SEPOLIA TESTNET</div>
        </div>
      </div>
    ),
    size,
  );
}
