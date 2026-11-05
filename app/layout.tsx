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
THESIS: One account. Every chain. A stark, high-contrast execution terminal, proven with real testnet data.
OWN-WORLD: Dark: pure black #000000 ground, #0A0A0A / #111111 elevated panels, pure white type. Light: pure white ground, black type. Electric Orange #FF5500 for primary actions (black text on orange, both themes), active states and critical figures, with a soft orange glow (0 0 15px rgba(255,85,0,0.4)) on primary buttons and focused inputs; green buy, red sell for direction only; Archivo for display and UI, JetBrains Mono for numbers; hairlines.
STORY: One CRUX Account (fund from anywhere, trade and launch in one place, every chain), real launches, how a launch works (launch, one-minute fair opening, trades everywhere) with its guarantees, create your account.
FIRST VIEWPORT: One account. / Every chain. painted with the first frame, one supporting line, CREATE YOUR ACCOUNT and Browse launches; right, the CRUX mark (the X with a diamond core) lit orange inside a glass lens.
-->`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Crux — One account. Every chain.",
  description:
    "One CRUX Account, funded from Base, Ethereum, Solana, BNB Chain or Arbitrum, to launch and trade with no gas and no bridges. Every trade settles in one pool on Base. Fair one-price launch openings, liquidity locked forever. Testnet on Base Sepolia.",
  openGraph: {
    title: "Crux — One account. Every chain.",
    description: "Deposit from any chain. Launch and trade from one account. Fair from the first second.",
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
