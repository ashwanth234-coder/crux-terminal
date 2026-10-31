import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { SITE_URL, miniAppEmbed } from "@/lib/site";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

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
THESIS: Markets without borders. A stark, high-contrast execution terminal, proven with real testnet data.
OWN-WORLD: Dark: pure black #000000 ground, #0A0A0A / #111111 elevated panels, pure white type. Light: pure white ground, black type. Electric Orange #FF5500 for primary actions (black text on orange, both themes), active states and critical figures, with a soft orange glow (0 0 15px rgba(255,85,0,0.4)) on primary buttons and focused inputs; green buy, red sell for direction only; Archivo for display and UI, JetBrains Mono for numbers; hairlines.
STORY: Discover real launches, how it works (fair launch, one-signature orders, locked liquidity), enter.
FIRST VIEWPORT: Markets / without / borders. painted with the first frame, one supporting line, one ENTER CRUX link; right, the static CRUX emblem in liquid chrome inside a glass disc, with an orange core.
-->`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Crux — Markets without borders.",
  description:
    "Crux is a home-chain-first launch protocol with an omnichain execution layer: fair uniform-price batch launches, liquidity locked forever on graduation, and one-signature access from other networks. Testnet on Base Sepolia.",
  openGraph: {
    title: "Crux — Markets without borders.",
    description: "Fair batch launches on the home chain. Liquidity locked forever. Trade from the chain you're on.",
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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* The saved light / dark theme, applied before first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-svh">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
