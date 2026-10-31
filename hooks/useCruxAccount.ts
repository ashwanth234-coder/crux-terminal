"use client";

import { useCallback, useMemo, useState } from "react";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { erc20Abi, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { useBytecode, useReadContract, useReadContracts } from "wagmi";
import {
  ACCOUNT_FACTORY,
  ACCOUNT_FACTORY_V2,
  ACCOUNT_FACTORY_V3,
  accountFactoryAbi,
  cruxAccountAbi,
  mineAccountV3,
  rememberV3,
  type AccountSigner,
  type V3Account,
} from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";

/** eth_signTypedData_v4 JSON: bigints as decimal strings, nested structs included. */
const plain = (v: unknown): unknown =>
  typeof v === "bigint"
    ? v.toString()
    : Array.isArray(v)
      ? v.map(plain)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;

const EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export type CruxAccountState = {
  /** Privy has loaded (the login state is known). */
  ready: boolean;
  loggedIn: boolean;
  /** How the trader logged in, for the header ("ana@…", "Google"). */
  label: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** The login key (Privy embedded wallet): the account's owner. Null until it exists. */
  owner: Address | null;
  /**
   * The CruxAccount address: the deposit address, valid before the account is deployed. The 5afe V3 account once its
   * factory is live (null until the trader picks its withdrawal wallet: `setup`), else V2, else V1.
   */
  account: Address | null;
  /** The account has standing orders (CruxAccountV2, which V3 accounts are too). */
  v2: boolean;
  /** The 5afe account's salt fields: one account that trades and launches (gasless, on CruxFactoryV8). */
  v3: V3Account | null;
  /** V3 is live but this trader hasn't picked the withdrawal wallet their 5afe account is born bound to. */
  setup: { needed: boolean; suggested: Address | null; create: (withdrawalAddress: Address) => Promise<void> };
  /** Earlier accounts (V2, V1) once a newer one is live: funds left there can be withdrawn and moved over. */
  legacy: LegacyAccount[];
  /** The account named as creator of gasless launches: the V3 account, or (before V3) the V1 one, which V7 knows. */
  launchAccount: Address | null;
  deployed: boolean;
  /** Bound withdrawal address, or null while none is (the account isn't protected yet). */
  withdrawalAddress: Address | null;
  pendingWithdrawalAddress: Address | null;
  /** Unix seconds a pending change can be finalized. */
  withdrawalChangeEta: number | null;
  /** The account's test USDC (6 decimals), null while unknown. */
  usdc: bigint | null;
  /** Signs account messages with the login key, silently. Null until the embedded wallet is ready. */
  sign: AccountSigner | null;
  refresh: () => void;
};

export type LegacyAccount = { account: Address; label: "V1" | "V2"; usdc: bigint | null; withdrawalAddress: Address | null };

const v3Key = (owner: Address) => `crux.account.v3.${owner.toLowerCase()}`;
function loadV3(owner: Address): V3Account | null {
  try {
    const raw = localStorage.getItem(v3Key(owner));
    if (!raw) return null;
    const j = JSON.parse(raw) as { account: Address; withdrawalAddress: Address; nonce: string };
    return { account: getAddress(j.account), withdrawalAddress: getAddress(j.withdrawalAddress), nonce: BigInt(j.nonce) };
  } catch {
    return null;
  }
}

/** The logged-in trader's Crux account (lib/account.ts): login state, addresses, protection and balance. */
export function useCruxAccount(): CruxAccountState {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const owner = authenticated && embedded ? getAddress(embedded.address) : null;
  const on = { chainId: TESTNET.id } as const;

  const accountOf = useReadContract({
    ...on,
    address: ACCOUNT_FACTORY,
    abi: accountFactoryAbi,
    functionName: "accountOf",
    args: [owner ?? zeroAddress],
    query: { enabled: owner !== null, staleTime: Infinity },
  });
  const v1 = owner && accountOf.data ? getAddress(accountOf.data) : null;
  // V2 takes over as soon as its factory exists on Base Sepolia.
  const v2Code = useBytecode({ ...on, address: ACCOUNT_FACTORY_V2, query: { refetchInterval: (q) => (q.state.data ? false : 60_000) } });
  const v2Live = Boolean(v2Code.data && v2Code.data !== "0x");
  const accountOfV2 = useReadContract({
    ...on,
    address: ACCOUNT_FACTORY_V2,
    abi: accountFactoryAbi,
    functionName: "accountOf",
    args: [owner ?? zeroAddress],
    query: { enabled: owner !== null && v2Live, staleTime: Infinity },
  });
  const v2 = owner && v2Live && accountOfV2.data ? getAddress(accountOfV2.data) : null;
  // V3 (5afe, born bound) takes over as soon as its factory exists. Its address needs the withdrawal wallet, so it's
  // remembered per login key; the same key and wallet mine the same address on any device.
  const v3Code = useBytecode({ ...on, address: ACCOUNT_FACTORY_V3, query: { refetchInterval: (q) => (q.state.data ? false : 60_000) } });
  const v3Live = Boolean(v3Code.data && v3Code.data !== "0x");
  const [created, setCreated] = useState<{ owner: Address; v3: V3Account } | null>(null);
  // Read each render: a few bytes of localStorage, and always in step with the logged-in key.
  const stored = owner ? loadV3(owner) : null;
  const v3 = created && created.owner === owner ? created.v3 : stored;
  // Relay requests about the account carry its salt fields (lib/account.ts accountFields); registering is idempotent.
  if (v3) rememberV3(v3);
  const createV3 = async (withdrawalAddress: Address) => {
    if (!owner) throw new Error("Your login key is still being set up. Try again in a moment.");
    const mined = await mineAccountV3(owner, withdrawalAddress);
    try {
      localStorage.setItem(v3Key(owner), JSON.stringify({ ...mined, nonce: mined.nonce.toString() }));
    } catch {
      // Private mode: it lasts this visit, and the same wallet gives the same address next time.
    }
    setCreated({ owner, v3: mined });
  };
  const mine = v3Live && v3 ? v3.account : null;
  const account = v3Live ? mine : v2Live ? v2 : v1;
  const older = (v3Live ? [v2Live && v2 ? { account: v2, label: "V2" as const } : null, v1 ? { account: v1, label: "V1" as const } : null] : [v2Live && v1 ? { account: v1, label: "V1" as const } : null]).filter(
    (x): x is { account: Address; label: "V1" | "V2" } => x !== null,
  );
  const legacyReads = useReadContracts({
    contracts: older.flatMap((o) => [
      { ...on, address: TESTNET_USDC, abi: erc20Abi, functionName: "balanceOf", args: [o.account] } as const,
      { ...on, address: o.account, abi: cruxAccountAbi, functionName: "withdrawalAddress" } as const,
    ]),
    query: { enabled: older.length > 0, refetchInterval: 15_000 },
  });
  const code = useBytecode({ ...on, address: account ?? zeroAddress, query: { enabled: account !== null, refetchInterval: (q) => (q.state.data ? false : 10_000) } });
  const deployed = Boolean(code.data && code.data !== "0x");

  const state = useReadContracts({
    contracts: [
      { ...on, address: account ?? zeroAddress, abi: cruxAccountAbi, functionName: "withdrawalAddress" },
      { ...on, address: account ?? zeroAddress, abi: cruxAccountAbi, functionName: "pendingWithdrawalAddress" },
      { ...on, address: account ?? zeroAddress, abi: cruxAccountAbi, functionName: "withdrawalChangeEta" },
    ],
    query: { enabled: deployed, refetchInterval: 15_000 },
  });
  const usdc = useReadContract({
    ...on,
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account ?? zeroAddress],
    query: { enabled: account !== null, refetchInterval: 10_000 },
  });

  const nonZero = (a: unknown) => (typeof a === "string" && a !== zeroAddress ? getAddress(a) : null);
  const eta = state.data?.[2]?.result;

  const sign = useMemo<AccountSigner | null>(() => {
    if (!owner) return null;
    return async (t) => {
      // Privy takes eth_signTypedData_v4 JSON: numbers as decimal strings, the domain type spelled out.
      const message = plain(t.message);
      const { signature } = await signTypedData(
        { domain: t.domain, types: { EIP712Domain: EIP712_DOMAIN, ...t.types }, primaryType: t.primaryType, message } as never,
        { uiOptions: { showWalletUIs: false }, address: owner },
      );
      return signature as Hex;
    };
  }, [owner, signTypedData]);

  const refresh = useCallback(() => {
    void code.refetch();
    void state.refetch();
    void usdc.refetch();
  }, [code, state, usdc]);

  const label = user?.email?.address ?? (user?.google?.email ? user.google.email : null);

  return {
    ready,
    loggedIn: authenticated,
    label,
    login,
    logout,
    owner,
    account,
    deployed,
    // A V3 account is born bound: its withdrawal wallet is known before it's deployed.
    withdrawalAddress: deployed ? nonZero(state.data?.[0]?.result) : v3Live && v3 ? v3.withdrawalAddress : null,
    pendingWithdrawalAddress: deployed ? nonZero(state.data?.[1]?.result) : null,
    withdrawalChangeEta: deployed && eta ? Number(eta) || null : null,
    usdc: usdc.data ?? null,
    v2: v3Live ? mine !== null : v2Live && v2 !== null,
    v3: v3Live ? v3 : null,
    setup: {
      needed: authenticated && owner !== null && v3Live && v3 === null,
      // The wallet the older accounts withdraw to: the same one keeps things simple.
      suggested: older.map((_, i) => nonZero(legacyReads.data?.[i * 2 + 1]?.result)).find((x) => x !== null) ?? null,
      create: createV3,
    },
    legacy: older.map((o, i) => ({
      ...o,
      usdc: (legacyReads.data?.[i * 2]?.result as bigint | undefined) ?? null,
      withdrawalAddress: nonZero(legacyReads.data?.[i * 2 + 1]?.result),
    })),
    launchAccount: v3Live ? mine : v1,
    sign,
    refresh,
  };
}
