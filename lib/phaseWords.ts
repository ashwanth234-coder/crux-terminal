import type { Phase } from "./launch.ts";

/**
 * A launch's status in the words a first-time buyer understands, the same on every screen. The closing seconds and the
 * moment the price is set read as the opening (it settles on its own), and a launch that missed its goal reads as what
 * happened to the buyers' money.
 */
export const PHASE_WORDS: Record<Phase, string> = {
  scheduled: "Opens soon",
  open: "Opening now",
  closed: "Opening now",
  settled: "Live",
  graduated: "Live",
  cancelled: "Refunded",
};
