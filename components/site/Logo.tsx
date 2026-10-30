/**
 * The CRUX mark: four equal, tapered arms converging on one point. Equal arms and concave
 * sides keep it a convergence mark (a compass point, a clearing price), never a cross.
 * Drawn as one closed path so the same geometry serves every version: flat Electric Orange
 * for the favicon and app icon, and a single colour (currentColor) at tiny sizes and in the
 * header logo. The hero emblem (components/site/CruxEmblem.tsx) is a rendered glass and chrome image of it.
 */
export const CRUX_MARK_PATH =
  "M12 0.6 Q12.42 7.1 13.4 10.6 Q16.9 11.58 23.4 12 Q16.9 12.42 13.4 13.4 Q12.42 16.9 12 23.4 Q11.58 16.9 10.6 13.4 Q7.1 12.42 0.6 12 Q7.1 11.58 10.6 10.6 Q11.58 7.1 12 0.6 Z";

export function CruxMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={CRUX_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

/** Mark plus the warm-white wordmark, widely spaced. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <CruxMark className="h-[22px] w-[22px] text-signal" />
      <span className="pl-[0.1em] text-[15px] font-medium tracking-[0.42em] text-chrome">CRUX</span>
    </span>
  );
}
