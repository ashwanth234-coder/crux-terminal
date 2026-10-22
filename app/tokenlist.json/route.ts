import { connection } from "next/server";
import { feedResponse, readLaunches, type FeedLaunch } from "@/lib/launchFeed";
import { SITE_URL } from "@/lib/site";

/**
 * GET /tokenlist.json: every graduated Crux token as a standard Uniswap token list (tokenlists.org), so wallets,
 * DEX front-ends and indexers can import Crux tokens with their logos and pools. Base Sepolia testnet.
 */

// tokenlists.org schema limits: names 1-40 chars of a restricted set, symbols 1-20 chars without spaces.
const NAME_OK = /^[ \w.'+\-%/À-ÖØ-öø-ÿ:&[\]()]+$/;
const SYMBOL_OK = /^[a-zA-Z0-9+\-%/$.]+$/;

function entry(l: FeedLaunch) {
  const name = l.name.trim().slice(0, 40);
  const symbol = l.symbol.trim();
  if (!name || !NAME_OK.test(name) || !symbol || symbol.length > 20 || !SYMBOL_OK.test(symbol)) return null;
  return {
    chainId: 84532,
    address: l.token,
    name,
    symbol,
    decimals: l.decimals,
    ...(l.metadata.image ? { logoURI: l.metadata.image } : {}),
    tags: l.creatorVestingDays > 0 ? ["crux", "lpburned", "vested"] : ["crux", "lpburned", "instant"],
    extensions: {
      cruxLaunch: l.key,
      pool: l.pool,
      creatorVestingDays: l.creatorVestingDays,
      terminal: l.urls.terminal,
    },
  };
}

export async function GET() {
  await connection();
  try {
    const tokens = (await readLaunches())
      .filter((l) => l.phase === "graduated")
      .map(entry)
      .filter((t): t is NonNullable<ReturnType<typeof entry>> => t !== null);
    return feedResponse({
      name: "Crux Graduated Tokens",
      timestamp: new Date().toISOString(),
      // Minor bumps with every newly graduated token (tokenlists.org versioning: additions are minor).
      version: { major: 1, minor: tokens.length, patch: 0 },
      logoURI: `${SITE_URL}/icon-1024.png`,
      keywords: ["crux", "launchpad", "base sepolia", "testnet"],
      tags: {
        // tokenlists.org allows only letters, digits, spaces and . , : in tag descriptions.
        crux: { name: "Crux graduated", description: "Sold in a uniform price batch auction on Crux, then seeded into a Uniswap V2 pool." },
        lpburned: { name: "LP burned", description: "The pool LP tokens were burned at graduation: its liquidity can never be pulled." },
        vested: { name: "Creator vested", description: "The creator share of tokens and of the raise vests linearly over 30 days." },
        instant: { name: "Instant unlock", description: "The creator chose an instant unlock: their share was released at graduation, with no vesting." },
      },
      tokens,
    });
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
