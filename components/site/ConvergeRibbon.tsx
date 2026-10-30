"use client";

import { useEffect, useRef } from "react";
import { LANDING_CHAINS, chainGlyph, type ChainKey } from "./ChainMarks";

/**
 * The close's centrepiece: nine liquid-chrome strands in a glass capsule, loose and rippling on the left, converging
 * into one orange core on the right, beside Enter Crux: many routes, one execution. Four strands start at a chain's mark
 * (Ethereum, BNB Chain, Solana, and Robinhood Chain dimmed as Soon) and the core is Base, where everything settles. The strands bend towards the
 * pointer like liquid metal, and the chrome bands shimmer as they move; entering or tapping the capsule sends an orange
 * pulse down every strand into the core, which flares. With no pointer they drift slowly. prefers-reduced-motion
 * draws them once, still. The capsule is black glass in both themes. SVG paths rebuilt per frame (9 x 97 points), only while on screen.
 */

const STRANDS = 9;
const WIDTHS = [1.1, 1.5, 2, 2.6, 3.6, 2.6, 2, 1.5, 1.1];
const POINTS = 96;
const PULSE_MS = 1100;
const SPARK = 0.14; // dash length, in path lengths
/** Which strands leave from a chain's mark; the rest are unlabelled routes. */
const ROUTES: [strand: number, chain: ChainKey][] = [
  [1, "ethereum"],
  [3, "bnb"],
  [5, "solana"],
  [7, "robinhood"],
];
const MARK_PX = 16;

