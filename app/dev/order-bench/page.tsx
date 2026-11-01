import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderBench } from "./OrderBench";

export const metadata: Metadata = { title: "Order bench · Crux", robots: { index: false, follow: false } };

/**
 * A test-only page with the real order panel and account panel in a chosen state, for the browser tests of buying,
 * slippage and deposits (e2e/orders.spec). Built only when NEXT_PUBLIC_CHART_HARNESS=1, so the live site answers 404.
 */
export default function OrderBenchPage() {
  if (process.env.NEXT_PUBLIC_CHART_HARNESS !== "1") notFound();
  return <OrderBench />;
}
