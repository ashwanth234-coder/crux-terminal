/**
 * ERC-7683 Cross Chain Intents: origin and destination settler interfaces,
 * exactly as specified (https://eips.ethereum.org/EIPS/eip-7683).
 * Kept as `as const` TypeScript so viem/wagmi infer argument and return types.
 */

const gaslessCrossChainOrder = {
  name: "order",
  type: "tuple",
  internalType: "struct GaslessCrossChainOrder",
  components: [
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

const onchainCrossChainOrder = {
  name: "order",
  type: "tuple",
  internalType: "struct OnchainCrossChainOrder",
  components: [
    { name: "fillDeadline", type: "uint32" },
    { name: "orderDataType", type: "bytes32" },
    { name: "orderData", type: "bytes" },
  ],
} as const;

const output = [
  { name: "token", type: "bytes32" },
  { name: "amount", type: "uint256" },
  { name: "recipient", type: "bytes32" },
  { name: "chainId", type: "uint256" },
] as const;

const resolvedCrossChainOrder = {
  type: "tuple",
  internalType: "struct ResolvedCrossChainOrder",
  components: [
    { name: "user", type: "address" },
    { name: "originChainId", type: "uint256" },
    { name: "openDeadline", type: "uint32" },
    { name: "fillDeadline", type: "uint32" },
    { name: "orderId", type: "bytes32" },
    { name: "maxSpent", type: "tuple[]", internalType: "struct Output[]", components: output },
    { name: "minReceived", type: "tuple[]", internalType: "struct Output[]", components: output },
    {
      name: "fillInstructions",
      type: "tuple[]",
      internalType: "struct FillInstruction[]",
      components: [
        { name: "destinationChainId", type: "uint64" },
        { name: "destinationSettler", type: "bytes32" },
        { name: "originData", type: "bytes" },
      ],
    },
  ],
} as const;

/** IOriginSettler: opens gasless (signed) and on-chain orders, resolves them for fillers. */
export const originSettlerAbi = [
  {
    type: "function",
    name: "openFor",
    stateMutability: "nonpayable",
    inputs: [gaslessCrossChainOrder, { name: "signature", type: "bytes" }, { name: "originFillerData", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [onchainCrossChainOrder],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveFor",
    stateMutability: "view",
    inputs: [gaslessCrossChainOrder, { name: "originFillerData", type: "bytes" }],
    outputs: [{ ...resolvedCrossChainOrder, name: "" }],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [onchainCrossChainOrder],
    outputs: [{ ...resolvedCrossChainOrder, name: "" }],
  },
  {
    type: "event",
    name: "Open",
    anonymous: false,
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { ...resolvedCrossChainOrder, name: "resolvedOrder", indexed: false },
    ],
  },
] as const;

/** IDestinationSettler: fillers deliver outputs on the destination chain. */
export const destinationSettlerAbi = [
  {
    type: "function",
    name: "fill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "originData", type: "bytes" },
      { name: "fillerData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/**
 * CruxSettler extensions beyond ERC-7683 (crux-contracts/src/CruxSettler.sol):
 * the per-order escrow and the permissionless refund once the grace period ends.
 */
export const cruxSettlerAbi = [
  {
    type: "function",
    name: "escrows",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "fillDeadline", type: "uint32" },
      // Status: 0 None, 1 Open, 2 Settled, 3 Refunded.
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [],
  },
] as const;
