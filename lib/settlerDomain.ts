import { getAddress, parseAbi } from "viem";
import type { Config } from "wagmi";
import { readContract } from "wagmi/actions";
import { SETTLER_DOMAIN } from "./intents";

/** ERC-5267: OpenZeppelin's EIP712 base exposes the exact domain it hashes with. */
const eip712DomainAbi = parseAbi([
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

/** One check per settler per page load. */
const verified = new Map<string, Promise<void>>();

type Domain = { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };

/**
 * Confirms the deployed settler hashes signatures with the same domain the terminal signs, so a user is never
 * asked for a signature the contract would reject (or one meant for a different contract). Checked once per
 * page load; a failed check is retried on the next attempt.
 */
export function verifySettlerDomain(config: Config, expected: Domain = SETTLER_DOMAIN): Promise<void> {
  const key = `${expected.chainId}:${expected.verifyingContract.toLowerCase()}`;
  const cached = verified.get(key);
  if (cached) return cached;
  const check = (async () => {
    const [, name, version, chainId, verifyingContract] = await readContract(config, {
      address: expected.verifyingContract,
      abi: eip712DomainAbi,
      functionName: "eip712Domain",
      chainId: expected.chainId as Parameters<typeof readContract>[1]["chainId"],
    });
    const matches =
      name === expected.name &&
      version === expected.version &&
      chainId === BigInt(expected.chainId) &&
      getAddress(verifyingContract) === getAddress(expected.verifyingContract);
    if (!matches) {
      throw new Error("The settler's signing domain doesn't match this site's. Nothing was signed; please report this.");
    }
  })().catch((err) => {
    verified.delete(key);
    throw err;
  });
  verified.set(key, check);
  return check;
}
