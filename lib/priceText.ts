const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/**
 * "0.00000000232" → "0.0₈232": a number with four or more zeros after the point, its zeros counted in a subscript, as
 * DEX Screener and most terminals write sub-cent prices. Anything else is returned unchanged.
 */
export function compactZeros(text: string): string {
  const m = /^(-?)0\.(0{4,})(\d+)$/.exec(text);
  if (!m) return text;
  const count = [...String(m[2].length)].map((d) => SUBSCRIPT[Number(d)]).join("");
  return `${m[1]}0.0${count}${m[3]}`;
}
