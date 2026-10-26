import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { SITE_URL, miniAppEmbed } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const DIRECTION_CONTRACT = `<!--
THESIS: Markets without borders. Minimal, institutional fintech: calm through composition, type and restraint, proven with real Base Sepolia data.
OWN-WORLD: Coal #0A0B0D, graphite #141518 layers, warm white #F5F3EE type, titanium #A7ADB5 detail, Signal Orange #e35d2b for the mark, selection and live state only; warm-white primary buttons, green buy, red sell; Archivo for display and UI, JetBrains Mono for numbers; hairlines, no glows.
STORY: Discover real launches, how it works (fair launch, intent execution, locked liquidity), enter.
FIRST VIEWPORT: Markets / without / borders. painted with the first frame, one supporting line, one ENTER CRUX link; right, the static chrome CRUX emblem on one circle and one axis.
-->`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Crux — Markets without borders.",
  description:
    "Crux is a home-chain-first launch protocol with an omnichain execution layer: fair uniform-price batch launches, liquidity locked forever on graduation, and solver-based access from other networks. Testnet on Base Sepolia.",
  openGraph: {
    title: "Crux — Markets without borders.",
    description: "Fair batch launches on the home chain. Liquidity locked forever. Solver-based access from anywhere.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  other: {
    // Farcaster Mini App embed: renders a launch card when the URL is shared in a cast.
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify({
      ...miniAppEmbed,
      button: { ...miniAppEmbed.button, action: { ...miniAppEmbed.button.action, type: "launch_frame" } },
    }),
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-svh">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
