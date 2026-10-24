import { erc20Abi, getAddress, maxUint256, parseAbi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Config } from "wagmi";
import { readContract, signTypedData, waitForTransactionReceipt } from "wagmi/actions";
import { TESTNET } from "@/lib/chains";
import { SETTLER, TESTNET_USDC, buildGaslessOrder, type IntentDraft } from "@/lib/intents";
import { simulateThenWrite } from "@/lib/preflight";

/**
 * One-click trading (CruxSettlerV4). At login the wallet signs two typed messages, no gas:
 *   - a CruxSession naming a key generated in this browser, the token (test USDC), a cap and an expiry <= 24 h;
 *   - a Permit2 PermitSingle giving the settler exactly that cap until exactly that expiry.
 * The relay (https://api.cruxprotocol.xyz) submits them. Each buy is then signed by the browser key alone and posted to
 * the relay, which opens it; the input comes from the wallet through Permit2, and the output always goes to the wallet.
 *
 * The browser key is kept in this browser's localStorage until the session ends. Anyone who got it could only make
 * buys for this wallet, within the cap, until the expiry, with the tokens delivered to this wallet: never withdraw.
 * First use per token needs one ordinary transaction: approving Permit2 in test USDC.
 */

export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
export const RELAY_URL = (process.env.NEXT_PUBLIC_CRUX_RELAY ?? "https://api.cruxprotocol.xyz").replace(/\/$/, "");
/** Longest a session lasts (the settler's MAX_SESSION_DURATION). */
export const SESSION_SECONDS = 24 * 3600;
/** Largest cap the settler allows for test USDC (its sessionCapLimit), in whole USDC. */
export const MAX_CAP_USDC = 1_000_000;

const permit2Abi = parseAbi(["function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)"]);
const sessionAbi = parseAbi(["function revokeSession(address token)"]);

export type StoredSession = {
  owner: Address;
  settler: Address;
  token: Address;
  /** The browser key's private key: lives only here, for this session. */
  key: Hex;
  sessionKey: Address;
  cap: string;
  expiry: number;
};

const storageKey = (owner: Address, token: Address) => `crux:session:v1:${SETTLER.toLowerCase()}:${owner.toLowerCase()}:${token.toLowerCase()}`;

/** The wallet's live session in this browser, or null (none, expired, or for another settler). */
export function loadSession(owner: Address, token: Address = TESTNET_USDC): StoredSession | null {
  try {
    const raw = localStorage.getItem(storageKey(owner, token));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    // A little margin, so an order isn't signed seconds before the session ends.
    if (s.expiry <= Math.floor(Date.now() / 1000) + 60) {
      localStorage.removeItem(storageKey(owner, token));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Forgets the browser key: this browser can sign nothing more for the session. */
export function forgetSession(owner: Address, token: Address = TESTNET_USDC) {
  try {
    localStorage.removeItem(storageKey(owner, token));
  } catch {
    // Storage blocked: nothing was kept anyway.
  }
}

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${RELAY_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: json(body) });
  } catch {
    throw new Error("Couldn't reach the Crux relay. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) throw new Error(typeof data.error === "string" ? data.error : `The relay answered ${res.status}.`);
  return data;
}

export type LoginStep = "approving" | "signing-session" | "signing-permit" | "submitting";

/**
 * Starts a session for `owner` with a cap of `capUnits` test USDC (6 decimals). The wallet must be on Base Sepolia.
 * Returns the stored session once the settler has it.
 */
export async function startSession(config: Config, owner: Address, capUnits: bigint, onStep: (s: LoginStep) => void): Promise<StoredSession> {
  const token = TESTNET_USDC;
  const on = { chainId: TESTNET.id } as const;

  // Once per token: let Permit2 move test USDC. Permit2 itself then only lets the settler take what a session allows.
  const allowance = await readContract(config, { ...on, address: token, abi: erc20Abi, functionName: "allowance", args: [owner, PERMIT2] });
  if (allowance < capUnits) {
    const hash = await simulateThenWrite(config, owner, { ...on, address: token, abi: erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] }, () => onStep("approving"));
    const receipt = await waitForTransactionReceipt(config, { ...on, hash });
    if (receipt.status !== "success") throw new Error("The Permit2 approval didn't go through.");
  }

  const key = generatePrivateKey();
  const sessionKey = privateKeyToAccount(key).address;
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS - 120; // inside the 24 h limit when it lands
  const [, , permitNonce] = await readContract(config, { ...on, address: PERMIT2, abi: permit2Abi, functionName: "allowance", args: [owner, token, SETTLER] });
  const session = { owner, sessionKey, token, cap: capUnits, expiry, nonce: BigInt(Date.now()) };

  onStep("signing-session");
  const ownerSignature = await signTypedData(config, {
    domain: { name: "CruxSettler", version: "4", chainId: TESTNET.id, verifyingContract: SETTLER },
    types: {
      CruxSession: [
        { name: "owner", type: "address" },
        { name: "sessionKey", type: "address" },
        { name: "token", type: "address" },
        { name: "cap", type: "uint160" },
        { name: "expiry", type: "uint48" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "CruxSession",
    message: session,
  });

  onStep("signing-permit");
  const permit = { details: { token, amount: capUnits, expiration: expiry, nonce: permitNonce }, spender: SETTLER, sigDeadline: BigInt(expiry) };
  const permitSignature = await signTypedData(config, {
    domain: { name: "Permit2", chainId: TESTNET.id, verifyingContract: PERMIT2 },
    types: {
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
    },
    primaryType: "PermitSingle",
    message: permit,
  });

  onStep("submitting");
  await post("/v1/sessions", { session, ownerSignature, permit, permitSignature });

  const stored: StoredSession = { owner: getAddress(owner), settler: SETTLER, token, key, sessionKey, cap: capUnits.toString(), expiry };
  try {
    localStorage.setItem(storageKey(owner, token), JSON.stringify(stored));
  } catch {
    throw new Error("This browser won't store the session key (private mode?). One-click needs it.");
  }
  return stored;
}

/** Signs `draft` with the session's browser key (no wallet prompt) and has the relay open it. Returns the order id. */
export async function placeOneClick(session: StoredSession, draft: IntentDraft): Promise<Hex> {
  const { order, typed } = buildGaslessOrder(draft);
  const signature = await privateKeyToAccount(session.key).signTypedData(typed as Parameters<ReturnType<typeof privateKeyToAccount>["signTypedData"]>[0]);
  const data = await post("/v1/orders", { order, signature });
  return data.orderId as Hex;
}

/** What's left of the session's cap and when it lapses, from Permit2 itself. */
export async function remainingCap(config: Config, owner: Address, token: Address = TESTNET_USDC) {
  const [amount, expiration] = await readContract(config, { chainId: TESTNET.id, address: PERMIT2, abi: permit2Abi, functionName: "allowance", args: [owner, token, SETTLER] });
  return { amount, expiration: Number(expiration) };
}

/** Ends the session on-chain too (one transaction): its key can sign nothing more, from any browser. */
export async function revokeOnChain(config: Config, owner: Address, token: Address = TESTNET_USDC) {
  const hash = await simulateThenWrite(config, owner, { chainId: TESTNET.id, address: SETTLER, abi: sessionAbi, functionName: "revokeSession", args: [token] });
  await waitForTransactionReceipt(config, { chainId: TESTNET.id, hash });
  forgetSession(owner, token);
}
