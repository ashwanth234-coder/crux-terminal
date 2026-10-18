"use client";

import { Grid } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { mulberry32, prefersReducedMotion } from "./geometry";

const SPEED = prefersReducedMotion() ? 0.15 : 1;
const COLS = 22;
const ROWS = 4;

type Bar = { x: number; z: number; h: number; lit: boolean; phase: number };

/** Writes each bar's breathing height into an instanced mesh. */
function placeBars(m: THREE.InstancedMesh | null, bars: readonly Bar[], t: number, dummy: THREE.Object3D) {
  if (!m) return;
  bars.forEach((b, i) => {
    const h = b.h * (0.92 + 0.08 * Math.sin(t * 1.2 + b.phase));
    dummy.position.set(b.x, h / 2, b.z);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
}

/** A matrix of chrome candles; the front row breaks out in acid toward the $10M syndication line. */
function Candles() {
  const chromeMesh = useRef<THREE.InstancedMesh>(null);
  const acidMesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { dim, lit } = useMemo(() => {
    const rand = mulberry32(1337);
    const out: Bar[] = [];
    for (let r = 0; r < ROWS; r++) {
      let level = 0.35 + rand() * 0.2;
      for (let c = 0; c < COLS; c++) {
        level = Math.max(0.12, level + (rand() - 0.42) * 0.22 + (c > COLS * 0.6 ? 0.06 : 0));
        out.push({
          x: (c - COLS / 2) * 0.17,
          z: -r * 0.45,
          h: level * (1 - r * 0.12),
          lit: r === 0 && c > COLS * 0.68,
          phase: rand() * 6,
        });
      }
    }
    return { dim: out.filter((b) => !b.lit), lit: out.filter((b) => b.lit) };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime * SPEED;
    placeBars(chromeMesh.current, dim, t, dummy);
    placeBars(acidMesh.current, lit, t, dummy);
  });

  return (
    <>
      <instancedMesh ref={chromeMesh} args={[undefined, undefined, dim.length]}>
        <boxGeometry args={[0.07, 1, 0.07]} />
        <meshPhysicalMaterial {...chromeProps(0.24)} metalness={0.78} color="#ffffff" />
      </instancedMesh>
      {/* Breakout candles carry the brand acid: emissive keeps the hue, the lit faces keep the form */}
      <instancedMesh ref={acidMesh} args={[undefined, undefined, lit.length]}>
        <boxGeometry args={[0.07, 1, 0.07]} />
        <meshPhysicalMaterial
          color="#d4f933"
          emissive="#d4f933"
          emissiveIntensity={0.32}
          metalness={0.35}
          roughness={0.28}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.1}
        />
      </instancedMesh>
    </>
  );
}

function ThresholdLine() {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (mat.current) mat.current.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2 * SPEED) * 0.25;
  });
  return (
    <mesh position={[0, 1.05, 0]}>
      <boxGeometry args={[COLS * 0.17 + 0.4, 0.008, 0.008]} />
      <meshBasicMaterial ref={mat} color="#d4f933" transparent toneMapped={false} />
    </mesh>
  );
}

export default function DerivativesGrid({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [3.2, 1.55, 4.1], fov: 42 }} maxDpr={1.5}>
      <StudioEnvironment accent={0.4} />
      <group position={[-0.35, -0.95, 0]} rotation-y={-0.42} scale={[1, 1.3, 1]}>
        <Candles />
        <ThresholdLine />
        <Grid
          args={[10, 10]}
          position-y={0.001}
          cellSize={0.17}
          cellThickness={0.6}
          cellColor="#24272d"
          sectionSize={0.85}
          sectionThickness={1}
          sectionColor="#3a3e46"
          fadeDistance={7}
          fadeStrength={1.5}
          infiniteGrid
        />
      </group>
    </LazyCanvas>
  );
}
