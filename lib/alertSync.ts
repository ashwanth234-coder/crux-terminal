"use client";

import { keccak256, toHex, type Address } from "viem";
import { ACCOUNT_FACTORY_V2, type AccountSigner } from "@/lib/account";
import { TESTNET } from "@/lib/chains";
import { RELAY_URL, postRelay } from "@/lib/session";

/**
 * Chart alerts that reach the trader with Crux closed: the relay watches their price levels and indicator rules and
 * sends web push notifications to the devices they turned it on for. Every request is signed by the login key,
 * silently. Mirrors crux-solver alerts.ts.
 */
export const ALERT_TYPES = {
  SubscribePush: [
    { name: "owner", type: "address" },
    { name: "endpointHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  SetAlerts: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "payloadHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  GetAlerts: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const domain = { name: "Crux Alerts", version: "1", chainId: TESTNET.id, verifyingContract: ACCOUNT_FACTORY_V2 };
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);
const PUSH_KEY = "crux:push:on:v1";

/** Whether this browser can receive push at all (iPhone: only from the home-screen app). */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Whether push is on for this browser (it subscribed, and permission still stands). */
export function pushOn(): boolean {
  try {
    return pushSupported() && Notification.permission === "granted" && localStorage.getItem(PUSH_KEY) === "1";
  } catch {
    return false;
  }
}

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Turns on push for this browser: permission, a push subscription, and the relay told (signed). */
export async function enablePush(sign: AccountSigner, owner: Address): Promise<void> {
  if (!pushSupported()) throw new Error("This browser can't receive notifications. On iPhone, add Crux to your home screen first.");
  const health = (await fetch(`${RELAY_URL}/v1/health`).then((r) => r.json())) as { alerts?: boolean; vapidPublicKey?: string };
  if (!health.alerts || !health.vapidPublicKey) throw new Error("Alerts with Crux closed aren't switched on at the relay yet.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in the browser's site settings.");
  const reg = await navigator.serviceWorker.register("/crux-sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(health.vapidPublicKey) }));
  const json = sub.toJSON();
  const message = { owner, endpointHash: keccak256(toHex(json.endpoint!)), deadline: deadline() };
  const signature = await sign({ domain, types: { SubscribePush: ALERT_TYPES.SubscribePush }, primaryType: "SubscribePush", message });
  await postRelay("/v1/alerts/subscribe", { owner, subscription: { endpoint: json.endpoint, keys: json.keys }, deadline: message.deadline.toString(), signature });
  try {
    localStorage.setItem(PUSH_KEY, "1");
  } catch {
    // The relay has it; this browser just won't remember it showed the switch on.
  }
}

export type ServerAlerts = { prices: number[]; rules: unknown[]; updatedAt: number | null };

/** The token's alerts still pending at the relay (one-shot ones that fired are gone). */
export async function getServerAlerts(sign: AccountSigner, owner: Address, token: Address): Promise<ServerAlerts> {
  const message = { owner, token, deadline: deadline() };
  const signature = await sign({ domain, types: { GetAlerts: ALERT_TYPES.GetAlerts }, primaryType: "GetAlerts", message });
  const d = await postRelay("/v1/alerts/get", { owner, token, deadline: message.deadline.toString(), signature });
  return { prices: (d.prices as number[]) ?? [], rules: (d.rules as unknown[]) ?? [], updatedAt: (d.updatedAt as number | null) ?? null };
}

/** Replaces the token's alerts at the relay with the chart's. */
export async function setServerAlerts(sign: AccountSigner, owner: Address, token: Address, payload: object) {
  const raw = JSON.stringify(payload);
  const message = { owner, token, payloadHash: keccak256(toHex(raw)), deadline: deadline() };
  const signature = await sign({ domain, types: { SetAlerts: ALERT_TYPES.SetAlerts }, primaryType: "SetAlerts", message });
  await postRelay("/v1/alerts/set", { owner, token, payload: raw, deadline: message.deadline.toString(), signature });
}
