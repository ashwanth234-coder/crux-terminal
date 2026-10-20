import { StatusTag, type Status } from "@/components/ui/StatusTag";
import { V2_FEE } from "@/lib/launchV2";
import { Chapter } from "./Chapter";

const FLOWS: { name: string; status: Status; body: string }[] = [
  {
    name: "Launch fees",
    status: "testnet",
    body: `${V2_FEE.feeBps / 100}% of every graduated raise, paid at settlement: ${V2_FEE.creatorShareBps / 100}% to the creator, ${100 - V2_FEE.creatorShareBps / 100}% to the treasury. Enforced by CruxFactoryV2 and V3 on Base Sepolia.`,
  },
  {
    name: "Spot fees",
    status: "planned",
    body: "A protocol share of trading on the home-chain pool. Today the pool's 0.3% Uniswap fee stays in the locked pool, and the solver's spread goes to the solver.",
  },
  {
    name: "Derivatives",
    status: "planned",
    body: "Perpetual markets on Hyperliquid HIP-3 for tokens that clear depth, volume and volatility gates, with a share of deployer revenue.",
  },
  {
    name: "Buybacks",
    status: "planned",
    body: "Net protocol revenue used for open-market buybacks of $CRUX.",
  },
];

/** 05 Token economics: what earns today, and what is only designed. */
export function Economics() {
  return (
    <Chapter
      id="token"
      index="05"
      name="Token economics"
      title={
        <>
          Value moves
          <br />
          through the system.
        </>
      }
      intro={
        <>
          Fees start at the launch and are meant to flow through trading and derivatives into buybacks. Only the launch fee exists today.{" "}
          <span className="text-chrome">$CRUX has not been issued.</span>
        </>
      }
    >
      <ol className="border-t border-line">
        {FLOWS.map((f, i) => (
          <li key={f.name} className="grid gap-3 border-b border-line py-7 md:grid-cols-12 md:items-baseline md:gap-10">
            <p className="font-mono text-[11px] tracking-[0.18em] text-dim md:col-span-1">0{i + 1}</p>
            <h3 className="font-display-md text-[26px] text-chrome md:col-span-3">{f.name}</h3>
            <p className="max-w-xl text-[13.5px] leading-relaxed text-muted md:col-span-6">{f.body}</p>
            <div className="md:col-span-2 md:text-right">
              <StatusTag status={f.status} />
            </div>
          </li>
        ))}
      </ol>
    </Chapter>
  );
}
