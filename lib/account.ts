import { getAddress, getContractAddress, isAddress, keccak256, parseAbi, type Address, type Hex } from "viem";
import { TESTNET } from "@/lib/chains";
import { postRelay } from "@/lib/session";

/**
 * Crux accounts (CruxAccount, Phase B). Logging in with email or Google gives the trader a Privy embedded wallet: the
 * account's owner, a login key that signs silently. The account itself is a contract at an address derived from that
 * key, the same on every chain, and it's the trader's deposit address. Its funds can only:
 *   - trade through the Crux settler, with every fill and refund paid back into the account, or
 *   - be withdrawn to the withdrawal address the trader binds (instant the first time; any change waits 48 hours, and
 *     the bound address can cancel it or sweep everything to itself).
 * The login key signs EIP-712 messages; the relay submits them and pays the gas, deploying the account right before
 * its first trade or binding. A stolen login key can trade but never move funds out.
 */

/** CruxAccountFactory: the same address on every chain (deterministic CREATE2 deploy). */
export const ACCOUNT_FACTORY = "0xDdB0DF1CfcdEd073A72A489351f22cfF646f8C6E" as Address;
/**
 * CruxAccountFactoryV2: accounts with standing orders (take profit, stop loss, buy the dip). Once it's deployed it
 * becomes the trader's account; their V1 account stays readable so its funds can be moved, and it remains the creator
 * of gasless launches (CruxFactoryV7 checks the V1 factory).
 */
export const ACCOUNT_FACTORY_V2 = "0xf8962965f04e20B95dAdD931fDe00121906a97DC" as Address;
/**
 * CruxAccountFactoryV3 (crux-contracts script/DeployOneAccount.s.sol): one account per trader that trades, holds
 * standing orders and launches, at an address ending in 5afe, born with its withdrawal address bound. Its address is
 * predict(owner, withdrawalAddress, nonce), the lowest nonce that gives 5afe (mined in the browser, mineAccountV3), so
 * the same login key and withdrawal wallet always give the same account, on every device. Once it's deployed it is the
 * trader's account; their V1/V2 accounts stay readable so their funds can be moved. NEXT_PUBLIC_CRUX_ACCOUNT_FACTORY_V3
 * overrides it (a fork).
 */
export const ACCOUNT_FACTORY_V3 = getAddress(
  process.env.NEXT_PUBLIC_CRUX_ACCOUNT_FACTORY_V3 && isAddress(process.env.NEXT_PUBLIC_CRUX_ACCOUNT_FACTORY_V3)
    ? process.env.NEXT_PUBLIC_CRUX_ACCOUNT_FACTORY_V3
    : "0xBD7AF76bcc2D080364a0c3C138ef82efCF8E12DF",
);
/** The CruxAccountV2 every V3 account clones: the factory's first contract creation. */
export const ACCOUNT_IMPLEMENTATION_V3 = getContractAddress({ from: ACCOUNT_FACTORY_V3, nonce: BigInt(1) });
/** How long a change of withdrawal address waits (CruxAccount.WITHDRAWAL_CHANGE_DELAY). */
export const WITHDRAWAL_CHANGE_DELAY = 48 * 3600;
/** A trade's fill deadline is at most this far out (CruxAccount.MAX_FILL_WINDOW); the terminal uses 10 minutes less. */
export const ACCOUNT_FILL_SECONDS = 600;

export const accountFactoryAbi = parseAbi(["function accountOf(address owner) view returns (address)"]);
export const accountFactoryV3Abi = parseAbi(["function ownerOf(address account) view returns (address)", "function predict(address owner, address withdrawalAddress, uint256 nonce) view returns (address)"]);

/** A V3 account's salt fields: with the owner, they are its address. */
export type V3Account = { account: Address; withdrawalAddress: Address; nonce: bigint };

