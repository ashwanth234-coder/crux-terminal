import { getAddress, parseAbi, type Address, type Hex } from "viem";
import { TESTNET } from "@/lib/chains";
import { postRelay } from "@/lib/session";
import { accountFields, type AccountSigner } from "@/lib/account";

/**
 * Crux V9 launches (crux-contracts src/v9): each token trades on its own CruxCurveV9 from launch (after an optional fair
 * opening) and graduates into a Uniswap V2 pool at a threshold; CruxRouterV9 buys and sells it in either phase, a buy
 * crossing graduation included, in one transaction.
 *
 * Off unless NEXT_PUBLIC_V9=1: with it unset nothing V9 shows anywhere, and the live site is V8 as before.
 */
export const V9_ON = process.env.NEXT_PUBLIC_V9 === "1";

/** Base Sepolia (crux-contracts broadcast/DeployFactoryV9.s.sol). Testnet scale: graduation at $10, not $10,000. */
export const FACTORY_V9 = getAddress(process.env.NEXT_PUBLIC_CRUX_FACTORY_V9 || "0x4a28e8B20e312fB67c71Fa6e2F085520d3DEd8e7");
export const ROUTER_V9 = getAddress(process.env.NEXT_PUBLIC_CRUX_ROUTER_V9 || "0x86A518410EFfa9cAEbf92BD87DEe08678bA39682");

export const factoryV9Abi = parseAbi([
  "struct LaunchParams { string name; string symbol; string metadataURI; bytes32 salt; }",
  "struct LaunchOptions { bool instantUnlock; uint32 openingWindow; uint256 openingCap; }",
  "function launchCount() view returns (uint256)",
  "function getLaunch(uint256 id) view returns ((address token, address curve, address pair, address creator))",
  "function curveOf(address token) view returns (address)",
  "function tokenDeployer() view returns (address)",
  "function tokenInitCodeHash(LaunchParams params, address creator) view returns (bytes32)",
  "function nonces(address) view returns (uint256)",
  "function threshold() view returns (uint256)",
  "function launch(LaunchParams params, LaunchOptions options) returns (uint256 id, address token)",
  "event Launched(uint256 indexed id, address indexed token, address indexed creator, address curve, address pair, bool instantUnlock, uint32 openingWindow, uint256 openingCap)",
]);

export const curveV9Abi = parseAbi([
  "function graduated() view returns (bool)",
  "function trading() view returns (bool)",
  "function openingSettled() view returns (bool)",
  "function openingEnds() view returns (uint64)",
  "function openingCap() view returns (uint256)",
  "function openingTotal() view returns (uint256)",
  "function openingDeposit(address) view returns (uint256)",
  "function launchedAt() view returns (uint64)",
  "function realUsdc() view returns (uint256)",
  "function threshold() view returns (uint256)",
  "function spotPrice() view returns (uint256)",
  "function creatorVesting() view returns (uint64)",
  "function creatorClaimable() view returns (uint256)",
  "function deposit(uint256 amount, address recipient)",
  "function claimOpening(address recipient) returns (uint256 tokens, uint256 refund)",
  "function claimCreator() returns (uint256)",
  "event Buy(address indexed payer, address indexed recipient, uint256 usdcIn, uint256 fee, uint256 tokensOut, uint256 realUsdcAfter, uint256 reserveTokenAfter)",
  "event Sell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 usdcOut, uint256 fee, uint256 realUsdcAfter, uint256 reserveTokenAfter)",
]);

export const routerV9Abi = parseAbi([
  "function buy(address token, uint256 usdcIn, uint256 minTokensOut, address recipient, uint256 deadline) returns (uint256)",
  "function sell(address token, uint256 tokensIn, uint256 minUsdcOut, address recipient, uint256 deadline) returns (uint256)",
  "function quoteBuy(address token, uint256 usdcIn) view returns (uint256 tokensOut, uint256 curveTokens, uint256 poolTokens, uint256 fee)",
  "function quoteSell(address token, uint256 tokensIn) view returns (uint256 usdcOut, uint256 fee)",
  "function creatorEarnings(address token) view returns (uint256 unclaimed, uint256 lifetime)",
  "function claimAllCreatorFees(address token) returns (uint256)",
]);

/** CruxFactoryV9.LAUNCH_TYPEHASH, as EIP-712 types (domain "CruxFactoryV9", version "1"). */
export const LAUNCH_TYPES_V9 = {
  Launch: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "metadataURI", type: "string" },
    { name: "salt", type: "bytes32" },
    { name: "instantUnlock", type: "bool" },
    { name: "openingWindow", type: "uint32" },
    { name: "openingCap", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type V9LaunchParams = { name: string; symbol: string; metadataURI: string; salt: Hex };
export type V9LaunchOptions = { instantUnlock: boolean; openingWindow: number; openingCap: bigint };

/** The phase a V9 launch is in: taking opening deposits, trading on its curve, or on its Uniswap pool. */
export type PhaseV9 = "opening" | "curve" | "graduating" | "graduated";

export function phaseV9(s: { graduated: boolean; openingEnds: number; realUsdc: bigint; threshold: bigint }, now: number): PhaseV9 {
  if (s.graduated) return "graduated";
  if (now < s.openingEnds) return "opening";
  return s.realUsdc >= s.threshold ? "graduating" : "curve";
}

/** USDC per whole token from a curve's spotPrice (USDC base units per token base unit, scaled by 1e36). */
export const curvePrice = (spot: bigint, decimals = 18) => (Number(spot) / 1e36) * 10 ** (decimals - 6);

/**
 * A V9 launch with the user's 5afe Crux account as creator: the login key signs (CruxFactoryV9 checks the account's
 * owner through CruxAccountFactoryV3), and the relay deploys the account if needed, then submits launchFor. The
 * creator's tokens and fee share go to the account. Returns the new launch's id.
 */
export async function launchFromAccountV9(
  sign: AccountSigner,
  account: Address,
  nonce: bigint,
  params: V9LaunchParams,
  options: V9LaunchOptions,
): Promise<bigint> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const signature = await sign({
    domain: { name: "CruxFactoryV9", version: "1", chainId: TESTNET.id, verifyingContract: FACTORY_V9 },
    types: LAUNCH_TYPES_V9,
    primaryType: "Launch",
    message: { ...params, ...options, creator: account, nonce, deadline },
  });
  const { v3 } = accountFields(account);
  const data = await postRelay("/v1/launches", {
    version: 9,
    params,
    options: { instantUnlock: options.instantUnlock, openingWindow: String(options.openingWindow), openingCap: options.openingCap.toString() },
    creator: account,
    deadline: deadline.toString(),
    signature,
    ...(v3 ? { v3 } : {}),
  });
  if (typeof data.id !== "string") throw new Error("The relay launched it but didn't return its id. Find it under Launches.");
  return BigInt(data.id);
}

/** Curves of V9 pairs this page has seen: the pool reader also reads their trades before graduation. */
const curveOfPair = new Map<string, Address>();
export const registerV9Curve = (pair: Address, curve: Address) => void curveOfPair.set(pair.toLowerCase(), curve);
export const v9CurveOf = (pair: Address): Address | undefined => curveOfPair.get(pair.toLowerCase());
