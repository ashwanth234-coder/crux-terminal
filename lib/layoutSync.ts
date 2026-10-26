import { keccak256, toHex, type Address } from "viem";
import { ACCOUNT_FACTORY_V2, type AccountSigner } from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { postRelay } from "@/lib/session";

/**
 * Chart layouts that follow the trader between devices: saved under their login key at the relay, signed silently,
 * so only they can read or overwrite them. Mirrors crux-solver layouts.ts.
 */
export const LAYOUT_TYPES = {
  SaveLayout: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "layoutHash", type: "bytes32" },
    { name: "savedAt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  LoadLayout: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const domain = { name: "Crux Layouts", version: "1", chainId: TESTNET.id, verifyingContract: ACCOUNT_FACTORY_V2 };
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);

export async function loadRemoteLayout(sign: AccountSigner, owner: Address, token: Address): Promise<{ layout: string; savedAt: number } | null> {
  const message = { owner, token, deadline: deadline() };
  const signature = await sign({ domain, types: { LoadLayout: LAYOUT_TYPES.LoadLayout }, primaryType: "LoadLayout", message });
  const data = await postRelay("/v1/layouts/load", { ...message, deadline: message.deadline.toString(), signature });
  return typeof data.layout === "string" && typeof data.savedAt === "number" ? { layout: data.layout, savedAt: data.savedAt } : null;
}

export async function saveRemoteLayout(sign: AccountSigner, owner: Address, token: Address, layout: string, savedAt: number) {
  const message = { owner, token, layoutHash: keccak256(toHex(layout)), savedAt: BigInt(savedAt), deadline: deadline() };
  const signature = await sign({ domain, types: { SaveLayout: LAYOUT_TYPES.SaveLayout }, primaryType: "SaveLayout", message });
  await postRelay("/v1/layouts/save", { owner, token, layout, savedAt: String(savedAt), deadline: message.deadline.toString(), signature });
}
