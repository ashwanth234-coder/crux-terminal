/**
 * Crux mark: a concave four-point star rotated into an "X", drawn as two
 * nested wireframe outlines. The same outline drives the 3D coin emboss
 * (see `starOutline` in components/canvas/geometry.ts).
 */
export const CRUX_STAR_PATH =
  "M12 1.2 Q13.1 10.9 22.8 12 Q13.1 13.1 12 22.8 Q10.9 13.1 1.2 12 Q10.9 10.9 12 1.2 Z";
const CRUX_STAR_INNER =
  "M12 6.4 Q12.6 11.4 17.6 12 Q12.6 12.6 12 17.6 Q11.4 12.6 6.4 12 Q11.4 11.4 12 6.4 Z";

export function CruxMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g transform="rotate(45 12 12)" stroke="currentColor" strokeLinejoin="round">
        <path d={CRUX_STAR_PATH} strokeWidth="1.25" />
        <path d={CRUX_STAR_INNER} strokeWidth="0.9" opacity="0.7" />
        <path d="M12 1.2 V22.8 M1.2 12 H22.8" strokeWidth="0.5" opacity="0.35" />
      </g>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <CruxMark className="h-8 w-8 text-acid" />
      <span className="font-display-md text-[19px] tracking-[0.32em] text-chrome">CRUX</span>
    </span>
  );
}
