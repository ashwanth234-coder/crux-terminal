const GLYPHS: Record<string, { bg: string; fg: string; d: string }> = {
  NOVA: { bg: "#d4f933", fg: "#050505", d: "M12 4.5 14 10l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2L12 4.5Z" },
  CRUX: { bg: "#111215", fg: "#e0e2ec", d: "M12 5c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7Z" },
  FORM: { bg: "#1b1d22", fg: "#e0e2ec", d: "M7.5 6h9v2.6h-6.2v2.2h5.2v2.6h-5.2V18H7.5V6Z" },
  MIND: { bg: "#1b1d22", fg: "#e0e2ec", d: "M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z" },
};

export function TokenGlyph({ symbol, className = "h-5 w-5" }: { symbol: string; className?: string }) {
  const g = GLYPHS[symbol] ?? GLYPHS.CRUX;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11.5" fill={g.bg} stroke="#2a2d33" />
      <path d={g.d} fill={g.fg} />
    </svg>
  );
}
