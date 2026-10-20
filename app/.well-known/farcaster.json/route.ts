import { SITE_URL } from "@/lib/site";

/**
 * Farcaster Mini App manifest. The account association must be signed for the
 * production domain (Warpcast → Developers → Domains) and supplied via env.
 */
export function GET() {
  return Response.json({
    accountAssociation: {
      header: process.env.FARCASTER_ASSOCIATION_HEADER ?? "",
      payload: process.env.FARCASTER_ASSOCIATION_PAYLOAD ?? "",
      signature: process.env.FARCASTER_ASSOCIATION_SIGNATURE ?? "",
    },
    miniapp: {
      version: "1",
      name: "Crux",
      subtitle: "Every chain. One market.",
      description:
        "Trade any asset on any chain with one unified balance. Intent-based execution, fair launches, canonical liquidity and perpetual markets.",
      iconUrl: `${SITE_URL}/icon-1024.png`,
      homeUrl: SITE_URL,
      imageUrl: `${SITE_URL}/opengraph-image`,
      buttonTitle: "Launch Crux",
      splashImageUrl: `${SITE_URL}/splash.png`,
      splashBackgroundColor: "#0a0b0d",
      primaryCategory: "finance",
      tags: ["trading", "omnichain", "defi", "intents"],
      requiredChains: ["eip155:8453"],
      requiredCapabilities: ["actions.swapToken"],
    },
  });
}
