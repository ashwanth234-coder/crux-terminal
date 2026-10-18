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
      splashImageUrl: `${SITE_URL}/icon.svg`,
      splashBackgroundColor: "#050505",
    },
  },
} as const;

export const NAV_LINKS = [
  { label: "Protocol", href: "#protocol" },
  { label: "Ecosystem", href: "#ecosystem" },
  { label: "Technology", href: "#technology" },
  { label: "Token", href: "#token" },
  { label: "Developers", href: "#developers" },
  { label: "Docs", href: "#docs" },
] as const;