const hexBytes = (hex: string) => {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * The owner's 5afe account for that withdrawal address: the lowest nonce whose EIP-1167 clone at CREATE2 salt
 * keccak256(abi.encode(owner, withdrawalAddress, nonce)) ends in 5afe (crux-solver scripts/vanity.ts). About 65,536
 * tries; it yields to the page every few thousand so the form stays responsive.
 */
export async function mineAccountV3(owner: Address, withdrawalAddress: Address): Promise<V3Account> {
  const salt = new Uint8Array(96);
  salt.set(hexBytes(owner), 12);
  salt.set(hexBytes(withdrawalAddress), 44);
  const create2 = new Uint8Array(85);
  create2[0] = 0xff;
  create2.set(hexBytes(ACCOUNT_FACTORY_V3), 1);
  const clone = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${ACCOUNT_IMPLEMENTATION_V3.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
  create2.set(keccak256(clone, "bytes"), 53);
  for (let nonce = BigInt(0); nonce < BigInt(5_000_000); nonce++) {
    let n = nonce;
    for (let i = 95; i >= 64; i--) {
      salt[i] = Number(n & BigInt(0xff));
      n >>= BigInt(8);
    }
    create2.set(keccak256(salt, "bytes"), 21);
    const hash = keccak256(create2, "bytes");
    if (hash[30] === 0x5a && hash[31] === 0xfe) {
      const account = getAddress(`0x${[...hash.subarray(12)].map((b) => b.toString(16).padStart(2, "0")).join("")}`);
      return { account, withdrawalAddress: getAddress(withdrawalAddress), nonce };
    }
    if (nonce % BigInt(4096) === BigInt(4095)) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("Couldn't find a 5afe address. Try again.");
}

/**
 * V3 accounts this page knows the salt fields of, so every relay request about one carries them (`v3`): the relay
 * deploys the account from them on its first trade, standing order or launch. useCruxAccount registers them.
 */
const v3Known = new Map<string, V3Account>();
export const rememberV3 = (a: V3Account) => void v3Known.set(a.account.toLowerCase(), a);
/** The request fields naming `account`, plus its salt fields when it is a V3 account. */
export function accountFields(account: Address): Record<string, unknown> {
  const v3 = v3Known.get(account.toLowerCase());
  return v3 ? { account, v3: { withdrawalAddress: v3.withdrawalAddress, nonce: v3.nonce.toString() } } : { account };
}
export const cruxAccountAbi = parseAbi([
  "function owner() view returns (address)",
  "function withdrawalAddress() view returns (address)",
  "function pendingWithdrawalAddress() view returns (address)",
  "function withdrawalChangeEta() view returns (uint64)",
  "function emergencySweep(address[] tokens)",
  "function cancelWithdrawalChange(uint256 nonce, uint256 deadline, bytes signature)",
]);

/** The EIP-712 types the owner signs (CruxAccount's typehashes, mirrored in crux-solver accounts.ts). */
export const ACCOUNT_TYPES = {
  Trade: [
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "fillDeadline", type: "uint32" },
    { name: "batchWindow", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Withdraw: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  SetWithdrawalAddress: [
    { name: "withdrawalAddress", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  CancelWithdrawalChange: [
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type PrimaryType = keyof typeof ACCOUNT_TYPES;

export type AccountTypedData = {
  domain: { name: "CruxAccount"; version: "1"; chainId: number; verifyingContract: Address };
  types: Pick<typeof ACCOUNT_TYPES, PrimaryType>;
  primaryType: PrimaryType;
  message: Record<string, unknown>;
};

/** Any EIP-712 message the login key signs: an account action (AccountTypedData) or a launch (CruxFactoryV7). */
export type TypedDataToSign = {
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

/** Signs one message with the owner's login key (the Privy embedded wallet, silently). */
export type AccountSigner = (typed: TypedDataToSign) => Promise<Hex>;

const typed = (account: Address, primaryType: PrimaryType, message: Record<string, unknown>): AccountTypedData => ({
  domain: { name: "CruxAccount", version: "1", chainId: TESTNET.id, verifyingContract: account },
  types: { [primaryType]: ACCOUNT_TYPES[primaryType] } as AccountTypedData["types"],
  primaryType,
  message,
});

/** A random unordered nonce: several signed actions can be in flight at once. */
export function accountNonce(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return BigInt(`0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
}

/** Signatures expire two minutes after signing (the relay submits within seconds). */
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 120);

export type AccountTrade = { tokenIn: Address; amountIn: bigint; tokenOut: string; minAmountOut: bigint };

/** A buy or sell from the account, signed by the login key and opened by the relay. Returns the order id. */
export async function tradeFromAccount(sign: AccountSigner, owner: Address, account: Address, t: AccountTrade): Promise<Hex> {
  const now = Math.floor(Date.now() / 1000);
  const message = {
    tokenIn: t.tokenIn,
    amountIn: t.amountIn,
    tokenOut: t.tokenOut,
    // Accounts refuse a zero minimum (CruxAccount.ZeroMinimum); a dust trade asks for at least one unit.
    minAmountOut: t.minAmountOut > BigInt(0) ? t.minAmountOut : BigInt(1),
    fillDeadline: now + ACCOUNT_FILL_SECONDS,
    batchWindow: 10,
    nonce: accountNonce(),
    deadline: deadline(),
  };
  const signature = await sign(typed(account, "Trade", message));
  const data = await postRelay("/v1/account/trade", { owner, ...accountFields(account), trade: message, signature });
  if (typeof data.orderId !== "string") throw new Error("The relay opened the trade but didn't return its order id.");
  return data.orderId as Hex;
}

/** Binds the withdrawal address (instant while none is bound) or requests a change (takes effect after 48 hours). */
export async function setWithdrawalAddress(sign: AccountSigner, owner: Address, account: Address, to: Address) {
  const message = { withdrawalAddress: to, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "SetWithdrawalAddress", message));
  return postRelay("/v1/account/withdrawal-address", { owner, ...accountFields(account), ...message, signature });
}

/** Withdraws `amount` of `token` to the bound withdrawal address, the only place it can go. */
export async function withdrawFromAccount(sign: AccountSigner, owner: Address, account: Address, token: Address, amount: bigint) {
  const message = { token, amount, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "Withdraw", message));
  return postRelay("/v1/account/withdraw", { owner, ...accountFields(account), ...message, signature });
}

export async function cancelWithdrawalChange(sign: AccountSigner, owner: Address, account: Address) {
  const message = { nonce: accountNonce(), deadline: deadline() };
  const signature = await sign(typed(account, "CancelWithdrawalChange", message));
  return postRelay("/v1/account/cancel-change", { owner, ...accountFields(account), ...message, signature });
}

/** CruxFactoryV7's gasless launch (LAUNCH_TYPEHASH), mirrored in crux-solver launchrelay.ts. */
export const LAUNCH_TYPES = {
  Launch: [
    { name: "params", type: "LaunchParams" },
    { name: "options", type: "LaunchOptions" },
  ],
  LaunchParams: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "metadataURI", type: "string" },
    { name: "totalSupply", type: "uint256" },
    { name: "graduationTarget", type: "uint256" },
    { name: "startTime", type: "uint64" },
    { name: "batchWindow", type: "uint32" },
    { name: "maxAllocationPerWallet", type: "uint256" },
  ],
  LaunchOptions: [
    { name: "instantUnlock", type: "bool" },
    { name: "antiSniper", type: "bool" },
    { name: "creator", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type LaunchParamsInput = {
  name: string;
  symbol: string;
  metadataURI: string;
  totalSupply: bigint;
  graduationTarget: bigint;
  startTime: bigint;
  batchWindow: number;
  maxAllocationPerWallet: bigint;
};

/** CruxFactoryV8's LAUNCH_TYPEHASH: V7's, with `bytes32 salt` closing LaunchParams (the token's 5afe salt). */
export const LAUNCH_TYPES_V8 = {
  ...LAUNCH_TYPES,
  LaunchParams: [...LAUNCH_TYPES.LaunchParams, { name: "salt", type: "bytes32" }],
} as const;

/**
 * A launch on CruxFactoryV8 with the 5afe Crux account as creator: the token's salt is mined for the account (its
 * address ends in 5afe too), the login key signs silently, and the relay deploys the account if needed, then submits
 * the launch. The creator fee, creator share and vesting go to the account. Returns the new auction's id.
 */
export async function launchFromAccountV8(
  sign: AccountSigner,
  account: Address,
  factory: Address,
  params: LaunchParamsInput & { salt: Hex },
  choices: { instantUnlock: boolean; antiSniper: boolean },
): Promise<bigint> {
  const options = { ...choices, creator: account, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign({
    domain: { name: "CruxFactory", version: "8", chainId: TESTNET.id, verifyingContract: factory },
    types: LAUNCH_TYPES_V8,
    primaryType: "Launch",
    message: { params, options },
  });
  const { v3 } = accountFields(account);
  const data = await postRelay("/v1/launches", { params, options, signature, ...(v3 ? { v3 } : {}) });
  if (typeof data.auctionId !== "string") throw new Error("The relay launched it but didn't return the auction id. Find it under Discover.");
  return BigInt(data.auctionId);
}

/**
 * A launch on CruxFactoryV7 with the Crux account as creator: the login key signs it silently and the relay submits
 * it (POST /v1/launches), so the creator needs nothing on Base. The creator fee, creator share and vesting go to the
 * account. Returns the new auction's id.
 */
export async function launchFromAccount(
  sign: AccountSigner,
  account: Address,
  factory: Address,
  params: LaunchParamsInput,
  choices: { instantUnlock: boolean; antiSniper: boolean },
): Promise<bigint> {
  const options = { ...choices, creator: account, nonce: accountNonce(), deadline: deadline() };
  const signature = await sign({
    domain: { name: "CruxFactory", version: "7", chainId: TESTNET.id, verifyingContract: factory },
    types: LAUNCH_TYPES,
    primaryType: "Launch",
    message: { params, options },
  });
  const data = await postRelay("/v1/launches", { params, options, signature });
  if (typeof data.auctionId !== "string") throw new Error("The relay launched it but didn't return the auction id. Find it under Discover.");
  return BigInt(data.auctionId);
}

/** Applies a change whose 48 hours have passed. Needs no signature. */
export async function finalizeWithdrawalChange(owner: Address, account: Address) {
  return postRelay("/v1/account/finalize-change", { owner, ...accountFields(account) });
}
