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
 * CruxFactoryV2 (crux-contracts/src/CruxFactoryV2.sol), generated from the forge artifact.
 * Limit-price bids, per-wallet caps, scheduled starts, LP locked forever on graduation, 1% fee
 * with a 70% creator kickback. Status: 0 Live, 1 Graduated, 2 Cancelled.
 */
export const cruxFactoryV2Abi = [
  {
    "type": "function",
    "name": "CREATOR_FEE_SHARE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "address"
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
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BIDDERS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
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
        "type": "uint256"
      },
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "quote",
        "type": "uint256"
      },
      {
        "name": "maxPrice",
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "uint256"
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
        "type": "uint256"
      },
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "tokens",
        "type": "uint256"
      },
      {
        "name": "refund",
        "type": "uint256"
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
        "components": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "metadataURI",
            "type": "string"
          },
          {
            "name": "totalSupply",
            "type": "uint256"
          },
          {
            "name": "graduationTarget",
            "type": "uint256"
          },
          {
            "name": "startTime",
            "type": "uint64"
          },
          {
            "name": "batchWindow",
            "type": "uint32"
          },
          {
            "name": "maxAllocationPerWallet",
            "type": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "name": "token",
        "type": "address"
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
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "quote",
        "type": "uint256"
      },
      {
        "name": "tokens",
        "type": "uint256"
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
        "type": "uint256"
      },
      {
        "name": "price",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
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
        "type": "uint256"
      },
      {
        "name": "quoteAmount",
        "type": "uint256"
      },
      {
        "name": "maxPricePerToken",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "findClearingPrice",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "graduates",
        "type": "bool"
      },
      {
        "name": "price",
        "type": "uint256"
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
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "token",
            "type": "address"
          },
          {
            "name": "creator",
            "type": "address"
          },
          {
            "name": "startTime",
            "type": "uint64"
          },
          {
            "name": "batchWindow",
            "type": "uint32"
          },
          {
            "name": "status",
            "type": "uint8"
          },
          {
            "name": "bidderCount",
            "type": "uint32"
          },
          {
            "name": "settledAt",
            "type": "uint64"
          },
          {
            "name": "pair",
            "type": "address"
          },
          {
            "name": "totalSupply",
            "type": "uint256"
          },
          {
            "name": "saleSupply",
            "type": "uint256"
          },
          {
            "name": "graduationTarget",
            "type": "uint256"
          },
          {
            "name": "floorPrice",
            "type": "uint256"
          },
          {
            "name": "maxAllocationPerWallet",
            "type": "uint256"
          },
          {
            "name": "totalDeposits",
            "type": "uint256"
          },
          {
            "name": "clearingPrice",
            "type": "uint256"
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
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "aboveDemand",
            "type": "uint256"
          },
          {
            "name": "marginalDemand",
            "type": "uint256"
          },
          {
            "name": "raised",
            "type": "uint256"
          },
          {
            "name": "creatorQuote",
            "type": "uint256"
          },
          {
            "name": "creatorTokens",
            "type": "uint256"
          },
          {
            "name": "creatorQuoteClaimed",
            "type": "uint256"
          },
          {
            "name": "creatorTokensClaimed",
            "type": "uint256"
          }
        ]
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
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleAuction",
    "inputs": [
      {
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "name": "clearingPrice",
        "type": "uint256"
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
        "type": "address"
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
        "indexed": true
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
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true
      },
      {
        "name": "startTime",
        "type": "uint64",
        "indexed": false
      },
      {
        "name": "batchWindow",
        "type": "uint32",
        "indexed": false
      },
      {
        "name": "graduationTarget",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "maxAllocationPerWallet",
        "type": "uint256",
        "indexed": false
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
        "indexed": true
      },
      {
        "name": "clearingPrice",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "raised",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "pair",
        "type": "address",
        "indexed": false
      },
      {
        "name": "liquidity",
        "type": "uint256",
        "indexed": false
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
        "indexed": true
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quoteAdded",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "totalQuote",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "maxPrice",
        "type": "uint256",
        "indexed": false
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
        "indexed": true
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true
      },
      {
        "name": "tokens",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "refund",
        "type": "uint256",
        "indexed": false
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
        "indexed": true
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
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
        "indexed": true
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokens",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
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
        "type": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address"
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
        "type": "uint8"
      },
      {
        "name": "value",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TooManyBidders",
    "inputs": []
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
  }
] as const;

export const AUCTION_V2_STATUS = { live: 0, graduated: 1, cancelled: 2 } as const;
