import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { SITE_URL, miniAppEmbed } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const DIRECTION_CONTRACT = `<!--
THESIS: Quiet Power. The page proves the mechanism with real Base Sepolia data and static diagrams instead of WebGL, loops and simulated feeds.
OWN-WORLD: Obsidian #08090B, graphite #111215 surfaces, soft white #F3F3F0 type, acid lime #D0F77A only for actions and outcomes; Archivo for words, JetBrains Mono for numbers; hairlines, no glows.
STORY: One market across four chains, real testnet activity, the four mechanics with honest status, the planned token, launch.
FIRST VIEWPORT: Headline painted with the first frame, subcopy, two actions, chains; right, live Base Sepolia activity from the Crux contracts.
-->`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Crux — Launch on your home chain. Trade from anywhere.",
  description:
    "Crux is a home-chain-first launch protocol with an omnichain execution layer: fair uniform-price batch launches, liquidity locked forever on graduation, and solver-based access from other networks. Testnet on Base Sepolia.",
  openGraph: {
    title: "Crux — Launch on your home chain. Trade from anywhere.",
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
  themeColor: "#08090b",
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
