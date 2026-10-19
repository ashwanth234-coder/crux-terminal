export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
      splashBackgroundColor: "#050505",
    },
  },
} as const;

/**
 * Primary navigation: Discover | Launch | Terminal | Docs. Launch opens the
 * token launch modal; the rest are routes, absolute so they work on every page.
 */
export const NAV_LINKS = [
  { label: "Discover", href: "/launches" },
  { label: "Launch", href: null },
  { label: "Terminal", href: "/#protocol" },
  { label: "Docs", href: "/#docs" },
] as const;
