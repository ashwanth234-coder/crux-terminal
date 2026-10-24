# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Crypto-native traders first: Farcaster and Base users and active on-chain traders who want to buy a token on any chain without switching networks or bridging. They meet Crux in a social feed (Farcaster mini app) or a desktop browser, usually mid-session with a wallet already open. Institutions (solvers, market makers, HIP-3 deployers) are a secondary audience reached through the mechanics sections.

## Product Purpose

Crux is an omnichain execution protocol: one unified buying power across Base, Solana, BSC and Robinhood Chain. Users sign an intent; institutional solvers fill it with their own capital (ERC-7683). Success is a visitor connecting a wallet and reviewing an intent.

## Positioning

Intent-based, bridge-free execution with a 60-second uniform-price batch auction for launches, canonical spot liquidity on Base paired with RWA yield assets, and Hyperliquid HIP-3 syndication once a token passes $10M market cap.

## Operating Context

Landing page and terminal live at https://cruxprotocol.xyz and run as a Farcaster mini app (swap hand-off via `sdk.actions.swapToken`). Wallets: Coinbase Smart Wallet, injected, WalletConnect (when configured), Farcaster wallet in-client.

## Capabilities and Constraints

- Live balance aggregation on Base and BSC (native + USDC, Chainlink-priced); Robinhood Chain RPC not yet public; Solana balances need an SVM wallet.
- Testnet only, Base Sepolia (84532), every contract source-verified (Basescan + Sourcify):
  - Intents: CruxSettlerV3 (0xC3BE…f44C) with CruxDestinationSettlerV2 (0x62e5…cdf4). Readable EIP-712 orders, trustless same-chain settlement (escrow pays only the recorded filler of the exact order), refunds the moment an unfilled order's deadline passes. The solver fills graduated launch tokens from their locked pools in 60-second uniform batches.
  - Cross-chain Phase A (Arbitrum Sepolia 421614 → Base Sepolia): a launch buy can pay with Circle test USDC on Arbitrum ("Pay from" on the trade panel). CruxCrossChainSettler (0x570b…9e82 on Arbitrum) escrows it, the solver fills on Base through the same destination, and CruxFillProver (0x7cb1…29e8 on Base) sends a Hyperlane message naming the filler of those exact details; the escrow pays only that filler. Refundable 6 hours after the deadline if no proof lands. My intents lists and refunds both chains. Both source-verified (Basescan/Arbiscan + Sourcify exact match).
  - Launches: CruxFactoryV6 (0xd07f…7940, since 2026-10-24). V4's launch (uniform-price batch auction on 1% price ticks, and the creator's choice of 30-day vesting, green "30D vested" badge, or an instant unlock, red "Instant unlock" badge), plus the creator's anti-sniper choice. On (default, green "Anti-sniper 60s" badge): graduation seeds CruxBatchPoolV2 (0xabcd…79b8), not Uniswap, and the first minute of trading clears in one on-chain 60-second batch at one price, so a bot at second 0 pays what a person at second 59 pays; the token refuses transfers to its Uniswap pair until the keeper migrates the liquidity there with the LP burned. Off (red "Unprotected" badge): graduation seeds the Uniswap V2 pool directly with the LP burned. The Trust Radar shows both choices. The owner can retune the window for later launches (1 min to 24 h). V5 (0x87e3…30d9: 24 hours of batches) and V2–V4 launches stay readable; V2–V4 show as unprotected.
  - Indexer feeds: /tokenlist.json (Uniswap token list of graduated tokens) and /api/launches (every launch), both live from the chain.
  - Nothing is on mainnet.
- $NOVA, $FORM, $MIND are illustrative tokens; their prices and changes are demo data.

## Brand Commitments

Name CRUX with the geometric four-point mark (four equal tapered arms; never a cross). Visual world (2026-10-21, "Markets without borders"): coal black #0A0B0D, graphite #141518 layers, warm white #F5F3EE type, titanium #A7ADB5 detail, borders #292B2F, Signal Orange #FF642D only for the mark, primary actions, selection and live state. Bodoni Moda display serif, Archivo UI, JetBrains Mono for financial data. No WebGL, no looping motion; the hero emblem is static SVG and every figure is real testnet data or labelled DEMO / PLANNED. Hero copy: MARKETS / WITHOUT / BORDERS. · "Global markets. One execution layer." · ENTER CRUX.

## Evidence on Hand

No customers, volumes, audits or partnerships are confirmed. "$37M+ recent deployer fees" refers to the Hyperliquid HIP-3 ecosystem as stated in the brief. Any live-looking feed on the page must be labelled simulated.

## Product Principles

- Show the mechanism, not the adjectives: intents, batches and solvers should be visible.
- One balance is the promise; every surface should reinforce "no bridging, no switching".
- Never imply the protocol is live where it is not.
