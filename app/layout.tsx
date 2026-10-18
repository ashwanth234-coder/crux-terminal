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
THESIS: The page runs on Crux's own 60-second batch clock: a heartbeat line, a live batch status and a simulated intent tape replace the static DeFi grid of equal cards and stat tiles.
OWN-WORLD: Void #050505, hairlines #1E2024, titanium chrome #E0E2EC lettering in solid values (no gradient text), acid #D4F933 only for actions and the clearing pulse; Archivo extended display, JetBrains Mono only for numbers; chrome WebGL objects lit by procedural softboxes.
STORY: See one market across four chains, watch intents clear in a batch, walk the four mechanics in a pinned horizontal run, follow value into $CRUX, launch.
FIRST VIEWPORT: Heartbeat line under the nav; left, batch status then a 6rem three-line headline, subcopy, lime Explore and outline Watch; right, the chrome link bleeding off-canvas; bottom, full-width intent tape.
FORM: brief-pinned elevation of the founder's reference world; no seed roll (seed key: pinned).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Crux — Every chain. One market. Zero friction.",
  description:
    "Crux is an omnichain execution protocol: social discovery, intent-based cross-chain execution, canonical liquidity and perpetual markets in one unified trading experience.",
  openGraph: {
    title: "Crux — Omnichain markets for a borderless future",
    description: "One balance. Every chain. Intent in, execution out.",
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
  themeColor: "#050505",
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
