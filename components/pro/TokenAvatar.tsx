"use client";

import { useState } from "react";
import type { Address } from "viem";

/** 5×5 mirrored pattern from the contract address: every token gets a stable, recognisable mark. */
function cells(address: Address) {
  const hex = address.slice(2).toLowerCase();
  const on: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) on.push(parseInt(hex[(row * 3 + col) % hex.length], 16) % 2 === 0);
  }
  return Array.from({ length: 25 }, (_, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    return on[row * 3 + (col > 2 ? 4 - col : col)];
  });
}

/**
 * The token's logo: the image the creator gave at launch (https only), or a generated identicon. Never a
 * stock or invented logo.
 */
export function TokenAvatar({ token, image, symbol, size = 44 }: { token: Address; image: string | null; symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- creator-supplied remote logo; next/image would need every host allow-listed
      <img
        src={image}
        alt={`${symbol} logo`}
        style={box}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-[6px] border border-line-2 bg-panel object-cover"
      />
    );
  }
  const grid = cells(token);
  return (
    // Padding in px: a percentage would resolve against the parent's width, not the avatar's.
    <span style={{ ...box, padding: Math.round(size * 0.18) }} className="grid shrink-0 grid-cols-5 gap-px rounded-[6px] border border-line-2 bg-panel" role="img" aria-label={`${symbol} mark`}>
      {grid.map((on, i) => (
        <span key={i} className={on ? "bg-chrome/80" : "bg-transparent"} />
      ))}
    </span>
  );
}
