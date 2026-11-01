import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChartBench } from "./ChartBench";

export const metadata: Metadata = { title: "Chart bench · Crux", robots: { index: false, follow: false } };

/**
 * A test-only chart fed with synthetic trades (no chain reads): the load test and the browser interaction tests
 * (e2e/) run against it. Built only when NEXT_PUBLIC_CHART_HARNESS=1, so the live site answers 404.
 */
export default function ChartBenchPage() {
  if (process.env.NEXT_PUBLIC_CHART_HARNESS !== "1") notFound();
  return <ChartBench />;
}
