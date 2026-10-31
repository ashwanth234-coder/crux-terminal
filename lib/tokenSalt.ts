import { getContractAddress, keccak256, type Address, type Hex } from "viem";

/**
 * Launch-token salts for CruxFactoryV8, which deploys every token at a CREATE2 address ending in 5afe and refuses any
 * salt that doesn't give one. The form asks the factory for `tokenInitCodeHash(params, creator)` (the creator is the
 * wallet for a direct launch, or the launch's `options.creator` for a gasless one), then mines here: about 65,536 tries
 * on average, a fraction of a second. The salt goes into the launch parameters, and so into the creator's signature.
 */
export const TOKEN_SUFFIX = 0x5afe;

const hexBytes = (hex: string) => Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));

/** The first salt at or after `start` whose CREATE2 address (deployer, initCodeHash) ends in 5afe. */
export function mineTokenSalt(deployer: Address, initCodeHash: Hex, start: bigint = randomStart()): { salt: Hex; token: Address } {
  // 0xff ++ deployer (20) ++ salt (32) ++ initCodeHash (32); only the salt changes between tries.
  const buf = new Uint8Array(85);
  buf[0] = 0xff;
  buf.set(hexBytes(deployer), 1);
  buf.set(hexBytes(initCodeHash), 53);
  for (let s = start; ; s++) {
    let v = s;
    for (let i = 52; i >= 21; i--) {
      buf[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    const hash = keccak256(buf, "bytes");
    if (hash[30] === TOKEN_SUFFIX >> 8 && hash[31] === (TOKEN_SUFFIX & 0xff)) {
      const salt = `0x${Buffer.from(buf.subarray(21, 53)).toString("hex")}` as Hex;
      return { salt, token: getContractAddress({ opcode: "CREATE2", from: deployer, salt, bytecodeHash: initCodeHash }) };
    }
  }
}

/** A random 64-bit starting point, so two identical launches by one creator don't race for the same address. */
function randomStart(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return b.reduce((acc, x) => (acc << BigInt(8)) | BigInt(x), BigInt(0));
}

export const endsIn5afe = (token: Address) => token.toLowerCase().endsWith("5afe");
