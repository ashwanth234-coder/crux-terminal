import { keccak256 } from "viem";

/**
 * Nonces in [from, to) for a 5afe account: the first whose CREATE2 address ends in 5afe, or -1. `salt` (96 bytes,
 * owner and withdrawal address filled in) and `create2` (85 bytes, 0xff ‖ factory ‖ _ ‖ init-code hash) are scratch.
 * Plain numbers, not BigInt: nonces stay far below 2^53.
 */
export function searchV3Nonce(salt: Uint8Array, create2: Uint8Array, from: number, to: number): number {
  for (let nonce = from; nonce < to; nonce++) {
    let n = nonce;
    for (let i = 95; i >= 88; i--) {
      salt[i] = n % 256;
      n = Math.floor(n / 256);
    }
    create2.set(keccak256(salt, "bytes"), 21);
    const hash = keccak256(create2, "bytes");
    if (hash[30] === 0x5a && hash[31] === 0xfe) return nonce;
  }
  return -1;
}
