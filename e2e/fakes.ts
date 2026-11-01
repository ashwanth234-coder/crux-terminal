// Stand-ins for the browser tests of the order panel (orders.spec): a CRUX Account and a market (through
// lib/testOverrides), an injected wallet that records what it's asked to send, a chain that answers the reads the
// panels make, and the relay's endpoints, which record what the page signed. Keys are throwaway test keys.
import type { Page, Route } from "@playwright/test";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, parseAbi, toFunctionSelector, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const OWNER_KEY = "0x0000000000000000000000000000000000000000000000000000000000c4a2e1" as Hex;
export const WALLET_KEY = "0x0000000000000000000000000000000000000000000000000000000000c4a2e2" as Hex;
export const OWNER = privateKeyToAccount(OWNER_KEY).address;
export const WALLET = privateKeyToAccount(WALLET_KEY).address;
export const ACCOUNT = "0x000000000000000000000000000000000c4a5afe" as const;
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const TOKEN = "0x00000000000000000000000000000000000c4a28";
/** The test pool: 10,000 USDC against 500M tokens ($0.00002 each). */
export const RESERVES = { usdc: BigInt(10_000e6), token: BigInt(5) * BigInt(10) ** BigInt(26) };

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address, uint256) returns (bool)",
]);
const multicall = parseAbi(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])"]);
const TICK_AT = toFunctionSelector("tickAt(uint256,uint256)");

/** Puts the stand-in account, market and (optionally) a connected wallet into the page before it loads. */
export async function installFakes(page: Page, o: { account?: boolean; wallet?: boolean; protected?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await page.addInitScript(
    ({ account, wallet, ownerKey, accountAddress, walletAddress, token, reserves, isProtected, now }) => {
      localStorage.clear();
      // BigInts can't cross into the page as arguments; they're rebuilt here.
      window.__cruxTest = {
        ...(account ? { account: { ownerKey: ownerKey as `0x${string}`, account: accountAddress as `0x${string}`, withdrawalAddress: walletAddress as `0x${string}`, usdc: BigInt(250e6) } } : {}),
        market: {
          [token.toLowerCase()]: {
            reserves: { usdc: BigInt(reserves.usdc), token: BigInt(reserves.token) },
            decimals: 18,
            listed: true,
            ...(isProtected ? { protected: true, protectedUntil: now + 600 } : {}),
          },
        },
      };
      if (!wallet) return;
      // An injected wallet: answers for its account, records what it's asked to send, reads through the fake chain.
      const sent: unknown[] = [];
      (window as unknown as { __walletTxs: unknown[] }).__walletTxs = sent;
      const read = async (method: string, params: unknown) => {
        const r = await fetch("https://fake-chain.test/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw j.error;
        return j.result;
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        isMetaMask: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [walletAddress];
            case "eth_chainId":
              return "0x14a34";
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_getPermissions":
            case "wallet_requestPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "eth_sendTransaction":
              sent.push(params?.[0]);
              return `0x${"cd".repeat(32)}`;
            default:
              return read(method, params ?? []);
          }
        },
        on: () => {},
        removeListener: () => {},
      };
      // Reconnect to it on load, as wagmi does for a wallet used before.
      localStorage.setItem("wagmi.recentConnectorId", '"injected"');
      localStorage.setItem("wagmi.injected.connected", "true");
    },
    {
      account: Boolean(o.account),
      wallet: Boolean(o.wallet),
      ownerKey: OWNER_KEY,
      accountAddress: ACCOUNT,
      walletAddress: WALLET,
      token: TOKEN,
      reserves: { usdc: RESERVES.usdc.toString(), token: RESERVES.token.toString() },
      isProtected: Boolean(o.protected),
      now,
    },
  );
}

