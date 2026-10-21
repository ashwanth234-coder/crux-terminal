import { encodeAbiParameters, getAddress, isAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { TESTNET } from "./chains";

// Only used as the EIP-712 verifyingContract for local signature checks while
// nothing is deployed; never sent to a chain.
const PLACEHOLDER_SETTLER = "0x0000000000000000000000000000000000c7c500";

function envAddress(value: string | undefined): Address | null {
  return value && isAddress(value) ? (value as Address) : null;
}

const configuredSettler = envAddress(process.env.NEXT_PUBLIC_CRUX_SETTLER);

/** ERC-7683 origin settler on Base Sepolia, once deployed (NEXT_PUBLIC_CRUX_SETTLER). */
export const SETTLER = (configuredSettler ?? PLACEHOLDER_SETTLER) as Address;
export const SETTLER_DEPLOYED = configuredSettler !== null;

/** Block the settler was deployed in (crux-contracts/broadcast/Deploy.s.sol/84532/run-latest.json); log scans start here. */
export const SETTLER_DEPLOY_BLOCK = BigInt(48311115);

/** CruxSettler.REFUND_GRACE: refunds open this long after an order's fillDeadline. */
export const REFUND_GRACE_SECONDS = 3600;

/** Launch + batch-auction factory on Base Sepolia, once deployed (NEXT_PUBLIC_CRUX_FACTORY). */
export const FACTORY = envAddress(process.env.NEXT_PUBLIC_CRUX_FACTORY);

/** CruxFactoryV2 on Base Sepolia (NEXT_PUBLIC_CRUX_FACTORY_V2). */
export const FACTORY_V2 = envAddress(process.env.NEXT_PUBLIC_CRUX_FACTORY_V2);

/** CruxFactoryV3 (price ticks, no bidder limit) on Base Sepolia, once deployed (NEXT_PUBLIC_CRUX_FACTORY_V3). */
export const FACTORY_V3 = envAddress(process.env.NEXT_PUBLIC_CRUX_FACTORY_V3);

/** The Crux solver's wallet: fills intents (and swaps in launch pools to do it). NEXT_PUBLIC_CRUX_SOLVER overrides. */
export const CRUX_SOLVER: Address = envAddress(process.env.NEXT_PUBLIC_CRUX_SOLVER) ?? "0x69E422d3Cca945a44210684b57F85f556212AD67";

/** Where new launches go: the newest batch factory configured. */
export const LAUNCH_FACTORY: { address: Address; version: 2 | 3 } | null = FACTORY_V3
  ? { address: FACTORY_V3, version: 3 }
  : FACTORY_V2
    ? { address: FACTORY_V2, version: 2 }
    : null;

/** Circle USDC on Base Sepolia: what the testnet settler escrows. */
export const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;

/**
 * CAIP-19 inputs the testnet settler can escrow (mirrors crux-contracts/script/Deploy.s.sol).
 * The terminal quotes in Base USDC, which maps to Sepolia USDC on testnet.
 */
export const TESTNET_ESCROW_ASSETS: ReadonlySet<string> = new Set([
  "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532/erc20:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
]);

/**
 * MockNOVA on Base Sepolia (crux-contracts/script/DeployNova.s.sol), once deployed
 * (NEXT_PUBLIC_CRUX_TEST_NOVA). Testnet buys ask for it so the solver can fill them.
 * Checksummed, because the asset id is keccak256 of this exact string.
 */
const testNova = envAddress(process.env.NEXT_PUBLIC_CRUX_TEST_NOVA);
export const TESTNET_NOVA_CAIP19 = testNova ? `eip155:84532/erc20:${getAddress(testNova)}` : null;

export const BATCH_WINDOW_SECONDS = 60;
export const SLIPPAGE_BPS = 50;

const ORDER_DATA_TYPESTRING =
  "CruxBatchOrder(bytes32 inputAsset,uint256 inputAmount,bytes32 outputAsset,uint256 minOutputAmount,uint256 destinationChainId,uint32 batchWindow)";

/** keccak256 of the order-data type string, per ERC-7683's `orderDataType`. */
export const ORDER_DATA_TYPE = keccak256(toHex(ORDER_DATA_TYPESTRING));

/**
 * Assets are referenced by keccak256(CAIP-19 id) so EVM and SVM assets fit the
 * same bytes32 field.
 */
export function assetId(caip19: string): Hex {
  return keccak256(toHex(caip19));
}

/**
 * The settler's EIP-712 domain, pinned: CruxSettler's constructor runs OpenZeppelin `EIP712("CruxSettler", "1")`,
 * so a signature only verifies for this name, version, chain and contract. Intents are always signed for this
 * exact domain, whatever chain the wallet happens to be on; lib/settlerDomain.ts checks it against the
 * deployed contract's own `eip712Domain()` before any signature is requested.
 */
export const SETTLER_DOMAIN = {
  name: "CruxSettler",
  version: "1",
  chainId: TESTNET.id,
  verifyingContract: SETTLER,
} as const;

/**
 * Unique per order and increasing over time: milliseconds since epoch × 10⁶ plus a random tail, so two orders
 * signed in the same millisecond still differ. The settler rejects any nonce it has seen for this user.
 */
export function orderNonce() {
  const tail = Math.floor(Math.random() * 1_000_000);
  return BigInt(Date.now()) * BigInt(1_000_000) + BigInt(tail);
}

/** EIP-712 types for ERC-7683 `GaslessCrossChainOrder`. */
export const GASLESS_ORDER_TYPES = {
  GaslessCrossChainOrder: [
    { name: "originSettler", type: "address" },
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "originChainId", type: "uint256" },
    { name: "openDeadline", type: "uint32" },
    { name: "fillDeadline", type: "uint32" },
    { name: "orderDataType", type: "bytes32" },
    { name: "orderData", type: "bytes" },
  ],
} as const;

export type IntentDraft = {
  user: Address;
  /** Chain the wallet is on; the EIP-712 domain must match it. */
  chainId: number;
  inputCaip19: string;
  inputAmount: bigint;
  outputCaip19: string;
  minOutputAmount: bigint;
  destinationChainId: number;
};

export function buildGaslessOrder(draft: IntentDraft) {
  // With a live settler the domain is pinned; signing it from another chain would give a signature the settler rejects.
  if (SETTLER_DEPLOYED && draft.chainId !== SETTLER_DOMAIN.chainId) {
    throw new Error(`Switch your wallet to Base Sepolia (chain ${SETTLER_DOMAIN.chainId}) to sign this intent.`);
  }
  const domain = SETTLER_DEPLOYED ? SETTLER_DOMAIN : { ...SETTLER_DOMAIN, chainId: draft.chainId };
  const now = Math.floor(Date.now() / 1000);
  const orderData = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint32" },
    ],
    [
      assetId(draft.inputCaip19),
      draft.inputAmount,
      assetId(draft.outputCaip19),
      draft.minOutputAmount,
      BigInt(draft.destinationChainId),
      BATCH_WINDOW_SECONDS,
    ],
  );

  return {
    domain,
    types: GASLESS_ORDER_TYPES,
    primaryType: "GaslessCrossChainOrder" as const,
    message: {
      originSettler: SETTLER,
      user: draft.user,
      nonce: orderNonce(),
      originChainId: BigInt(domain.chainId),
      // Intent must be opened inside the current batch window and filled within 10 minutes.
      openDeadline: now + BATCH_WINDOW_SECONDS,
      fillDeadline: now + 600,
      orderDataType: ORDER_DATA_TYPE,
      orderData,
    },
  };
}