export function ConvergeRibbon({ className = "" }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pulseAt = useRef(-Infinity);

  useEffect(() => {
    const el = box.current;
    const s = svg.current;
    if (!el || !s) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bodies = [...s.querySelectorAll<SVGPathElement>("[data-body]")];
    const lights = [...s.querySelectorAll<SVGPathElement>("[data-light]")];
    const sparks = [...s.querySelectorAll<SVGPathElement>("[data-spark]")];
    const heats = [...s.querySelectorAll<SVGPathElement>("[data-heat]")];
    const heat = s.querySelector<SVGLinearGradientElement>("#cr-heat")!;
    const glints = [...s.querySelectorAll<SVGEllipseElement>("[data-glint]")];
    const fade = s.querySelector<SVGLinearGradientElement>("#cr-fade")!;
    const chrome = s.querySelector<SVGLinearGradientElement>("#cr-chrome")!;
    const halo = s.querySelector<SVGCircleElement>("[data-halo]")!;
    const dot = s.querySelector<SVGCircleElement>("[data-dot]")!;
    const tail = s.querySelector<SVGLineElement>("[data-tail]")!;
    const routes = [...s.querySelectorAll<SVGGElement>("[data-route]")];
    const baseLabel = s.querySelector<SVGGElement>("[data-base]")!;

    let w = 0;
    let h = 0;
    const ptr = { x: 0, y: 0, near: false };
    let pull = 0;
    let px = 0;
    let py = 0;
    let kick = 0;
    let raf = 0;
    let visible = true;

    const strand = (i: number, t: number) => {
      const mid = h / 2;
      const startX = h * 0.42;
      const endX = w - h / 2;
      const sigma = Math.max(60, w * 0.09);
      let d = "";
      for (let k = 0; k <= POINTS; k++) {
        const u = k / POINTS;
        const x = startX + (endX - startX) * u;
        const free = (1 - u) ** 1.6; // 1 on the left, 0 at the core: everything converges
        const spread = (i - (STRANDS - 1) / 2) * h * 0.1 * free;
        const wave =
          Math.sin(u * 8.5 + t * 0.0011 * (1 + i * 0.14) + i * 1.7) * h * 0.16 * free +
          Math.sin(u * 22 - t * 0.0017 + i * 2.3) * h * 0.025 * free;
        const lift = (py - mid) * 0.8 * pull * Math.exp(-((x - px) ** 2) / (2 * sigma * sigma)) * Math.sqrt(free);
        const room = h / 2 - 8; // soft limit: strands ease towards the glass edge instead of flattening on it
        const pin = Math.min(1, u / 0.22) ** 2; // the start stays on its chain's mark; the motion grows from there
        const y = mid + room * Math.tanh((spread + pin * (wave + lift)) / room);
        d += `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    };

    const draw = (t: number) => {
      if (!w || !h) return;
      for (let i = 0; i < STRANDS; i++) {
        const d = strand(i, t);
        bodies[i].setAttribute("d", d);
        lights[i].setAttribute("d", d);
        heats[i].setAttribute("d", d);
        sparks[i * 2].setAttribute("d", d);
        sparks[i * 2 + 1].setAttribute("d", d);
      }
      const p = (t - pulseAt.current) / PULSE_MS;
      const live = p >= 0 && p <= 1;
      const offset = (SPARK - Math.min(1, Math.max(0, p)) * (1 + SPARK)).toFixed(3);
      for (const sp of sparks) {
        sp.setAttribute("stroke-dashoffset", offset);
        sp.style.opacity = live ? sp.dataset.spark! : "0";
      }
      // Each chain's mark lights in its own colour as the pulse leaves it.
      const lit = p >= 0 && p < 0.35;
      for (const g of routes) g.style.color = lit ? g.dataset.color! : "#ffffff";
      if (p > 0.92 && p < 1.05) kick = 1;
      kick *= 0.93;
      halo.setAttribute("r", (h * (0.5 + kick * 0.3)).toFixed(1));
      const flare = 1 + kick * 0.6;
      glints[0].setAttribute("rx", (h * 1.5 * flare).toFixed(1));
      glints[1].setAttribute("ry", (h * 0.42 * flare).toFixed(1));
      for (const g of glints) g.style.opacity = (0.7 + kick * 0.3).toFixed(3);
      halo.style.opacity = (0.55 + kick * 0.45).toFixed(3);
      dot.setAttribute("r", (2.6 + kick * 1.6).toFixed(2));
      el.style.setProperty("--sx", `${((px / w) * 100).toFixed(1)}%`);
    };

    const resize = () => {
      const r = el.getBoundingClientRect();
      w = r.width;
      h = r.height;
      s.setAttribute("viewBox", `0 0 ${w} ${h}`);
      chrome.setAttribute("y2", String(h));
      fade.setAttribute("x1", String(h * 0.3));
      fade.setAttribute("x2", String(h * 0.42 + w * 0.05));
      heat.setAttribute("x1", String(w * 0.4));
      heat.setAttribute("x2", String(w - h / 2));
      for (const c of [halo, dot, ...glints]) {
        c.setAttribute("cx", String(w - h / 2));
        c.setAttribute("cy", String(h / 2));
      }
      tail.setAttribute("x1", String(w - h / 2));
      tail.setAttribute("x2", String(w));
      tail.setAttribute("y1", String(h / 2));
      tail.setAttribute("y2", String(h / 2));
      const room = h / 2 - 8;
      routes.forEach((g, n) => {
        const y = h / 2 + room * Math.tanh(((ROUTES[n][0] - (STRANDS - 1) / 2) * h * 0.1) / room);
        const scale = MARK_PX / 24;
        g.setAttribute("transform", `translate(${(h * 0.24 - MARK_PX / 2).toFixed(1)} ${(y - MARK_PX / 2).toFixed(1)}) scale(${scale})`);
      });
      baseLabel.setAttribute("transform", `translate(${(w - h * 0.5).toFixed(1)} ${(h - 16).toFixed(1)})`);
      if (!px) px = w * 0.35;
      if (!py) py = h / 2;
      draw(still ? 0 : performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    if (still) return () => ro.disconnect();

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.near = ptr.x > -80 && ptr.x < r.width + 80 && ptr.y > -140 && ptr.y < r.height + 140;
    };
    const tick = (t: number) => {
      pull += ((ptr.near ? 1 : 0) - pull) * 0.06;
      if (ptr.near) {
        px += (ptr.x - px) * 0.12;
        py += (Math.min(h * 1.4, Math.max(-h * 0.4, ptr.y)) - py) * 0.12;
      }
      draw(t);
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const pulse = () => {
    const now = performance.now();
    if (now - pulseAt.current > PULSE_MS * 0.6) pulseAt.current = now;
  };

  // Black glass in both themes, like the hero lens, so the chrome reads the same on a white page.
  const tint = (pct: number) => `rgb(255 255 255 / ${pct / 100})`;

  return (
    <div
      ref={box}
      aria-hidden="true"
      onPointerEnter={pulse}
      onPointerDown={pulse}
      className={`relative cursor-crosshair select-none overflow-hidden rounded-full [--sx:35%] ${className}`}
      style={{
        background: `radial-gradient(60% 140% at var(--sx) 0%, ${tint(9)}, transparent 70%), radial-gradient(28% 90% at 100% 50%, rgb(255 85 0 / 0.16), transparent 70%), linear-gradient(180deg, ${tint(6)}, ${tint(1.5)} 55%, ${tint(4)}), #050505`,
        boxShadow: `inset 0 0 0 1px ${tint(13)}, inset 0 1px 0 ${tint(22)}, inset 0 -18px 36px -18px rgb(0 0 0 / 0.5)`,
      }}
    >
      {/* Specular highlight along the top of the glass, and its faint echo at the bottom */}
      <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(55)}, transparent)` }} />
      <div className="pointer-events-none absolute inset-x-[20%] bottom-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(18)}, transparent)` }} />

      <svg ref={svg} className="absolute inset-0 h-full w-full">
        <defs>
          {/* Liquid chrome: hard horizon bands in user space, so strands shimmer as they cross them */}
          <linearGradient id="cr-chrome" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="120">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.18" stopColor="#aeb5bf" />
            <stop offset="0.34" stopColor="#2a2e35" />
            <stop offset="0.44" stopColor="#565d67" />
            <stop offset="0.5" stopColor="#f7f9fb" />
            <stop offset="0.6" stopColor="#8c939e" />
            <stop offset="0.74" stopColor="#1d2026" />
            <stop offset="0.88" stopColor="#c4cad2" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
          {/* Heat: the strands warm to orange as they converge */}
          <linearGradient id="cr-heat" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
            <stop offset="0" stopColor="#ff5500" stopOpacity="0" />
            <stop offset="0.6" stopColor="#ff5500" stopOpacity="0.25" />
            <stop offset="1" stopColor="#ff7a3d" stopOpacity="0.95" />
          </linearGradient>
          {/* The strands rise out of the glass on the left rather than starting at a hard edge */}
          <linearGradient id="cr-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
          <mask id="cr-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="url(#cr-fade)" />
          </mask>
          <radialGradient id="cr-glint">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.25" stopColor="#ffb48a" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ff5500" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cr-core">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.12" stopColor="#ffd6ba" />
            <stop offset="0.3" stopColor="#ff5500" stopOpacity="0.9" />
            <stop offset="0.62" stopColor="#ff5500" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ff5500" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* One clean orange line out of the core: what comes out is a single execution */}
        <line data-tail stroke="#ff5500" strokeOpacity="0.7" strokeWidth="1" />

        <g mask="url(#cr-mask)">
        {Array.from({ length: STRANDS }, (_, i) => (
          <path key={`b${i}`} data-body fill="none" stroke="url(#cr-chrome)" strokeWidth={WIDTHS[i]} opacity={i === 7 ? 0.4 : 1} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {Array.from({ length: STRANDS }, (_, i) => (
          <path key={`h${i}`} data-heat fill="none" stroke="url(#cr-heat)" strokeWidth={WIDTHS[i] + 0.6} strokeLinecap="round" style={{ mixBlendMode: "screen" }} />
        ))}
        <g transform="translate(0 -0.8)">
          {Array.from({ length: STRANDS }, (_, i) => (
            <path key={`l${i}`} data-light fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.6" strokeLinecap="round" />
          ))}
        </g>
        {Array.from({ length: STRANDS }, (_, i) => [
          <path key={`g${i}`} data-spark="0.3" pathLength={1} fill="none" stroke="#ff5500" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${SPARK} 2`} opacity="0" />,
          <path key={`s${i}`} data-spark="1" pathLength={1} fill="none" stroke="#ff7a3d" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${SPARK} 2`} opacity="0" />,
        ])}
        </g>

        {/* The chains the routes leave from; Robinhood Chain is dimmed until it is live */}
        {ROUTES.map(([, key]) => {
          const c = LANDING_CHAINS.find((x) => x.key === key)!;
          return (
            <g key={key} data-route data-color={c.color} opacity={c.live ? 0.85 : 0.35} style={{ color: "#ffffff", transition: "color 200ms" }}>
              <title>{`${c.name}: ${c.network}`}</title>
              {chainGlyph(key)}
            </g>
          );
        })}

        <circle data-halo fill="url(#cr-core)" />
        {/* A four-point glint at the core, echoing the CRUX star */}
        <ellipse data-glint ry="1.4" fill="url(#cr-glint)" />
        <ellipse data-glint rx="1.2" fill="url(#cr-glint)" />
        <circle data-dot fill="#ffffff" />
        {/* Where it all lands */}
        <g data-base style={{ ["--notch" as string]: "#050505" }}>
          <g transform="translate(-34 -9) scale(0.5)" style={{ color: "#ffffff" }}>
            {chainGlyph("base")}
          </g>
          <text x="-20" y="0" fill="#ffffff" fillOpacity="0.75" fontSize="9.5" letterSpacing="1.6" className="font-mono uppercase">
            Base
          </text>
        </g>
      </svg>
    </div>
  );
}
