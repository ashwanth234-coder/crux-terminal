import type { Address } from "viem";

/**
 * A creator's first buy that couldn't be placed right after the launch (the relay didn't know the launch yet): kept for
 * this tab, so the launch page can say so and the creator buys it there before the opening.
 */
const key = (token: Address) => `crux.firstBuyFailed.${token.toLowerCase()}`;

export function markFirstBuyFailed(token: Address, quote: bigint) {
  try {
    sessionStorage.setItem(key(token), quote.toString());
  } catch {
    // Private mode or storage off: the launch page simply won't show the note.
  }
}

/** The amount of a first buy that failed for this token (the note only shows before the launch goes live). */
export function firstBuyFailed(token: Address): bigint | null {
  try {
    const v = sessionStorage.getItem(key(token));
    return v === null ? null : BigInt(v);
  } catch {
    return null;
  }
}

/**
 * A launch this browser just made through the launch form, whose copycat check (ticker, artwork, X link) passed: the
 * countdown says so. Launches made some other way show no such line (nothing here vouches for them).
 */
const checkedKey = (token: Address) => `crux.launchChecked.${token.toLowerCase()}`;

export function markLaunchChecked(token: Address) {
  try {
    sessionStorage.setItem(checkedKey(token), "1");
  } catch {
    // Storage off: the countdown just won't list the check.
  }
}

export function launchChecked(token: Address): boolean {
  try {
    return sessionStorage.getItem(checkedKey(token)) === "1";
  } catch {
    return false;
  }
}
