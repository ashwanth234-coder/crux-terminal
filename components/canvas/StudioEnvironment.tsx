"use client";

import { Environment, Lightformer } from "@react-three/drei";
import type { ReactNode } from "react";

/**
 * Procedural studio lighting baked once into a 256px cube map. No HDR is
 * downloaded, which keeps chrome reflections crisp at near-zero cost on mobile.
 * Lightformers aim at the origin automatically.
 */
export function StudioEnvironment({
  accent = 1,
  overhead = 3,
  children,
}: {
  accent?: number;
  /** Overhead softbox strength; lower it for mirror floors that face straight up. */
  overhead?: number;
  children?: ReactNode;
}) {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#0b0c0e"]} />
      {/* Big overhead softbox + front fill: gives chrome its silver body */}
      <Lightformer form="rect" intensity={overhead} position={[0, 6, 0]} scale={[14, 5, 1]} />
      <Lightformer form="rect" intensity={1.1} position={[0, 1.5, 8]} scale={[14, 5, 1]} />
      {/* Long strip lights for the sharp glints */}
      <Lightformer form="rect" intensity={5} position={[-6, 2, 2]} scale={[0.5, 10, 1]} />
      <Lightformer form="rect" intensity={4} position={[6, 0, 3]} scale={[0.4, 10, 1]} />
      <Lightformer form="rect" intensity={2.5} position={[2, 4, -6]} scale={[10, 0.5, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-3, -1, -7]} scale={[6, 0.35, 1]} />
      {/* Cool floor bounce */}
      <Lightformer form="rect" color="#9aa3b5" intensity={0.5} position={[0, -6, 0]} scale={[14, 14, 1]} />
      {/* Acid accent */}
      <Lightformer form="ring" color="#d4f933" intensity={3 * accent} position={[4, -3, 4]} scale={2.4} />
      {children}
    </Environment>
  );
}

/** Shared physical-material settings for polished chrome. */
export function chromeProps(roughness = 0.14) {
  return {
    color: "#e6e8ee",
    metalness: 1,
    roughness,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35,
  } as const;
}
