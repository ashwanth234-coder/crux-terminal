import { parseAbi } from "viem";

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

/**
 * CruxFactoryV3 ABI (crux-contracts branch v3-price-ticks), plus V2-only errors. Every V2 call the terminal
 * makes (createAuction, deposit, settleAuction, claim, claimCreatorVesting and the views) has the same
 * signature on V3, so this one ABI drives both factories. Generated from the forge artifacts.
 */
export const cruxBatchFactoryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "quoteAsset_",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "dexFactory_",
        "type": "address",
        "internalType": "contract IUniswapV2Factory"
      },
      {
        "name": "treasury_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CREATOR_FEE_SHARE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CREATOR_TOKEN_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CREATOR_VESTING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LP_SINK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LP_TOKEN_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_START_DELAY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SUPPLY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_FLOOR_PRICE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_START_DELAY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_SUPPLY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PRICE_DENOMINATOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SALE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TICK_COUNT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "auctionCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bidOf",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "quote",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxPrice",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimCreatorVesting",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimable",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "tokens",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "refund",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createAuction",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct CruxFactoryV3.LaunchParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "totalSupply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "graduationTarget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "startTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "batchWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxAllocationPerWallet",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "creatorVested",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "quote",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokens",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "demandAt",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "quoteAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxPricePerToken",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "dexFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IUniswapV2Factory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "findClearingPrice",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "graduates",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAuction",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CruxFactoryV3.Auction",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "startTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "batchWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "bidderCount",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "settledAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pair",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "totalSupply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "saleSupply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "graduationTarget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "floorPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxAllocationPerWallet",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalDeposits",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "clearingPrice",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSettlement",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CruxFactoryV3.Settlement",
        "components": [
          {
            "name": "aboveDemand",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "marginalDemand",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "raised",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "creatorQuote",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "creatorTokens",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "creatorQuoteClaimed",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "creatorTokensClaimed",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "clearingTick",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxDepositPerWallet",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteAsset",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteAtTick",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tick",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasury",
    "inputs": [
      {
        "name": "treasury_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleAuction",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "clearingPrice",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tickAt",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "tick",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tickPrice_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tickPrice",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tick",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AuctionCancelled",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionCreated",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "startTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "batchWindow",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "graduationTarget",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxAllocationPerWallet",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionGraduated",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "clearingPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "raised",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "pair",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "liquidity",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BidPlaced",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "quoteAdded",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalQuote",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokens",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "refund",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CreatorFeePaid",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CreatorVested",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "quote",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "tokens",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryUpdated",
    "inputs": [
      {
        "name": "treasury",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "DepositCapExceeded",
    "inputs": [
      {
        "name": "totalQuote",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxQuote",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidClearingPrice",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTick",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotLive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotSettled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotStarted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PriceBelowFloor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedUintDowncast",
    "inputs": [
      {
        "name": "bits",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownAuction",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooManyBidders",
    "inputs": []
  }
] as const;

export const AUCTION_V2_STATUS = { live: 0, graduated: 1, cancelled: 2 } as const;

/** CruxFactoryV4's additions to the V3 interface: the creator's vesting choice and how it reads back. */
export const factoryV4Abi = parseAbi([
  "function createAuctionWithVesting((string name, string symbol, string metadataURI, uint256 totalSupply, uint256 graduationTarget, uint64 startTime, uint32 batchWindow, uint256 maxAllocationPerWallet) params, bool instantUnlock) returns (uint256 auctionId, address token)",
  "function creatorVestingDuration(uint256 auctionId) view returns (uint256)",
  "event CreatorVestingSet(uint256 indexed auctionId, uint256 duration)",
]);

/**
 * CruxFactoryV6 additions: the creator's anti-sniper choice (one uniform-price batch after graduation, or straight to
 * Uniswap) next to V4's vesting choice, and the per-launch window it fixes (0 = unprotected).
 */
export const factoryV6Abi = parseAbi([
  "function createAuctionWithOptions((string name, string symbol, string metadataURI, uint256 totalSupply, uint256 graduationTarget, uint64 startTime, uint32 batchWindow, uint256 maxAllocationPerWallet) params, bool instantUnlock, bool antiSniper) returns (uint256 auctionId, address token)",
  "function batchProtection(uint256 auctionId) view returns (uint256)",
  "function protectionWindow() view returns (uint256)",
  "event BatchProtectionSet(uint256 indexed auctionId, uint256 duration)",
]);
