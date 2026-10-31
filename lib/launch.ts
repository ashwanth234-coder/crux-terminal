import { BaseError, ContractFunctionRevertedError, formatUnits, type Address, type Hex } from "viem";

/** On-chain `Auction` struct with times as plain numbers. */
export type AuctionState = {
  token: Address;
  creator: Address;
  startTime: number;
  batchWindow: number;
  /** USDC, 6 decimals. */
  graduationTarget: bigint;
  totalDeposits: bigint;
  /** USDC (6dp) per whole token; zero until graduated. */
  clearingPrice: bigint;
  /** 0 Live, 1 Settled (reserved), 2 Graduated, 3 Cancelled. */
  status: number;
};

/** Progress of a multi-step write, shown while the wallet and chain work. */
export type TxStep = { label: string; hash?: Hex };
export type OnStep = (step: TxStep) => void;

/**
 * Everything the launch view renders and does, from either the deployed
 * factory on Base Sepolia or the local simulated preview.
 */
export type LaunchModel = {
  mode: "live" | "simulated";
  name: string | null;
  symbol: string | null;
  auction: AuctionState | null;
  /** Tokens sold in the window (80% of supply), 18 decimals. */
  saleSupply: bigint | null;
  loading: boolean;
  error: string | null;
  /** Connected buyer; simulated mode always has one. */
  account: Address | null;
  connect: () => void;
  /** Unclaimed USDC this account committed. */
  myDeposit: bigint;
  /** `previewAllocation`: tokens if the auction graduated at current deposits. */
  allocation: bigint;
  usdcBalance: bigint | null;
  allowance: bigint | null;
  deposit: (amount: bigint, onStep: OnStep) => Promise<Hex | undefined>;
  settle: (onStep: OnStep) => Promise<Hex | undefined>;
  claim: (onStep: OnStep) => Promise<Hex | undefined>;
};

/** "scheduled" only occurs on V2 launches, before deposits open. */
export type Phase = "scheduled" | "open" | "closed" | "settled" | "graduated" | "cancelled";

export function auctionPhase(a: AuctionState, now: number): Phase {
  if (a.status === 2) return "graduated";
  if (a.status === 3) return "cancelled";
  if (a.status === 1) return "settled";
  return now < a.startTime + a.batchWindow ? "open" : "closed";
}

export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;

const usdcFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tokenFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const priceFmt = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

export const fmtUsdc = (v: bigint) => usdcFmt.format(Number(formatUnits(v, USDC_DECIMALS)));
export const fmtTokens = (v: bigint) => tokenFmt.format(Number(formatUnits(v, TOKEN_DECIMALS)));

/**
 * Uniform clearing price, USDC per whole token: totalDeposits / saleSupply.
 * Scaled to 18 decimals so sub-cent prices keep their significant digits.
 */
export function impliedPrice(totalDeposits: bigint, saleSupply: bigint | null) {
  if (!saleSupply || totalDeposits === BigInt(0)) return null;
  return priceFmt.format(Number(formatUnits((totalDeposits * BigInt(10) ** BigInt(30)) / saleSupply, 18)));
}

const capFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

/**
 * Market cap at the uniform clearing price: price × total supply. The factory
 * sells 80% of supply (CruxFactory.SALE_BPS), so this is deposits ÷ 0.8.
 */
export function impliedMarketCap(totalDeposits: bigint) {
  if (totalDeposits === BigInt(0)) return null;
  const cap = Number(formatUnits((totalDeposits * BigInt(10_000)) / BigInt(8_000), USDC_DECIMALS));
  return cap < 10_000 ? `$${cap.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : capFmt.format(cap);
}

/** mm:ss, or h:mm:ss for open-sale windows longer than an hour. */
export function formatRemaining(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

const REVERTS: Record<string, string> = {
  NotVanity: "The token address wasn't a …5afe one (the launch details changed after it was prepared). Try again.",
  UnknownAuction: "No auction with this id exists on the factory.",
  NotLive: "This auction has already been settled.",
  WindowClosed: "The deposit window has closed. Settle the auction to finish it.",
  WindowOpen: "The window is still open; it can be settled once the countdown ends.",
  ZeroAmount: "Enter an amount above zero.",
  NothingToClaim: "This wallet has nothing left to claim in this auction.",
  NotStarted: "Deposits haven't opened yet. They open at the scheduled start.",
  PriceBelowFloor: "Your limit is below the floor price. Raise it to at least the floor.",
  TooManyBidders: "This auction is full: it has reached the maximum number of bidders.",
  DepositCapExceeded: "That would take this wallet past its deposit cap for this launch. Lower the amount.",
  InvalidTick: "That price step doesn't exist on this auction.",
  InvalidClearingPrice: "The clearing price changed. Refresh and settle again.",
  NotSettled: "The auction hasn't been settled yet.",
  InvalidParams: "Those launch settings aren't allowed. Check the start time, window, supply and wallet cap.",
};

/** Human message for wallet, RPC and CruxFactory revert errors. */
export function launchError(err: unknown) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return REVERTS[revert.data.errorName] ?? `Reverted: ${revert.data.errorName}`;
    }
  }
  const e = err as { name?: string; shortMessage?: string; message?: string };
  if (e.name === "UserRejectedRequestError" || /reject|denied/i.test(e.shortMessage ?? "")) return "Request rejected in wallet.";
  return e.shortMessage ?? e.message?.split("\n")[0] ?? "Something went wrong";
}

/** Query string that carries a simulated launch to its preview page. */
export function previewHref(p: { name: string; symbol: string; supply: string; target: string; window: number; start: number }) {
  const q = new URLSearchParams({
    name: p.name,
    symbol: p.symbol,
    supply: p.supply,
    target: p.target,
    window: String(p.window),
    start: String(p.start),
  });
  return `/launch/preview?${q.toString()}`;
}
