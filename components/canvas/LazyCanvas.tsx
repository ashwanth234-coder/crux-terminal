"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type LazyCanvasProps = {
  children: ReactNode;
  className?: string;
  camera?: CanvasProps["camera"];
  /** Max device pixel ratio. Kept low so WebViews hold 60fps. */
  maxDpr?: number;
  /** DOM laid over the canvas, e.g. labels driven by <LabelTracker>. */
  overlay?: ReactNode;
};

/**
 * Mounts its WebGL context only once scrolled near, and freezes the render
 * loop whenever it leaves the viewport, so a page of 3D panels only ever
 * pays for the one or two that are on screen.
 */
export function LazyCanvas({ children, className = "", camera, maxDpr = 1.75, overlay }: LazyCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMounted(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Only evaluated once mounted, which only happens client-side.
  const dpr = useMemo<[number, number]>(() => {
    if (!mounted) return [1, maxDpr];
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    return [1, coarse ? Math.min(maxDpr, 1.5) : maxDpr];
  }, [mounted, maxDpr]);

  return (
    <div ref={ref} className={className}>
      {mounted && (
        <Canvas
          frameloop={visible ? "always" : "never"}
          dpr={dpr}
          camera={camera ?? { position: [0, 0, 6], fov: 35 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          style={{ position: "absolute", inset: 0 }}
        >
          {children}
        </Canvas>
      )}
      {mounted && overlay && <div className="pointer-events-none absolute inset-0 overflow-hidden">{overlay}</div>}
    </div>
  );
}
