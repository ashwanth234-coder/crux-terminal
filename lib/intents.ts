import { encodeAbiParameters, getAddress, isAddress, keccak256, toHex, type Address, type Hex, type TypedDataDefinition } from "viem";
import { baseSepolia } from "viem/chains";

// Only used as the EIP-712 verifyingContract for local signature checks while
// nothing is deployed; never sent to a chain.
const PLACEHOLDER_SETTLER = "0x0000000000000000000000000000000000c7c500";

function envAddress(value: string | undefined): Address | null {
  return value && isAddress(value) ? (value as Address) : null;
}

/**
 * CruxSettlerV3 and its destination (CruxDestinationSettlerV2) on Base Sepolia, deployed 2026-10-22 and verified
 * (Basescan + Sourcify exact match). Both are needed:
 * v3 settles only on its own destination's fill record. NEXT_PUBLIC_CRUX_SETTLER_V3 and
 * NEXT_PUBLIC_CRUX_DESTINATION_V2 override them (e.g. on a local fork).
 */
const SETTLER_V3_ADDRESS: Address | null = "0xC3BE6a2F3D82DdAba03Fb965bd08f5113354f44C";
const DESTINATION_V2_ADDRESS: Address | null = "0x62e5ed6BC2f604fad76152045559805c11D1cdf4";
/** CruxDestinationSettler (v1): where v1 and v2 settlers' orders are filled. */
const LEGACY_DESTINATION = "0x300a835939D2beBed59C543470DCD9a9c8065822" as Address;

const settlerV1 = envAddress(process.env.NEXT_PUBLIC_CRUX_SETTLER);
const settlerV2 = envAddress(process.env.NEXT_PUBLIC_CRUX_SETTLER_V2);
const settlerV3 = envAddress(process.env.NEXT_PUBLIC_CRUX_SETTLER_V3) ?? SETTLER_V3_ADDRESS;
const destinationV2 = envAddress(process.env.NEXT_PUBLIC_CRUX_DESTINATION_V2) ?? DESTINATION_V2_ADDRESS;
const v3Ready = settlerV3 !== null && destinationV2 !== null;
const configuredSettler = v3Ready ? settlerV3 : (settlerV2 ?? settlerV1);

/**
 * ERC-7683 origin settler on Base Sepolia: the newest one configured.
 * - v3: trustless same-chain settlement (paid only on the destination's record of the exact fill), refunds
 *   as soon as the fill deadline passes.
 * - v2: readable signed orders, EIP-7702 accounts' own keys accepted.
 * - v1: the original settler.
 */
export const SETTLER = (configuredSettler ?? PLACEHOLDER_SETTLER) as Address;
export const SETTLER_DEPLOYED = configuredSettler !== null;
export const SETTLER_VERSION: 1 | 2 | 3 = v3Ready ? 3 : settlerV2 ? 2 : 1;

/** Where the active settler's orders are filled (and where the terminal reads OrderFilled). */
export const DESTINATION_SETTLER: Address = v3Ready ? destinationV2! : LEGACY_DESTINATION;

/** CruxDestinationSettlerV2 keys fills by the exact order details, so its OrderFilled carries that hash. */
export const ORDER_FILLED_EVENT =
  SETTLER_VERSION === 3
    ? "event OrderFilled(bytes32 indexed orderId, bytes32 indexed fillHash, address indexed filler, address recipient, address token, uint256 amount)"
    : "event OrderFilled(bytes32 indexed orderId, address indexed filler, address indexed recipient, address token, uint256 amount)";

/** Deploy blocks (crux-contracts/broadcast/Deploy*.s.sol/84532/run-latest.json); log scans start here. */
const SETTLER_V1_DEPLOY_BLOCK = BigInt(48311115);
const SETTLER_V2_DEPLOY_BLOCK = BigInt(48410403);
/** crux-contracts/broadcast/DeploySettlerV3.s.sol/84532/run-latest.json */
const SETTLER_V3_DEPLOY_BLOCK: bigint | null = BigInt(48619867);

/**
 * Block the active settler was deployed in. NEXT_PUBLIC_CRUX_SETTLER_V2_BLOCK may override v2's (for a redeploy);
 * anything but a plain number is ignored, so a malformed value can never break the build.
 */
const blockOverride = (value: string | undefined) => {
  const v = value?.trim();
  return v && /^\d+$/.test(v) ? BigInt(v) : null;
};
export const SETTLER_DEPLOY_BLOCK =
  SETTLER_VERSION === 3
    ? (blockOverride(process.env.NEXT_PUBLIC_CRUX_SETTLER_V3_BLOCK) ?? SETTLER_V3_DEPLOY_BLOCK ?? SETTLER_V2_DEPLOY_BLOCK)
    : settlerV2
      ? (blockOverride(process.env.NEXT_PUBLIC_CRUX_SETTLER_V2_BLOCK) ?? SETTLER_V2_DEPLOY_BLOCK)
      : SETTLER_V1_DEPLOY_BLOCK;

