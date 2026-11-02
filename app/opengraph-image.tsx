import { ImageResponse } from "next/og";
import { CRUX_MARK_PATH } from "@/components/site/Logo";

export const alt = "Crux — One account. Every chain. Testnet on Base Sepolia.";
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
          background: "#000000",
          color: "#F5F3EE",
          fontFamily: "sans-serif",
        }}
      >
        {/* The wordmark: "CRU" with the mark as its X */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 30, letterSpacing: 14, fontWeight: 500 }}>CRU</div>
          <svg width="27" height="27" viewBox="0 0 24 24">
            <path d={CRUX_MARK_PATH} fill="#ff5500" fillRule="evenodd" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 116, fontWeight: 400, lineHeight: 0.95, letterSpacing: -2 }}>
          <div>ONE ACCOUNT.</div>
          <div style={{ color: "#ff5500" }}>EVERY CHAIN.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #292B2F", paddingTop: 28 }}>
          <div style={{ fontSize: 24, color: "#A7ADB5" }}>Deposit from any chain. Launch and trade from one account.</div>
          <div style={{ fontSize: 18, letterSpacing: 5, color: "#A7ADB5" }}>BASE SEPOLIA TESTNET</div>
        </div>
      </div>
    ),
    size,
  );
}
