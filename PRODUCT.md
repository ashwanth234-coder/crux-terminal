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

Landing page and terminal live at https://crux-terminal.vercel.app and run as a Farcaster mini app (swap hand-off via `sdk.actions.swapToken`). Wallets: Coinbase Smart Wallet, injected, WalletConnect (when configured), Farcaster wallet in-client.

## Capabilities and Constraints

- Live balance aggregation on Base and BSC (native + USDC, Chainlink-priced); Robinhood Chain RPC not yet public; Solana balances need an SVM wallet.
- ERC-7683 gasless intents are signed off-chain; the origin settler is not deployed, so nothing is broadcast.
- $NOVA, $FORM, $MIND are illustrative tokens; their prices and changes are demo data.

## Brand Commitments

Name CRUX with the four-point wireframe star mark. Visual world pinned by the founder's reference boards: void black, electric acid lime (#D4F933) for primary actions, titanium chrome, extended bold sans display, monospace for financial data, cinematic chrome 3D. Section copy from the master brief is binding.

## Evidence on Hand

No customers, volumes, audits or partnerships are confirmed. "$37M+ recent deployer fees" refers to the Hyperliquid HIP-3 ecosystem as stated in the brief. Any live-looking feed on the page must be labelled simulated.

## Product Principles

- Show the mechanism, not the adjectives: intents, batches and solvers should be visible.
- One balance is the promise; every surface should reinforce "no bridging, no switching".
- Never imply the protocol is live where it is not.
