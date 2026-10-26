/**
 * The hero's monumental CRUX mark: the same four-arm geometry as the flat mark (Logo.tsx),
 * faceted along each arm and shaded as titanium, with one small orange light at the centre.
 * Static SVG: linear and radial gradients only, no filters, no script, no motion. Each arm is
 * the top arm rotated about the centre, so the lighting turns with it like a machined part.
 *
 * Support is deliberately sparse: one circle, one horizontal axis, two alignment lines and
 * three control points. The guides drop away below `md`, where the mark is drawn alone.
 */

// Top arm, in the mark's 24-unit space (centre 12,12): the left facet, then the right.
const FACET_L = "M12 12 L10.6 10.6 Q11.58 7.1 12 0.6 Z";
const FACET_R = "M12 12 L12 0.6 Q12.42 7.1 13.4 10.6 Z";
const OUTLINE =
  "M12 0.6 Q12.42 7.1 13.4 10.6 Q16.9 11.58 23.4 12 Q16.9 12.42 13.4 13.4 Q12.42 16.9 12 23.4 Q11.58 16.9 10.6 13.4 Q7.1 12.42 0.6 12 Q7.1 11.58 10.6 10.6 Q11.58 7.1 12 0.6 Z";

// 24 units → 720 of the 800 viewBox: the arms reach 342 from the centre.
const MARK = "translate(400 400) scale(30) translate(-12 -12)";

export function CruxEmblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 800" className={`overflow-visible ${className}`} aria-hidden="true" focusable="false">
      <defs>
        {/* Lit facet: polished bands from tip to centre, warming to orange where the core light hits */}
        <linearGradient id="cx-lit" gradientUnits="userSpaceOnUse" x1="12" y1="0.6" x2="12" y2="12">
          <stop offset="0" stopColor="#4a4e55" />
          <stop offset="0.16" stopColor="#d9d7d1" />
          <stop offset="0.34" stopColor="#f5f3ee" />
          <stop offset="0.5" stopColor="#8b9199" />
          <stop offset="0.66" stopColor="#2c2e33" />
          <stop offset="0.82" stopColor="#c9cbcc" />
          <stop offset="0.93" stopColor="#ffd2bd" />
          <stop offset="1" stopColor="#ff7a45" />
        </linearGradient>
        {/* Shaded facet: dark titanium with one reflected band */}
        <linearGradient id="cx-shade" gradientUnits="userSpaceOnUse" x1="12" y1="0.6" x2="12" y2="12">
          <stop offset="0" stopColor="#1a1b1f" />
          <stop offset="0.28" stopColor="#5d6269" />
          <stop offset="0.46" stopColor="#202226" />
          <stop offset="0.7" stopColor="#141518" />
          <stop offset="0.86" stopColor="#4a4e55" />
          <stop offset="1" stopColor="#c2471c" />
        </linearGradient>
        {/* Specular ridge along each arm's axis */}
        <linearGradient id="cx-ridge" gradientUnits="userSpaceOnUse" x1="12" y1="0.6" x2="12" y2="12">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="0.85" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffb08a" stopOpacity="0" />
        </linearGradient>
        {/* Orange rim light on the edges nearest the core, gone by mid-arm */}
        <radialGradient id="cx-rim" gradientUnits="userSpaceOnUse" cx="12" cy="12" r="7">
          <stop offset="0" stopColor="#e35d2b" stopOpacity="1" />
          <stop offset="0.45" stopColor="#e35d2b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e35d2b" stopOpacity="0" />
        </radialGradient>
        {/* The core: a small, controlled light */}
        <radialGradient id="cx-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6ef" />
          <stop offset="0.1" stopColor="#ffc3a6" />
          <stop offset="0.3" stopColor="#e35d2b" stopOpacity="0.85" />
          <stop offset="0.62" stopColor="#e35d2b" stopOpacity="0.16" />
          <stop offset="1" stopColor="#e35d2b" stopOpacity="0" />
        </radialGradient>
        {/* The axis: titanium at its ends, Signal Orange where it passes the core */}
        <linearGradient id="cx-axis" gradientUnits="userSpaceOnUse" x1="-240" y1="0" x2="1040" y2="0">
          <stop offset="0" stopColor="#a7adb5" stopOpacity="0" />
          <stop offset="0.3" stopColor="#a7adb5" stopOpacity="0.3" />
          <stop offset="0.47" stopColor="#e35d2b" stopOpacity="0.9" />
          <stop offset="0.53" stopColor="#e35d2b" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="#a7adb5" stopOpacity="0.3" />
          <stop offset="1" stopColor="#a7adb5" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Guides */}
      <g className="max-md:hidden">
        <circle cx="400" cy="400" r="300" fill="none" stroke="#a7adb5" strokeOpacity="0.24" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M452 348 L612 188" stroke="#a7adb5" strokeOpacity="0.32" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M348 452 L188 612" stroke="#a7adb5" strokeOpacity="0.32" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <path d="M188 612 A300 300 0 0 0 400 700" fill="none" stroke="#a7adb5" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
      </g>
      <line x1="-240" y1="400" x2="1040" y2="400" stroke="url(#cx-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />

      {/* The mark */}
      <g transform={MARK}>
        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 12 12)`}>
            <path d={FACET_L} fill="url(#cx-lit)" />
            <path d={FACET_R} fill="url(#cx-shade)" />
            <path d="M12 0.9 L12 11.4" stroke="url(#cx-ridge)" strokeWidth="0.045" />
          </g>
        ))}
        <path d={OUTLINE} fill="none" stroke="#a7adb5" strokeOpacity="0.35" strokeWidth="0.03" strokeLinejoin="round" />
        <path d={OUTLINE} fill="none" stroke="url(#cx-rim)" strokeWidth="0.07" strokeLinejoin="round" />
      </g>
      <circle cx="400" cy="400" r="58" fill="url(#cx-core)" />

      {/* Control points */}
      <g className="max-md:hidden" fill="#e35d2b">
        <rect x="608" y="184" width="8" height="8" />
        <rect x="184" y="608" width="8" height="8" />
        <rect x="699" y="394" width="2" height="12" />
      </g>
    </svg>
  );
}
