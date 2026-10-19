/**
 * CruxFactory: token launch + 60-second uniform-price batch auction.
 * This is Crux's own interface (not an ERC); the contracts deployed to Base
 * Sepolia must implement exactly these signatures for the UI to work.
 *
 * Lifecycle: createAuction → deposit (USDC, sealed within each batch window)
 * → settleAuction (one clearing price per batch) → claimTokens.
 */

const launchParams = {
  name: "params",
  type: "tuple",
  internalType: "struct LaunchParams",
  components: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    /** JSON metadata (description, socials) — ipfs:// or https:// URI. */
    { name: "metadataURI", type: "string" },
    /** Total supply in token base units (18 decimals). */
    { name: "totalSupply", type: "uint256" },
    /** USDC (6 decimals) raised before the token graduates to the canonical Base pool. */
    { name: "graduationTarget", type: "uint256" },
    { name: "batchAuction", type: "bool" },
    { name: "batchWindow", type: "uint32" },
  ],
} as const;

const auction = {
  type: "tuple",
  internalType: "struct Auction",
  components: [
    { name: "token", type: "address" },
    { name: "creator", type: "address" },
    { name: "startTime", type: "uint64" },
    { name: "batchWindow", type: "uint32" },
    { name: "graduationTarget", type: "uint256" },
    { name: "totalDeposits", type: "uint256" },
    { name: "clearingPrice", type: "uint256" },
    /** 0 = Live, 1 = Settled, 2 = Graduated, 3 = Cancelled */
    { name: "status", type: "uint8" },
  ],
} as const;

export const AUCTION_STATUS = ["Live", "Settled", "Graduated", "Cancelled"] as const;

export const cruxFactoryAbi = [
  {
    type: "function",
    name: "createAuction",
    stateMutability: "nonpayable",
    inputs: [launchParams],
    outputs: [
      { name: "auctionId", type: "uint256" },
      { name: "token", type: "address" },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimTokens",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ ...auction, name: "" }],
  },
  {
    type: "function",
    name: "auctionCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    /** Tokens sold in the auction (80% of supply); the rest seeds the pool on graduation. */
    type: "function",
    name: "saleSupply",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    /** USDC an account has committed and not yet claimed (as tokens or a refund). */
    type: "function",
    name: "deposits",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    /** Tokens the account would receive if the auction graduated at current deposits. */
    type: "function",
    name: "previewAllocation",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  { type: "error", name: "InvalidParams", inputs: [] },
  { type: "error", name: "UnknownAuction", inputs: [] },
  { type: "error", name: "NotLive", inputs: [] },
  { type: "error", name: "WindowClosed", inputs: [] },
  { type: "error", name: "WindowOpen", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "NothingToClaim", inputs: [] },
  {
    type: "event",
    name: "AuctionCreated",
    anonymous: false,
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "batchWindow", type: "uint32", indexed: false },
      { name: "graduationTarget", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Deposited",
    anonymous: false,
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionSettled",
    anonymous: false,
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "clearingPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokensClaimed",
    anonymous: false,
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Refunded",
    anonymous: false,
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
