# One account, trade everywhere: the build plan

Founder brief (2026-11-17): "as simple as possible, all UI/UX and usability, one account, trade everywhere, all chains,
fast". Decision: move everyone to the new account (CruxAccountV3 from FactoryV4).

## What a user does (the whole product)

1. **Log in** with email or Google. Their one Crux account exists at once; there's nothing to set up beyond the
   protected withdrawal wallet, as today.
2. **Add money.** One "Add money" button opens one sheet:
   - "From an exchange or wallet": pick the network they're sending on (Base or Solana) and get one address with a
     copy button and a QR code.
   - It all lands in one balance; Solana deposits move by themselves, as today.
3. **Find any coin.** One search box finds Base and Solana coins together. A small chain badge is the only sign of
   the chain.
4. **Buy / Sell.** The same panel for every coin: amount presets, Buy, Sell %. No networks, no SOL, no bridging, no
   popups. Buys are about 2 s.
5. **One balance**, shown in one place (top bar): **$X**. Tapping it shows the breakdown (cash, coins), never chains.
6. **Withdraw** to the protected wallet, as today.

Words never shown: chain, network, bridge, gas, SOL, escrow, settle, signer, Solana wallet, V3/V4.

## How each click is routed (hidden)

| Action | Where the money is | Route |
|---|---|---|
| Buy a Base coin | Base account USDC | today's account trade (unchanged) |
| Buy a Solana coin | Solana USDC covers it | direct Solana trade (live today, ~2 s) |
| Buy a Solana coin | not enough Solana USDC | from the account (`tradeSolana`); dry run until Base mainnet |
| Sell a Solana coin | coin in the Solana wallet | direct Solana sell; USDC stays there and counts in the balance |
| Withdraw | Base + Solana USDC | Solana part moves to Base first (existing deposit path), then out |

## Phases

**A. New account for everyone**
- Terminal and solver point "the 5afe account" at FactoryV4 (same interface, so mostly an address change).
- The old account becomes "previous account" with a one-tap **Move $X to your account**.
- The Solana wallet is linked to the account silently (one login signature, no prompt) the first time it's needed.

**B. Launches from the new account**
- Deploy a fresh V9 launch factory, router and listing adapter bound to FactoryV4 (deployer key; then **your Safe
  signatures** to trust the adapter on CruxLister).
- Old Sepolia V9 test launches become sell-only, as the V8 ones did.

**C. One balance and one trade panel**
- Top-bar balance = account USDC + Solana USDC + coins.
- The Buy/Sell panel picks the route in the table above.
- The /solana test page goes away.

**D. Solana coins in the terminal**
- Search: Base launches and markets plus Jupiter's verified Solana token list.
- Solana coin page: price chart (GeckoTerminal candles), the same Buy/Sell panel, holdings.
- Route prefetch while the amount is typed, for speed.

**E. Add money sheet**
- One sheet: network picker, address, QR.

## Honest limits until Base mainnet

- Base runs on Sepolia (test USDC); Solana is real money. Until mainnet, the balance shows them **separately labelled**
  ("test" vs "real"), never added together.
- Buys of Solana coins *from Base test USDC* stay a dry run (checked, then refunded).
- Solana buys from real Solana USDC are live.
- The 2-of-2 lock waits on Privy support (login tokens rejected server side).

## Order and checkpoints

1. A + B: one deploy round. Needs the deployer password once and your Safe signatures once.
2. C, then D, then E, each shipped and checked in the browser.
3. Mainnet cutover: everything from step 1 deployed fresh on Base mainnet; Solana-from-account goes live.
