/**
 * What the coach remembers about today's trading in this browser: whether the trader bought this visit (no "idle cash"
 * nudge right after a buy) and how many Ask Crux sales today were at a loss (after a loss the only suggestion is a
 * break; after two, Crux says so). Browser storage is a convenience: it can be empty, and the page works without it.
 */
const KEY = "crux-coach-today";
let bought = false;

type Day = { day: string; losses: number };
const today = () => new Date().toISOString().slice(0, 10);

function read(): Day {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Day | null;
    return d && d.day === today() ? d : { day: today(), losses: 0 };
  } catch {
    return { day: today(), losses: 0 };
  }
}

export function noteBuy() {
  bought = true;
}

/** A sale finished; `pnlPct` against the average paid, when Crux knows it. Returns today's losses after it. */
export function noteSell(pnlPct?: number): number {
  const d = read();
  if (pnlPct !== undefined && pnlPct < 0) d.losses += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // no storage: the count just doesn't carry over
  }
  return d.losses;
}

export const boughtThisVisit = () => bought;
export const lossesToday = () => read().losses;
