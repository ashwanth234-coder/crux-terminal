# Crux Alpha Tester Guide (Base Sepolia testnet)

Web version: https://crux-terminal.vercel.app/alpha-guide

Every token here is a **test token with no value**. The contracts are **unaudited**. Never use a wallet that holds real funds, and never share a private key or seed phrase with anyone, including us.

---

## 1. Overview & objective

Thanks for joining the Crux alpha. Before mainnet we want to prove three things with real people on a real chain:

- **Batch auctions.** A launch sells in one window (the creator picks 60 seconds, 5 minutes, 1 hour or 24 hours), and every filled bid pays one uniform clearing price.
- **Limit bids and caps.** You can cap the price you'll pay, and the creator caps each wallet's deposit.
- **Intent trading.** After a launch graduates, you trade its token by signing an intent. A solver fills it from the token's locked Uniswap V2 pool.

Use it like you would a real product, try to break it, and tell us what confused you.

---

## 2. Network & wallet setup

Add Base Sepolia to your wallet (MetaMask: Settings → Networks → Add network → Add a network manually):

| Field | Value |
|---|---|
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency | ETH |
| Block explorer | `https://sepolia.basescan.org` |

**You need both test ETH and test USDC.**
- **ETH** pays gas for every approval and contract call (launching, bidding, claiming, submitting an intent). Without it, nothing sends.
- **USDC** is what you bid and trade with.

