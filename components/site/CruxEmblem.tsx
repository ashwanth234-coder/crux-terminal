import { CRUX_MARK_PATH } from "./Logo";

/**
 * The hero's CRUX emblem: the four-arm mark (Logo.tsx) cast in liquid chrome, floating in a glass disc, with one
 * Electric Orange core of light where the arms converge. Static SVG: gradients only, no filters, script or motion, so it
 * stays crisp at any size. The glass edges are drawn in the theme tint (white on black, black on white) and the chrome
 * reads on both grounds.
 */

// 24 units → 480 of the 800 viewBox: the arms reach 228 from the centre, inside the 300-radius glass.
const MARK = "translate(400 400) scale(20) translate(-12 -12)";
const TINT = { stopColor: "var(--color-tint)" };

export function CruxEmblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 800" className={`overflow-visible ${className}`} aria-hidden="true" focusable="false">
      <defs>
        {/* Glass body: a faint lit pane, brighter where the light enters at the top left */}
        <radialGradient id="cx-glass" cx="0.34" cy="0.26" r="0.85">
          <stop offset="0" style={TINT} stopOpacity="0.13" />
          <stop offset="0.45" style={TINT} stopOpacity="0.045" />
          <stop offset="1" style={TINT} stopOpacity="0.015" />
        </radialGradient>
        {/* Glass rim: catches the light at the top left, falls away at the bottom right */}
        <linearGradient id="cx-rim" x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" style={TINT} stopOpacity="0.6" />
          <stop offset="0.45" style={TINT} stopOpacity="0.12" />
          <stop offset="1" style={TINT} stopOpacity="0.3" />
        </linearGradient>
        {/* Specular arc on the glass */}
        <linearGradient id="cx-spec" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={TINT} stopOpacity="0" />
          <stop offset="0.5" style={TINT} stopOpacity="0.55" />
          <stop offset="1" style={TINT} stopOpacity="0" />
        </linearGradient>
        {/* Liquid chrome: hard reflective bands across the whole mark, the way polished metal mirrors a horizon */}
        <linearGradient id="cx-chrome" gradientUnits="userSpaceOnUse" x1="3" y1="1" x2="21" y2="23">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.16" stopColor="#d6dbe2" />
          <stop offset="0.3" stopColor="#6b727d" />
          <stop offset="0.4" stopColor="#15171b" />
          <stop offset="0.47" stopColor="#3a3f47" />
          <stop offset="0.5" stopColor="#f4f6f9" />
          <stop offset="0.58" stopColor="#a4abb6" />
          <stop offset="0.72" stopColor="#23262c" />
          <stop offset="0.86" stopColor="#c9ced6" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        {/* A soft horizon sheen over the chrome, so it reads as liquid rather than flat */}
        <linearGradient id="cx-sheen" gradientUnits="userSpaceOnUse" x1="12" y1="0.6" x2="12" y2="23.4">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.38" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.62" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        {/* The core: Electric Orange light at the convergence point */}
        <radialGradient id="cx-core">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.14" stopColor="#ffd2b8" />
          <stop offset="0.32" stopColor="#ff5500" stopOpacity="0.95" />
          <stop offset="0.65" stopColor="#ff5500" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff5500" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* One hairline axis through the centre: the precision line */}
      <line x1="40" y1="400" x2="760" y2="400" style={{ stroke: "var(--color-tint)" }} strokeOpacity="0.1" strokeWidth="1" />

      {/* The glass disc: body, outer rim, inner rim, and the specular arc at the top left */}
      <circle cx="400" cy="400" r="300" fill="url(#cx-glass)" />
      <circle cx="400" cy="400" r="300" fill="none" stroke="url(#cx-rim)" strokeWidth="1.6" />
      <circle cx="400" cy="400" r="284" fill="none" style={{ stroke: "var(--color-tint)" }} strokeOpacity="0.06" strokeWidth="1" />
      <path d="M 158 290 A 266 266 0 0 1 290 158" fill="none" stroke="url(#cx-spec)" strokeWidth="2.4" strokeLinecap="round" />
      {/* Its faint reflection on the far side of the glass */}
      <path d="M 642 510 A 266 266 0 0 1 510 642" fill="none" stroke="url(#cx-spec)" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />

      {/* The mark in liquid chrome, a sheen over it, and a thin specular edge */}
      <g transform={MARK}>
        <path d={CRUX_MARK_PATH} fill="url(#cx-chrome)" />
        <path d={CRUX_MARK_PATH} fill="url(#cx-sheen)" />
        <path d={CRUX_MARK_PATH} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.06" strokeLinejoin="round" />
      </g>

      {/* The core of light, and one orange point on the rim */}
      <circle cx="400" cy="400" r="34" fill="url(#cx-core)" />
      <circle cx="612" cy="188" r="4.5" fill="#ff5500" />
    </svg>
  );
}
