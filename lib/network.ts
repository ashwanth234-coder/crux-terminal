// The network the site runs on, in one place: NEXT_PUBLIC_NETWORK=base-sepolia (the default) or base-mainnet. Every
// Base chain id, token, Uniswap and Crux contract address the site uses comes from here; the NEXT_PUBLIC_CRUX_* env vars
// still override single addresses, as before. Mirrors crux-solver scripts/network.ts.
//
// Base mainnet: the Crux contracts aren't deployed there yet, so their entries are empty, and a build with
// NEXT_PUBLIC_NETWORK=base-mainnet stops at the first one the site needs (need()), naming it, instead of quietly using
// a Base Sepolia address.
import { getAddress, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";

export type NetworkName = "base-sepolia" | "base-mainnet";

export type Network = {
  name: NetworkName;
  chain: typeof base | typeof baseSepolia;
  /** As people read it: "Base Sepolia", "Base". */
  label: string;
  explorer: string;
  testnet: boolean;
  usdc: Address;
  permit2: Address;
  weth: Address;
  uniswap: { v2Factory: Address; v2Router: Address; v3Factory: Address; v3Router: Address; v3Quoter: Address };
  crux: {
    settlerV3?: Address;
    settlerV4?: Address;
    destinationV2?: Address;
    /** CruxDestinationSettler (v1): where v1 and v2 settlers' orders were filled. */
    legacyDestination?: Address;
    factoryV4?: Address;
    factoryV5?: Address;
    factoryV6?: Address;
    factoryV7?: Address;
    factoryV8?: Address;
    factoryV9?: Address;
    routerV9?: Address;
    accountFactory?: Address;
    accountFactoryV2?: Address;
    accountFactoryV3?: Address;
    solver?: Address;
    /** Solver wallets Crux used before a key rotation. */
    retiredSolvers: Address[];
  };
  /** Curated markets' extra tokens (LINK is a Base Sepolia test token). */
  tokens: { link?: Address };
};

const a = (s: string) => getAddress(s);

const BASE_SEPOLIA: Network = {
  name: "base-sepolia",
  chain: baseSepolia,
  label: "Base Sepolia",
  explorer: "https://sepolia.basescan.org",
  testnet: true,
  usdc: a("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  permit2: a("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  weth: a("0x4200000000000000000000000000000000000006"),
  uniswap: {
    v2Factory: a("0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e"),
    v2Router: a("0x1689E7B1F10000AE47eBfE339a4f69dECd19F602"),
    v3Factory: a("0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
    v3Router: a("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"),
    v3Quoter: a("0xC5290058841028F1614F3A6F0F5816cAd0df5E27"),
  },
  crux: {
    settlerV3: a("0xC3BE6a2F3D82DdAba03Fb965bd08f5113354f44C"),
    settlerV4: a("0x399147a5960A120A3b8b89A33a30500a561145D9"),
    destinationV2: a("0x62e5ed6BC2f604fad76152045559805c11D1cdf4"),
    legacyDestination: a("0x300a835939D2beBed59C543470DCD9a9c8065822"),
    factoryV4: a("0x91f65efc87792798dfba69ee191fb4e3a8500d91"),
    factoryV5: a("0x87E39E29a8659DB2891358Ba56aA3BE899c130D9"),
    factoryV6: a("0xD07fBb34076D88d2391E831aABfd40AcA3F57940"),
    factoryV7: a("0xeacB98371D5597c20A9ECDf6f09726817489722e"),
    factoryV8: a("0xdB9f226fb44D5E8d25e2aACA4f7080c83011CfB5"),
    factoryV9: a("0x4a28e8B20e312fB67c71Fa6e2F085520d3DEd8e7"),
    routerV9: a("0x86A518410EFfa9cAEbf92BD87DEe08678bA39682"),
    accountFactory: a("0xDdB0DF1CfcdEd073A72A489351f22cfF646f8C6E"),
    accountFactoryV2: a("0xf8962965f04e20B95dAdD931fDe00121906a97DC"),
    accountFactoryV3: a("0xBD7AF76bcc2D080364a0c3C138ef82efCF8E12DF"),
    solver: a("0xDEbbE137f2AB252e28d1070F687010C0909d0492"),
    retiredSolvers: [a("0x69E422d3Cca945a44210684b57F85f556212AD67")],
  },
  tokens: { link: a("0xE4aB69C077896252FAFBD49EFD26B5D171A32410") },
};

/**
 * Base mainnet. Token, Permit2 and Uniswap addresses are the canonical ones; check each against the issuer's docs
 * before the switch. The Crux contracts are empty until they're deployed (set them here, or by NEXT_PUBLIC_CRUX_*).
 */
const BASE_MAINNET: Network = {
  name: "base-mainnet",
  chain: base,
  label: "Base",
  explorer: "https://basescan.org",
  testnet: false,
  usdc: a("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  permit2: a("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  weth: a("0x4200000000000000000000000000000000000006"),
  uniswap: {
    v2Factory: a("0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"),
    v2Router: a("0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
    v3Factory: a("0x33128a8fC17869897dcE68Ed026d694621f6FDfD"),
    v3Router: a("0x2626664c2603336E57B271c5C0b26F421741e481"),
    v3Quoter: a("0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"),
  },
  crux: { retiredSolvers: [] },
  tokens: {},
};

export const NETWORKS: Record<NetworkName, Network> = { "base-sepolia": BASE_SEPOLIA, "base-mainnet": BASE_MAINNET };

/** The network for NEXT_PUBLIC_NETWORK's value (base-sepolia when unset); anything else is refused. */
export function networkFrom(value: string | undefined): Network {
  const name = (value?.trim() || "base-sepolia").toLowerCase();
  if (name === "base-sepolia" || name === "base-mainnet") return NETWORKS[name];
  throw new Error(`NEXT_PUBLIC_NETWORK must be base-sepolia or base-mainnet, not "${value}"`);
}

/** The network this build runs on (written out literally so Next.js inlines it). */
export const NETWORK = networkFrom(process.env.NEXT_PUBLIC_NETWORK);

/**
 * `value` (an env override or this network's address); throws naming `what` when this network has none: a Crux
 * contract not deployed there yet.
 */
export function need(what: string, value: Address | null | undefined, network: Network = NETWORK): Address {
  if (!value) throw new Error(`${what} isn't deployed on ${network.label} yet: add it to lib/network.ts or set its NEXT_PUBLIC_CRUX_* variable`);
  return value;
}

/** CAIP-19 id of an ERC-20 on this network: "eip155:<chain>/erc20:<checksummed token>". */
export const caip19 = (token: Address, network: Network = NETWORK) => `eip155:${network.chain.id}/erc20:${getAddress(token)}`;