1. **Test ETH**: use the Alchemy Base Sepolia faucet (https://www.alchemy.com/faucets/base-sepolia) or the Superchain faucet (https://console.optimism.io/faucet). Some faucets ask you to sign in or hold a tiny mainnet balance; if one refuses, try the other. A few cents' worth lasts the whole alpha.
2. **Test USDC**: go to https://faucet.circle.com, pick **Base Sepolia**, paste your address and request.
3. **Show USDC in MetaMask**: Tokens → Import tokens → paste `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals).

---

## 3. Workflow 1: the batch auction

**Launch a token** (creators):
1. Click **Launch** in the top bar.
2. Fill in name and symbol. Keep the initial supply at 1,000,000,000.
3. Set a **graduation target** (e.g. $3 to $10). Tip: with 1B supply, a target divisible by 3 (like $3 or $9) lets one wallet at the cap fill the sale exactly.
4. Set **Scheduled start** (3+ minutes, so people can arrive) and **Max allocation per wallet**. The hint under it shows each wallet's deposit limit and how many buyers the sale needs.
5. Choose a **5 min** batch window, click **Deploy Token & Initialize Auction** and confirm. You land on the auction page: share that link.

**Bid** (everyone):
1. Open the auction link. When the status turns **Deposits open**, the bid panel appears.
2. Type an amount, or tap **25%**, **50%** or **MAX**. MAX is the most you can bid: your test USDC balance or your remaining wallet cap, whichever is lower.
3. Optional: turn on **Limit price** and set the most you'll pay per token (the contract's `maxPricePerToken`). It rounds down to the nearest 1% price step. If the batch clears above your limit, your whole bid is refunded.
4. Read the **Risk preview**: your worst price, the minimum you receive, and what selling everything at graduation would return. Then click **Submit batch bid**. The first time, your wallet asks twice: approve the exact amount, then place the bid. Watch the **Demand curve** and the **Projected clearing** price move as others bid.
5. When the window closes, the Crux keeper settles it automatically within about 15 seconds (anyone can also press Settle). Then **Claim tokens**: your tokens at the clearing price plus any unused USDC. If demand missed the target, it cancels and you **Claim refund** in full.

**The anti-sniper guarantee:** arriving first buys nothing. Whether you bid in the first second or the last, every filled bid pays the same clearing price, and per-wallet caps stop one address from taking the sale. Bids are public on-chain while the window is open (not sealed), so use a limit price if you care about the ceiling.

On graduation, 30% of supply and half the raise seed a Uniswap V2 pool whose LP tokens go to `0x…dEaD`, locked forever. Creators receive 70% of the 1% protocol fee at once; their share of the raise and their 10% of supply vest over 30 days.

---

## 4. Workflow 2: trading via intents

1. On the home page **Terminal** card, pick a graduated token ($V3, $QC2 or a new one), or open a graduated launch's page and use **Trade via intent**.
2. Choose Buy or Sell and enter a small amount (or tap **$0.01** / **$0.05**). Read the **Risk preview**: what you receive, the minimum signed into your order, the slippage and the cost of selling straight back.
3. Click **Sign trade intent**: approve the exact amount, sign the order (an EIP-712 signature, which is free), then submit it. Approving and submitting each cost a little test ETH. Your funds go into the settler's escrow.
4. Within about a minute, the solver's next batch swaps in the token's Uniswap V2 pool and delivers to your wallet; then the escrow settles. The screen shows **Settlement confirmed**.

> ⚠️ **Keep trades tiny: $0.01 to $0.05.** Testnet pools hold only a few dollars ($V3 about $1.50, $QC2 about $3). A $0.02 buy already moves the price 1 to 2%. Bigger orders get heavy slippage by design of an AMM, and the solver skips orders that would move a pool more than 10% in one batch. Your order's minimum-received limit protects you: if it can't be met, nothing fills and you refund.

A token marked **not listed** graduated recently and is waiting for the team to register it for intent trading. Fees: a 0.30% solver spread plus Uniswap's 0.3% pool fee, both included in the quote.

---

## 5. Troubleshooting & refunds

**An intent didn't fill.** Every intent has a 10-minute fill deadline. If no solver fills it:
1. Open the home page **Terminal** card and scroll to **My intents**. Your order shows **Refund opens in…**
2. About an hour after the deadline (roughly 70 minutes after you placed it), click **Refund test USDC** (or the token, for a sell) and confirm. Refunds always return to your own address.

**MetaMask says "Requested resource not available" or hangs.** Its Base Sepolia RPC is congested. Settings → Networks → Base Sepolia → replace the RPC URL with `https://base-sepolia-rpc.publicnode.com`.

- **"Not enough test USDC"**: top up at faucet.circle.com.
- **A transaction won't send**: check you have test ETH.
- **Basescan shows a different sender**: if your wallet is a smart account (EIP-7702), your wallet provider's relayer may appear as the sender. The contracts still credit your address.

---

## 6. Transparent trust disclosures

This alpha is deliberately simple. You should know exactly what you're trusting:

- **One solver.** A single solver daemon run by the Crux team fills every intent. If it's down, intents don't fill and you refund after the deadline.
- **A centralized settlement verifier.** Escrow is released by an allow-listed verifier (the team's solver wallet), not by a cross-chain proof.
- **Manual token registration.** After each graduation, the team registers the token on the settlers before it can trade via intents. The owner key controls listings, verifiers and the fee treasury.
- **Unaudited contracts, testnet only.**

Verify on Basescan (https://sepolia.basescan.org):

| Contract | Address |
|---|---|
| CruxFactoryV3 (launches) | `0x4894e685553d10FCCc0AfeC0840f686254939cF0` |
| CruxSettler (intent escrow) | `0x570b679cBeDA67322B7d6a348985B6189E8C9e82` |
| CruxDestinationSettler (fills) | `0x300a835939D2beBed59C543470DCD9a9c8065822` |
| Solver + keeper wallet | `0x69E422d3Cca945a44210684b57F85f556212AD67` |

---

## 7. Feedback & bug reports

Post reports here: **[FEEDBACK LINK]**

The most useful reports include:
- Your wallet address
- The transaction hash (Basescan link)
- The auction or page URL
- What you expected vs. what happened
- A screenshot
- Browser and wallet (e.g. Chrome + MetaMask)

Confusing moments are as valuable as bugs: if you hesitated, tell us where.
