"use client";

import { useMemo, useState, type ReactNode } from "react";
import { erc20Abi, formatUnits, getAddress, isAddress, parseUnits, zeroAddress, type Address } from "viem";
import { useConfig, useConnection, useReadContract, useReadContracts, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonClass } from "@/components/ui/Button";
import { Shell } from "@/components/launch/LaunchView";
import { CrossChainDeposit } from "@/components/account/CrossChainDeposit";
import { useNow } from "@/hooks/useLaunchAuction";
import { useAllLaunches } from "@/hooks/useLaunches";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import {
  WITHDRAWAL_CHANGE_DELAY,
  cancelWithdrawalChange,
  cruxAccountAbi,
  finalizeWithdrawalChange,
  setWithdrawalAddress,
  withdrawFromAccount,
} from "@/lib/account";
import { TESTNET, TESTNET_EXPLORER } from "@/lib/chains";
import { FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7, TESTNET_USDC } from "@/lib/intents";
import { fmtTokens, fmtUsdc, formatRemaining } from "@/lib/launch";
import { simulateThenWrite } from "@/lib/preflight";
import { useConnectModal } from "@/providers/Web3Provider";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-dim">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

type Busy = null | "bind" | "change" | "cancel" | "finalize" | "withdraw" | "sweep" | "deposit";

