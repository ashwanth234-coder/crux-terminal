import { getAddress, parseAbi } from "viem";
import type { Config } from "wagmi";
import { readContract } from "wagmi/actions";
import { SETTLER_DOMAIN } from "./intents";

/** ERC-5267: OpenZeppelin's EIP712 base exposes the exact domain it hashes with. */
const eip712DomainAbi = parseAbi([
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

let verified: Promise<void> | null = null;

/**
 * Confirms the deployed settler hashes signatures with the same domain the terminal signs, so a user is never
 * asked for a signature the contract would reject (or one meant for a different contract). Checked once per
 * page load; a failed check is retried on the next attempt.
 */
export function verifySettlerDomain(config: Config): Promise<void> {
  verified ??= (async () => {
    const [, name, version, chainId, verifyingContract] = await readContract(config, {
      address: SETTLER_DOMAIN.verifyingContract,
      abi: eip712DomainAbi,
      functionName: "eip712Domain",
      chainId: SETTLER_DOMAIN.chainId,
    });
    const matches =
      name === SETTLER_DOMAIN.name &&
      version === SETTLER_DOMAIN.version &&
      chainId === BigInt(SETTLER_DOMAIN.chainId) &&
      getAddress(verifyingContract) === getAddress(SETTLER_DOMAIN.verifyingContract);
    if (!matches) {
      throw new Error("The settler's signing domain doesn't match this site's. Nothing was signed; please report this.");
    }
  })().catch((err) => {
    verified = null;
    throw err;
  });
  return verified;
}