/**
 * Seconds after an order's fillDeadline when refund() succeeds: v3 refunds a same-chain order the second its
 * deadline passes unfilled; v1/v2 wait REFUND_GRACE (1 hour).
 */
export const REFUND_GRACE_SECONDS = SETTLER_VERSION === 3 ? 1 : 3600;

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
  version: String(SETTLER_VERSION),
  chainId: baseSepolia.id,
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

/** CruxSettlerV2's `orderDataType`: the order fields carried in `orderData`. */
const V2_ORDER_DATA_TYPE = keccak256(
  toHex(
    "CruxOrderData(address tokenIn,uint256 amountIn,string tokenOut,uint256 minAmountOut,uint256 destinationChainId,uint32 batchWindow)",
  ),
);

/**
 * What a CruxSettlerV2 order looks like in the wallet: one flat struct, every field readable. `tokenIn` is the
 * exact ERC-20 the settler pulls; `tokenOut` is the CAIP-19 id of what the user receives.
 */
export const CRUX_ORDER_TYPES = {
  CruxOrder: [
    { name: "user", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "tokenOut", type: "string" },
    { name: "minAmountOut", type: "uint256" },
    { name: "destinationChainId", type: "uint256" },
    { name: "openDeadline", type: "uint32" },
    { name: "fillDeadline", type: "uint32" },
    { name: "batchWindow", type: "uint32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/** EIP-712 types for ERC-7683 `GaslessCrossChainOrder` (CruxSettler v1). */
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
  /** The ERC-20 the settler escrows (v2 signs it by address). */
  inputToken: Address;
  inputAmount: bigint;
  outputCaip19: string;
  minOutputAmount: bigint;
  destinationChainId: number;
};

/** The ERC-7683 envelope `openFor` takes, plus the EIP-712 payload the wallet signs for it. */
export function buildGaslessOrder(draft: IntentDraft): {
  order: { originSettler: Address; user: Address; nonce: bigint; originChainId: bigint; openDeadline: number; fillDeadline: number; orderDataType: Hex; orderData: Hex };
  /** Either version's payload; typed loosely so one signTypedData call serves both. */
  typed: TypedDataDefinition;
} {
  // With a live settler the domain is pinned; signing it from another chain would give a signature the settler rejects.
  if (SETTLER_DEPLOYED && draft.chainId !== SETTLER_DOMAIN.chainId) {
    throw new Error(`Switch your wallet to Base Sepolia (chain ${SETTLER_DOMAIN.chainId}) to sign this intent.`);
  }
  const domain = SETTLER_DEPLOYED ? SETTLER_DOMAIN : { ...SETTLER_DOMAIN, chainId: draft.chainId };
  const now = Math.floor(Date.now() / 1000);
  const nonce = orderNonce();
  // Intent must be opened inside the current batch window and filled within 10 minutes.
  const openDeadline = now + BATCH_WINDOW_SECONDS;
  const fillDeadline = now + 600;
  const envelope = {
    originSettler: SETTLER,
    user: draft.user,
    nonce,
    originChainId: BigInt(domain.chainId),
    openDeadline,
    fillDeadline,
  };

  if (SETTLER_VERSION >= 2) {
    const tokenIn = getAddress(draft.inputToken);
    const orderData = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint32" }],
      [tokenIn, draft.inputAmount, draft.outputCaip19, draft.minOutputAmount, BigInt(draft.destinationChainId), BATCH_WINDOW_SECONDS],
    );
    return {
      order: { ...envelope, orderDataType: V2_ORDER_DATA_TYPE, orderData },
      typed: {
        domain,
        types: CRUX_ORDER_TYPES,
        primaryType: "CruxOrder" as const,
        message: {
          user: draft.user,
          tokenIn,
          amountIn: draft.inputAmount,
          tokenOut: draft.outputCaip19,
          minAmountOut: draft.minOutputAmount,
          destinationChainId: BigInt(draft.destinationChainId),
          openDeadline,
          fillDeadline,
          batchWindow: BATCH_WINDOW_SECONDS,
          nonce,
        },
      },
    };
  }

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
  const order = { ...envelope, orderDataType: ORDER_DATA_TYPE, orderData };
  return {
    order,
    typed: { domain, types: GASLESS_ORDER_TYPES, primaryType: "GaslessCrossChainOrder" as const, message: order },
  };
}
