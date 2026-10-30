export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Where people reach the team. */
export const CONTACT_EMAIL = "info@cruxprotocol.xyz";

/** Payload for the `fc:miniapp` meta tag (Mini App embed spec, version 1). */
export const miniAppEmbed = {
  version: "1",
  imageUrl: `${SITE_URL}/opengraph-image`,
  button: {
    title: "Launch Crux",
    action: {
      type: "launch_miniapp",
      name: "Crux",
      url: SITE_URL,
      splashImageUrl: `${SITE_URL}/splash.png`,
      splashBackgroundColor: "#000000",
    },
  },
} as const;

/**
 * Opens the pro terminal on the newest live V3 launch (resolved on-chain by app/terminal/route.ts).
 * Link to it with a plain <a>: it is a redirect, so it must not be prefetched or routed client-side.
 */
export const TERMINAL_HREF = "/terminal";

/**
 * Primary navigation: Discover | Launch | Terminal | Portfolio | Protocol | Docs. Launch opens the
 * token launch modal; the rest are routes, absolute so they work on every page.
 */
export const NAV_LINKS = [
  { label: "Discover", href: "/discover" },
  { label: "Launch", href: null },
  { label: "Terminal", href: TERMINAL_HREF },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Protocol", href: "/#protocol" },
  { label: "Docs", href: "/alpha-guide" },
] as const;
