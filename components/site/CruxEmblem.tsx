"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/**
 * The hero's CRUX emblem: the glass and liquid-chrome star (public/crux-emblem.webp) in a black lens. It follows the
 * pointer anywhere on the page: the star tilts towards it, a reflection slides across the chrome, and the orange core
 * brightens as the pointer nears it; a tap sends one pulse out from the core. With no pointer it drifts slowly.
 * prefers-reduced-motion keeps it still. On black the lens is invisible; on the light theme it reads as a glass disc.
 */

const MAX_TILT = 14; // degrees
const IDLE_AFTER = 3000; // ms without pointer movement before the slow drift takes over

export function CruxEmblem({ className = "" }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const kick = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let target = { x: 0, y: 0, near: 0 };
    let now = { x: 0, y: 0, near: 0 };
    let lastMove = -Infinity;
    let raf = 0;
    let visible = true;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const clamp = (v: number) => Math.max(-1.4, Math.min(1.4, v));
      target = { x: clamp(dx), y: clamp(dy), near: Math.max(0, 1 - Math.hypot(dx, dy) / 1.1) };
      lastMove = performance.now();
    };

    const tick = (t: number) => {
      if (t - lastMove > IDLE_AFTER) target = { x: Math.sin(t / 2600) * 0.4, y: Math.cos(t / 3400) * 0.3, near: 0.15 + Math.sin(t / 1800) * 0.1 };
      now = { x: now.x + (target.x - now.x) * 0.07, y: now.y + (target.y - now.y) * 0.07, near: now.near + (target.near - now.near) * 0.08 };
      kick.current *= 0.94;
      el.style.setProperty("--rx", `${(-now.y * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(now.x * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(50 + now.x * 38).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(50 + now.y * 38).toFixed(1)}%`);
      el.style.setProperty("--glow", Math.min(1, now.near + kick.current).toFixed(3));
      raf = visible ? requestAnimationFrame(tick) : 0;
    };

    // Only animate while the emblem is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const pulse = () => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    kick.current = 1;
    const ring = document.createElement("span");
    ring.className = "crux-pulse";
    ring.addEventListener("animationend", () => ring.remove());
    el.querySelector("[data-stage]")?.appendChild(ring);
  };

  return (
    <div
      ref={root}
      aria-hidden="true"
      onPointerDown={pulse}
      className={`relative cursor-crosshair select-none [perspective:1100px] [--glow:0.2] [--gx:50%] [--gy:50%] [--rx:0deg] [--ry:0deg] ${className}`}
    >
      <div data-stage className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(var(--rx))_rotateY(var(--ry))] will-change-transform">
        {/* The lens: black glass, so the image's black ground disappears on the dark theme */}
        <div className="absolute inset-0 isolate overflow-hidden rounded-full bg-black ring-1 ring-tint/10">
          <Image src="/crux-emblem.webp" alt="" fill priority sizes="(min-width: 768px) 480px, 300px" className="pointer-events-none object-cover" draggable={false} />
          {/* A reflection that follows the pointer; overlay leaves the black untouched and lifts only the chrome */}
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{ background: "radial-gradient(circle at var(--gx) var(--gy), rgb(255 255 255 / 0.85), rgb(255 190 150 / 0.25) 22%, transparent 48%)" }}
          />
        </div>
        {/* The core flare, floating in front of the glass; brighter as the pointer nears it */}
        <div
          className="pointer-events-none absolute left-1/2 top-[45.7%] aspect-square w-[30%] rounded-full mix-blend-screen"
          style={{
            background: "radial-gradient(circle, rgb(255 214 186 / 0.9), rgb(255 85 0 / 0.55) 28%, rgb(255 85 0 / 0.12) 55%, transparent 70%)",
            opacity: "calc(0.15 + var(--glow) * 0.85)",
            transform: "translate(-50%, -50%) translateZ(50px) scale(calc(0.75 + var(--glow) * 0.5))",
          }}
        />
      </div>
    </div>
  );
}
