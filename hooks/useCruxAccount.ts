"use client";

import { useCallback, useMemo } from "react";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { erc20Abi, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { useBytecode, useReadContract, useReadContracts } from "wagmi";
import { ACCOUNT_FACTORY, accountFactoryAbi, cruxAccountAbi, type AccountSigner } from "@/lib/account";
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
  /** The CruxAccount address: the deposit address, valid before the account is deployed. */
  account: Address | null;
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
  const account = owner && accountOf.data ? getAddress(accountOf.data) : null;
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
    withdrawalAddress: deployed ? nonZero(state.data?.[0]?.result) : null,
    pendingWithdrawalAddress: deployed ? nonZero(state.data?.[1]?.result) : null,
    withdrawalChangeEta: deployed && eta ? Number(eta) || null : null,
    usdc: usdc.data ?? null,
    sign,
    refresh,
  };
}