/** The logged-in trader's Crux account: deposit address, protection, withdrawal address and withdrawals. */
export function AccountPanel() {
  const a = useCruxAccount();
  const config = useConfig();
  const { address: wallet, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { openConnect } = useConnectModal();
  const now = useNow();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [changing, setChanging] = useState(false);
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  // The connected wallet's test USDC, for depositing straight from it (no token import in the wallet needed).
  const walletUsdc = useReadContract({
    chainId: TESTNET.id,
    address: TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet ?? zeroAddress],
    query: { enabled: Boolean(wallet), refetchInterval: 15_000 },
  });

  // Launch tokens the account holds: shown, and swept along with USDC.
  const { launches } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7);
  const tokens = useMemo(() => launches.filter((l) => l.v2 && l.v2.status === 1), [launches]);
  const balances = useReadContracts({
    contracts: tokens.map((l) => ({ chainId: TESTNET.id, address: l.v2!.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [a.account ?? zeroAddress] as const })),
    query: { enabled: a.account !== null && tokens.length > 0, refetchInterval: 15_000 },
  });
  const held = tokens.flatMap((l, i) => {
    const b = balances.data?.[i]?.result;
    return typeof b === "bigint" && b > BigInt(0) ? [{ launch: l, balance: b }] : [];
  });

  const run = async (kind: Busy, fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      a.refresh();
      void balances.refetch();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  };

  if (!a.ready) return <Frame><p className="text-[13px] text-dim">Loading…</p></Frame>;

  if (!a.loggedIn) {
    return (
      <Frame>
        <div className="rounded-xl border border-line px-6 py-12 text-center">
          <p className="mx-auto max-w-[520px] text-[14px] leading-relaxed text-muted">
            Log in with email or Google to get a Crux account: a deposit address for test USDC that trades in one click, with no wallet
            pop-ups and no gas. Its funds can only trade through Crux or go back to a wallet you choose.
          </p>
          <button type="button" onClick={a.login} className={buttonClass("signal", "md", "mt-6 font-semibold")}>
            Log in with email or Google
          </button>
        </div>
      </Frame>
    );
  }

  if (!a.owner || !a.account || !a.sign) {
    return <Frame><p className="text-[13px] text-dim">Setting up your login key…</p></Frame>;
  }

  const owner = a.owner;
  const account = a.account;
  const sign = a.sign;
  const bound = a.withdrawalAddress;
  const pending = a.pendingWithdrawalAddress;
  const eta = a.withdrawalChangeEta;
  const target = isAddress(to.trim(), { strict: false }) ? getAddress(to.trim()) : null;
  const invalidTarget = to.trim() !== "" && (!target || target === account || target === owner);
  const units = (() => {
    try {
      const v = amount ? parseUnits(amount, 6) : null;
      return v !== null && v > BigInt(0) ? v : null;
    } catch {
      return null;
    }
  })();
  const overBalance = units !== null && a.usdc !== null && units > a.usdc;
  const isBoundWallet = Boolean(wallet && bound && getAddress(wallet) === bound);
  const depositUnits = (() => {
    try {
      const v = depositAmount ? parseUnits(depositAmount, 6) : null;
      return v !== null && v > BigInt(0) ? v : null;
    } catch {
      return null;
    }
  })();
  const overWallet = depositUnits !== null && walletUsdc.data !== undefined && depositUnits > walletUsdc.data;

  /** One ordinary USDC transfer from the connected wallet to the account (the wallet asks to confirm it). */
  const deposit = () =>
    run(
      "deposit",
      async () => {
        if (chainId !== TESTNET.id) await switchChain({ chainId: TESTNET.id });
        const hash = await simulateThenWrite(config, wallet!, {
          address: TESTNET_USDC,
          abi: erc20Abi,
          functionName: "transfer",
          args: [account, depositUnits!],
          chainId: TESTNET.id,
        });
        await waitForTransactionReceipt(config, { hash, chainId: TESTNET.id });
        setDepositAmount("");
        void walletUsdc.refetch();
      },
      `Deposited $${fmtUsdc(depositUnits ?? BigInt(0))} test USDC from your wallet.`,
    );

  const sweep = () =>
    run(
      "sweep",
      async () => {
        const list = [TESTNET_USDC, ...held.map((h) => h.launch.v2!.token)];
        await simulateThenWrite(config, wallet!, { address: account, abi: cruxAccountAbi, functionName: "emergencySweep", args: [list], chainId: TESTNET.id });
      },
      "Swept: everything in the account went to your bound wallet, and any pending change is cancelled.",
    );

  return (
    <Frame label={a.label} onLogout={() => void a.logout()}>
      <div className="flex flex-wrap items-center gap-2">
        {bound ? (
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-up/40 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-up">
            <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
            Protected · withdrawals only to {short(bound)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-down/60 bg-down/[0.06] px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-down">
            <span className="h-1.5 w-1.5 rounded-full bg-down" aria-hidden="true" />
            Not protected yet: bind a withdrawal address
          </span>
        )}
        {pending && (
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-signal/60 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-signal">
            Change pending → {short(pending)}
          </span>
        )}
      </div>

      {(error || notice) && (
        <p role="status" className={`rounded-lg border px-4 py-3 text-[13px] ${error ? "border-down/50 text-down" : "border-up/40 text-up"}`}>
          {error ?? notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Deposit" aside={<span className="font-mono text-[13px] text-chrome">{a.usdc !== null ? `$${fmtUsdc(a.usdc)}` : "…"} test USDC</span>}>
          <p className="text-[12px] text-dim">Your Crux account address</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-void/60 px-3 py-2.5 font-mono text-[12.5px] text-chrome">{account}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(account).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className={buttonClass("outline", "sm", "shrink-0")}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-signal/50 bg-signal/[0.05] px-4 py-3">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-signal">Base network only</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Send test USDC to this address on <span className="text-chrome">Base Sepolia</span> only. The address is the same on every chain,
              but only Base Sepolia trades: anything sent straight to it on another chain can only be withdrawn back to your bound address, once
              the account is set up there. To move USDC from Arbitrum, Ethereum or BSC, use <span className="text-chrome">Deposit from another
              chain</span> below instead.
            </p>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[12px] text-dim">Deposit from your wallet</p>
            {wallet ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2 focus-within:border-line-2">
                    <span className="font-mono text-dim">$</span>
                    <label htmlFor="deposit-amount" className="sr-only">Test USDC to deposit</label>
                    <input
                      id="deposit-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full min-w-0 bg-transparent font-mono text-[15px] text-chrome outline-none placeholder:text-dim"
                    />
                  </div>
                  <button type="button" disabled={!depositUnits || overWallet || busy !== null} onClick={deposit} className={buttonClass("signal", "sm", "shrink-0 font-semibold")}>
                    {busy === "deposit" ? "Depositing…" : "Deposit"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-dim">
                  {overWallet ? "More than your wallet holds. " : ""}From {short(wallet)} on Base Sepolia
                  {walletUsdc.data !== undefined ? ` · wallet has $${fmtUsdc(walletUsdc.data)}` : ""}. Your wallet asks you to confirm one transfer.
                </p>
                <CrossChainDeposit account={account} onOpened={a.refresh} />
              </>
            ) : (
              <button type="button" onClick={openConnect} className={buttonClass("outline", "sm", "mt-2")}>
                Connect a wallet to deposit from it
              </button>
            )}
          </div>
          {!a.deployed && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-dim">
              The account contract is deployed for you, free, with your first trade or when you bind a withdrawal address. Deposits sent
              before then are already yours.
            </p>
          )}
          <a href={`${TESTNET_EXPLORER}/address/${account}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[11.5px] text-dim underline decoration-line-2 hover:text-chrome">
            View on Basescan
          </a>
        </Card>

        <Card title="Withdrawal address">
          {!bound ? (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Withdrawals can only ever go here: bind a wallet you control. The first binding is instant; changing it later takes 48
                hours, and this wallet can cancel the change.
              </p>
              <AddressField value={to} onChange={setTo} invalid={invalidTarget} wallet={wallet} onConnect={openConnect} />
              <button
                type="button"
                disabled={!target || invalidTarget || busy !== null}
                onClick={() => run("bind", () => setWithdrawalAddress(sign, owner, account, target!), `Bound: withdrawals now go only to ${short(target!)}.`)}
                className={buttonClass("signal", "md", "mt-3 w-full font-semibold")}
              >
                {busy === "bind" ? "Binding…" : "Bind withdrawal address"}
              </button>
            </>
          ) : (
            <>
              <code className="block break-all rounded-lg border border-line bg-void/60 px-3 py-2.5 font-mono text-[12.5px] text-chrome">{bound}</code>
              {pending ? (
                <div className="mt-4 rounded-lg border border-signal/50 px-4 py-3">
                  <p className="text-[12.5px] text-chrome">
                    Change requested to <span className="font-mono">{short(pending)}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {eta !== null && (now === null || eta > now) ? (now === null ? "Takes effect 48 hours after the request." : `Takes effect in ${formatRemaining(eta - now)}.`) : "The 48 hours have passed: finalize it to apply."} Didn&apos;t
                    request this? Cancel it now, or sweep everything to {short(bound)} from that wallet.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => run("cancel", () => cancelWithdrawalChange(sign, owner, account), "Change cancelled.")} className={buttonClass("outline", "sm")}>
                      {busy === "cancel" ? "Cancelling…" : "Cancel change"}
                    </button>
                    {eta !== null && now !== null && eta <= now && (
                      <button type="button" disabled={busy !== null} onClick={() => run("finalize", () => finalizeWithdrawalChange(owner), `Withdrawals now go only to ${short(pending)}.`)} className={buttonClass("signal", "sm")}>
                        {busy === "finalize" ? "Applying…" : "Finalize change"}
                      </button>
                    )}
                  </div>
                </div>
              ) : changing ? (
                <>
                  <p className="mt-4 text-[12.5px] text-muted">The new address takes over after {WITHDRAWAL_CHANGE_DELAY / 3600} hours. Until then withdrawals still go to the current one.</p>
                  <AddressField value={to} onChange={setTo} invalid={invalidTarget || target === bound} wallet={wallet} onConnect={openConnect} />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!target || invalidTarget || target === bound || busy !== null}
                      onClick={() =>
                        run(
                          "change",
                          async () => {
                            await setWithdrawalAddress(sign, owner, account, target!);
                            setChanging(false);
                            setTo("");
                          },
                          `Change requested: ${short(target!)} takes over in 48 hours.`,
                        )
                      }
                      className={buttonClass("signal", "sm", "font-semibold")}
                    >
                      {busy === "change" ? "Requesting…" : "Request change"}
                    </button>
                    <button type="button" onClick={() => setChanging(false)} className={buttonClass("ghost", "sm")}>
                      Keep current
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setChanging(true)} className={buttonClass("outline", "sm", "mt-3")}>
                  Change address (48-hour wait)
                </button>
              )}
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[12px] leading-relaxed text-dim">
                  Emergency exit: connected as {short(bound)}, you can cancel any pending change and pull everything out of the account to that
                  wallet in one transaction (you pay its gas).
                </p>
                {isBoundWallet ? (
                  <button type="button" disabled={busy !== null} onClick={sweep} className={buttonClass("outline", "sm", "mt-3 border-down/60 text-down hover:border-down")}>
                    {busy === "sweep" ? "Sweeping…" : "Sweep everything to this wallet"}
                  </button>
                ) : (
                  <button type="button" onClick={openConnect} className={buttonClass("ghost", "sm", "mt-2 px-0")}>
                    Connect {short(bound)} to use it
                  </button>
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="Withdraw">
          <p className="text-[12.5px] text-muted">{bound ? <>Test USDC to <span className="font-mono text-chrome">{short(bound)}</span>, the only place it can go. Free: Crux pays the gas.</> : "Bind a withdrawal address first."}</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-void/60 px-3 py-2.5 focus-within:border-line-2">
            <span className="font-mono text-dim">$</span>
            <label htmlFor="withdraw-amount" className="sr-only">USDC to withdraw</label>
            <input
              id="withdraw-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full min-w-0 bg-transparent font-mono text-[18px] text-chrome outline-none placeholder:text-dim"
            />
            <button type="button" disabled={!a.usdc} onClick={() => a.usdc && setAmount(formatUnits(a.usdc, 6))} className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted hover:text-chrome disabled:opacity-40">
              Max
            </button>
          </div>
          <button
            type="button"
            disabled={!bound || !units || overBalance || busy !== null}
            onClick={() => run("withdraw", async () => {
              await withdrawFromAccount(sign, owner, account, TESTNET_USDC, units!);
              setAmount("");
            }, `Withdrew $${fmtUsdc(units!)} to ${short(bound!)}.`)}
            className={buttonClass("signal", "md", "mt-3 w-full font-semibold")}
          >
            {busy === "withdraw" ? "Withdrawing…" : overBalance ? "More than the account holds" : "Withdraw"}
          </button>
        </Card>

        <Card title="Holdings">
          {held.length === 0 ? (
            <p className="text-[12.5px] text-dim">No launch tokens in this account yet. Buy from any token page while logged in.</p>
          ) : (
            <ul className="divide-y divide-line">
              {held.map((h) => (
                <li key={h.launch.href} className="flex items-center justify-between gap-3 py-2">
                  <a href={h.launch.href} className="text-[13px] text-chrome hover:text-signal">
                    ${h.launch.symbol ?? "TOKEN"}
                  </a>
                  <span className="font-mono text-[12.5px] text-muted">{fmtTokens(h.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-[11.5px] leading-relaxed text-dim">
        How it&apos;s protected: your login key signs every trade and withdrawal, and Crux&apos;s relay submits them. The account contract only lets
        funds trade through the Crux settler, with every fill and refund paid back to the account, or go to your bound address. Someone who stole
        your login could trade but never take funds out: changing the withdrawal address waits 48 hours, which you can cancel. Testnet only.
      </p>
    </Frame>
  );
}

function AddressField({ value, onChange, invalid, wallet, onConnect }: { value: string; onChange: (v: string) => void; invalid: boolean; wallet: Address | undefined; onConnect: () => void }) {
  return (
    <div className="mt-3">
      <label htmlFor="withdrawal-address" className="sr-only">Withdrawal address</label>
      <input
        id="withdrawal-address"
        autoComplete="off"
        spellCheck={false}
        placeholder="0x… a wallet you control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-void/60 px-3 py-2.5 font-mono text-[12.5px] text-chrome outline-none placeholder:font-sans placeholder:text-dim ${invalid ? "border-down/60" : "border-line focus:border-line-2"}`}
      />
      <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
        <span className="text-down">{invalid ? "Use a wallet address you control (not the account or its login key)." : ""}</span>
        {wallet ? (
          <button type="button" onClick={() => onChange(wallet)} className="text-muted hover:text-chrome">
            Use connected wallet {`${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
          </button>
        ) : (
          <button type="button" onClick={onConnect} className="text-muted hover:text-chrome">
            Connect a wallet to fill it in
          </button>
        )}
      </div>
    </div>
  );
}

function Frame({ children, label, onLogout }: { children: ReactNode; label?: string | null; onLogout?: () => void }) {
  return (
    <Shell mode="live">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Crux account · Base Sepolia testnet</p>
            <h1 className="mt-2 font-display-md text-[30px] text-chrome">Your Crux account</h1>
          </div>
          {onLogout && (
            <div className="flex items-center gap-3 text-[12px] text-muted">
              {label && <span className="font-mono">{label}</span>}
              <button type="button" onClick={onLogout} className={buttonClass("ghost", "sm")}>
                Log out
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
    </Shell>
  );
}
