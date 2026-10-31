import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { bytesToHex, keccak256, type Address } from "viem";

/**
 * Pay from Solana (S1, devnet): the crux_escrow program (crux-solana) escrows USDC per order; the Crux solver fills the
 * order on Base Sepolia, CruxFillProver proves the fill back to Solana through Hyperlane, and the escrow pays only that
 * filler. With no proof, the user refunds 6 hours after the fill deadline. Encodings mirror the program exactly.
 */
export const SOLANA_ESCROW_PROGRAM = new PublicKey(process.env.NEXT_PUBLIC_CRUX_SOLANA_ESCROW ?? "51VZTKfmnS85fvJ1rEBCuVQveqHg2XeN44ZiHeeNa8m5");
/** Circle USDC on Solana devnet: classic SPL Token, 6 decimals, the escrow's only input (1:1 with Base test USDC). */
export const USDC_DEVNET_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
/** The chain orders are delivered on (Base Sepolia). */
const DESTINATION_CHAIN_ID = BigInt(84532);
/** The program's limits: the fill deadline is at most an hour out; refunds open 6 hours after it with no proof. */
export const SOLANA_MAX_FILL_WINDOW_SECONDS = 3600;
export const SOLANA_REFUND_GRACE_SECONDS = 6 * 3600;
/** Where the solver can fill quickly: well inside the program's one-hour cap. */
export const SOLANA_FILL_WINDOW_SECONDS = 600;

/**
 * What opening an order costs the user's wallet, in lamports, from the program's account sizes at Solana's rent rate
 * (6,960 lamports per byte incl. the 128-byte header): the Order account (205 bytes) is closed back to the user on fill
 * or refund; the order-id marker (8 bytes, never closed so an id can't be reused) and the escrow's USDC token account
 * (165 bytes, not closed by the program) keep theirs.
 */
export const SOLANA_RENT = { order: 2_317_680, marker: 946_560, vault: 2_039_280 } as const;
const FEE_LAMPORTS = 5_000;
export const SOLANA_OPEN_SOL = (SOLANA_RENT.order + SOLANA_RENT.marker + SOLANA_RENT.vault + FEE_LAMPORTS) / 1e9;
export const SOLANA_RETURNED_SOL = SOLANA_RENT.order / 1e9;
export const SOLANA_KEPT_SOL = (SOLANA_RENT.marker + SOLANA_RENT.vault) / 1e9;
/** The SOL a wallet needs before it can open an order: the cost above with headroom for a priority fee. */
export const SOLANA_MIN_SOL = 0.006;
/** "≈0.0053 SOL". */
export const solAmount = (sol: number) => `≈${sol.toFixed(4)} SOL`;

// Anchor discriminators, from crux_escrow's IDL.
const OPEN_IX = [228, 220, 155, 71, 199, 189, 60, 45];
const REFUND_IX = [2, 96, 183, 251, 63, 208, 46, 46];
const ORDER_ACCOUNT = [134, 173, 223, 185, 77, 86, 28, 51];

const utf8 = (s: string) => new TextEncoder().encode(s);
const keccak = (...parts: Uint8Array[]) => {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return Uint8Array.from(Buffer.from(keccak256(all).slice(2), "hex"));
};
const hexBytes = (hex: string) => Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
const le = (value: bigint, bytes: number) => {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return out;
};
const beWord = (value: bigint) => le(value, 32).reverse();

export const associatedTokenAddress = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), USDC_DEVNET_MINT.toBuffer()], ASSOCIATED_TOKEN_PROGRAM)[0];
export const orderAddress = (fillHash: Uint8Array) =>
  PublicKey.findProgramAddressSync([utf8("order"), fillHash], SOLANA_ESCROW_PROGRAM)[0];
export const orderIdMarkerAddress = (orderId: Uint8Array) =>
  PublicKey.findProgramAddressSync([utf8("id"), orderId], SOLANA_ESCROW_PROGRAM)[0];

