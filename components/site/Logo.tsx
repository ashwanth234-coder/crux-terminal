/**
 * The CRUX mark: a bold X whose four arms meet around a diamond cut out of its centre, the crux where every chain's
 * route converges on one pool. Square-cut ends and straight edges keep it a letter and a mark at once: it stands alone
 * as the icon, and it is the X of the wordmark ("CRU" + mark). One path with the diamond as a second subpath (fill-rule
 * evenodd), so the same geometry serves every version: flat Electric Orange for the favicon, app icon and OG image, and
 * a single colour (currentColor) at tiny sizes and in the header. The hero (components/site/CruxEmblem.tsx) sets it in
 * a glass lens.
 */
export const CRUX_MARK_PATH = "M2 2 H6 L12 8 L18 2 H22 V6 L16 12 L22 18 V22 H18 L12 16 L6 22 H2 V18 L8 12 L2 6 Z M12 9.8 L14.2 12 L12 14.2 L9.8 12 Z";

export function CruxMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={CRUX_MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** The wordmark: "CRU" in warm white, widely spaced, with the mark as its X (sized to the capitals). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="Crux" className={`inline-flex items-center ${className}`}>
      <span aria-hidden="true" className="pl-[0.1em] text-[15px] font-medium leading-none tracking-[0.42em] text-chrome">
        CRU
      </span>
      <CruxMark className="h-[13px] w-[13px] text-signal" />
    </span>
  );
}