/** The fake chain: what a read returns, by method and (for eth_call) by function. Unknown calls revert. */
function answer(method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string } } {
  const now = Math.floor(Date.now() / 1000);
  const block = { number: "0x1000", hash: `0x${"0a".repeat(32)}`, parentHash: `0x${"09".repeat(32)}`, timestamp: `0x${now.toString(16)}`, baseFeePerGas: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [], miner: `0x${"00".repeat(20)}`, extraData: "0x", logsBloom: `0x${"00".repeat(256)}`, difficulty: "0x0", nonce: "0x0000000000000000", sha3Uncles: `0x${"00".repeat(32)}`, size: "0x1", stateRoot: `0x${"00".repeat(32)}`, receiptsRoot: `0x${"00".repeat(32)}`, transactionsRoot: `0x${"00".repeat(32)}`, uncles: [], mixHash: `0x${"00".repeat(32)}` };
  switch (method) {
    case "eth_chainId":
      return { result: "0x14a34" };
    case "net_version":
      return { result: "84532" };
    case "eth_blockNumber":
      return { result: "0x1000" };
    case "eth_getBlockByNumber":
    case "eth_getBlockByHash":
      return { result: block };
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return { result: "0x1" };
    case "eth_feeHistory":
      return { result: { oldestBlock: "0x1000", baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0.5], reward: [["0x1"]] } };
    case "eth_estimateGas":
      return { result: "0x30000" };
    case "eth_getTransactionCount":
      return { result: "0x0" };
    case "eth_getCode":
      return { result: "0x" };
    case "eth_getLogs":
      return { result: [] };
    case "eth_getTransactionReceipt":
      return {
        result: {
          status: "0x1",
          transactionHash: params[0],
          transactionIndex: "0x0",
          blockNumber: "0x1000",
          blockHash: block.hash,
          from: `0x${"00".repeat(20)}`,
          to: USDC,
          logs: [],
          logsBloom: block.logsBloom,
          gasUsed: "0x1",
          cumulativeGasUsed: "0x1",
          effectiveGasPrice: "0x1",
          contractAddress: null,
          type: "0x2",
        },
      };
    case "eth_call": {
      const { to, data } = params[0] as { to: string; data: Hex };
      const r = call(to, data);
      return r === null ? { error: { code: 3, message: "execution reverted" } } : { result: r };
    }
    default:
      return { error: { code: -32601, message: `${method} isn't faked` } };
  }
}

function call(to: string, data: Hex): Hex | null {
  const selector = data.slice(0, 10);
  if (selector === toFunctionSelector(multicall[0])) {
    const { args } = decodeFunctionData({ abi: multicall, data });
    const results = args[0].map((c) => {
      const r = call(c.target, c.callData);
      return { success: r !== null, returnData: r ?? ("0x" as Hex) };
    });
    return encodeFunctionResult({ abi: multicall, functionName: "aggregate3", result: results });
  }
  if (selector === TICK_AT) {
    // The step at or below a limit: the limit itself.
    const price = BigInt(`0x${data.slice(74, 138)}`);
    return encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(7), price]);
  }
  try {
    const { functionName } = decodeFunctionData({ abi: erc20, data });
    if (functionName === "balanceOf") return encodeFunctionResult({ abi: erc20, functionName, result: to.toLowerCase() === USDC.toLowerCase() ? BigInt(300e6) : BigInt(0) });
    if (functionName === "allowance") return encodeFunctionResult({ abi: erc20, functionName, result: BigInt(10) ** BigInt(30) });
    if (functionName === "decimals") return encodeFunctionResult({ abi: erc20, functionName, result: to.toLowerCase() === USDC.toLowerCase() ? 6 : 18 });
    if (functionName === "transfer") return encodeFunctionResult({ abi: erc20, functionName, result: true });
  } catch {
    // Not an ERC-20 call.
  }
  return null;
}

export type RelayCall = { path: string; body: Record<string, unknown> };

/** Serves the chain (relay cache, public nodes, the wallet's reads) and the relay; returns what the page posted. */
export async function routeNetwork(page: Page): Promise<RelayCall[]> {
  const posted: RelayCall[] = [];
  const rpc = async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? "null");
    const calls = Array.isArray(body) ? body : [body];
    const out = calls.map((c: { id: unknown; method: string; params?: unknown[] }) => ({ jsonrpc: "2.0", id: c.id, ...answer(c.method, c.params ?? []) }));
    await route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(Array.isArray(body) ? out : out[0]) });
  };
  for (const host of ["https://fake-chain.test/**", "https://sepolia.base.org/**", "https://base-sepolia-rpc.publicnode.com/**", "https://base-sepolia.gateway.tenderly.co/**"]) {
    await page.route(host, (r) => (r.request().method() === "POST" ? rpc(r) : r.fulfill({ status: 404 })));
  }
  await page.route("https://api.cruxprotocol.xyz/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (path === "/v1/rpc") return rpc(route);
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      posted.push({ path, body });
      const answerBody = path === "/v1/account/trade" ? { ok: true, orderId: `0x${"ee".repeat(32)}` } : { ok: true };
      return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify(answerBody) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ ok: false }) });
  });
  return posted;
}