/** keccak256("crux-solana-order" ++ program ++ user ++ nonce (u64 little-endian)), as the program computes it. */
export const solanaOrderId = (user: PublicKey, nonce: bigint) =>
  keccak(utf8("crux-solana-order"), SOLANA_ESCROW_PROGRAM.toBytes(), user.toBytes(), le(nonce, 8));

/** abi.encode(orderId, payee, keccak256(tokenOut), minAmountOut, 84532, fillDeadline): what the solver fills and proves. */
export function solanaOriginData(orderId: Uint8Array, payee: Address, tokenOut: string, minAmountOut: bigint, fillDeadline: number) {
  const d = new Uint8Array(192);
  d.set(orderId, 0);
  d.set(hexBytes(payee), 44);
  d.set(keccak(utf8(tokenOut)), 64);
  d.set(beWord(minAmountOut), 96);
  d.set(beWord(DESTINATION_CHAIN_ID), 128);
  d.set(beWord(BigInt(fillDeadline)), 160);
  return d;
}

export type SolanaOrder = {
  user: PublicKey;
  nonce: bigint;
  amount: bigint;
  tokenOut: string;
  minAmountOut: bigint;
  payee: Address;
  fillDeadline: number;
  orderId: Uint8Array;
  fillHash: Uint8Array;
  originData: Uint8Array;
};

/** A new order: a random nonce (the program refuses a reused one), the order id and fill hash it will check. */
export function newSolanaOrder(o: { user: PublicKey; amount: bigint; tokenOut: string; minAmountOut: bigint; payee: Address; now: number }): SolanaOrder {
  const nonce = new DataView(crypto.getRandomValues(new Uint8Array(8)).buffer).getBigUint64(0, true);
  const fillDeadline = o.now + SOLANA_FILL_WINDOW_SECONDS;
  const orderId = solanaOrderId(o.user, nonce);
  const originData = solanaOriginData(orderId, o.payee, o.tokenOut, o.minAmountOut, fillDeadline);
  return { ...o, nonce, fillDeadline, orderId, fillHash: keccak(originData), originData };
}

/** crux_escrow `open`: escrows `amount` of the user's USDC for this order. */
export function openInstruction(order: SolanaOrder, batchWindow: number): TransactionInstruction {
  const tokenOut = utf8(order.tokenOut);
  const data = Uint8Array.from([
    ...OPEN_IX,
    ...le(order.nonce, 8),
    ...le(order.amount, 8),
    ...le(BigInt(tokenOut.length), 4),
    ...tokenOut,
    ...le(order.minAmountOut, 16),
    ...hexBytes(order.payee),
    ...le(BigInt(order.fillDeadline), 4),
    ...le(BigInt(batchWindow), 4),
    ...order.orderId,
    ...order.fillHash,
  ]);
  const orderKey = orderAddress(order.fillHash);
  return new TransactionInstruction({
    programId: SOLANA_ESCROW_PROGRAM,
    keys: [
      { pubkey: order.user, isSigner: true, isWritable: true },
      { pubkey: USDC_DEVNET_MINT, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(order.user), isSigner: false, isWritable: true },
      { pubkey: orderKey, isSigner: false, isWritable: true },
      { pubkey: orderIdMarkerAddress(order.orderId), isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(orderKey), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/** crux_escrow `refund`: returns an unproven order's USDC to its user once the grace period has passed. Anyone may send it. */
export function refundInstruction(user: PublicKey, fillHash: Uint8Array): TransactionInstruction {
  const orderKey = orderAddress(fillHash);
  return new TransactionInstruction({
    programId: SOLANA_ESCROW_PROGRAM,
    keys: [
      { pubkey: orderKey, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: USDC_DEVNET_MINT, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(orderKey), isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(user), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(REFUND_IX),
  });
}

/** An Order account's progress: whether a Hyperlane proof has named the filler yet. */
export function orderProven(data: Uint8Array): boolean {
  if (!ORDER_ACCOUNT.every((b, i) => data[i] === b)) throw new Error("not a crux_escrow Order account");
  return data.subarray(184, 204).some((b) => b !== 0);
}

export const toHex = (bytes: Uint8Array) => bytesToHex(bytes);
