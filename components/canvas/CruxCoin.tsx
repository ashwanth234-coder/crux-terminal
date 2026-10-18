"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { createCruxStarShape, prefersReducedMotion } from "./geometry";

const SPEED = prefersReducedMotion() ? 0.15 : 1;

/** Coin profile revolved around Y: recessed face, raised rim, rounded edge. */
const PROFILE: [number, number][] = [
  [0, 0.085],
  [1.06, 0.085],
  [1.14, 0.14],
  [1.33, 0.145],
  [1.4, 0.11],
  [1.43, 0],
  [1.4, -0.11],
  [1.33, -0.145],
  [1.14, -0.14],
  [1.06, -0.085],
  [0, -0.085],
];

function Coin() {
  const group = useRef<THREE.Group>(null);
  const body = useMemo(
    () => new THREE.LatheGeometry(PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 160),
    [],
  );
  const emboss = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(createCruxStarShape(0.82), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 24,
    });
    g.rotateZ(Math.PI / 4);
    return g;
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    // Rock rather than spin so the embossed face stays readable.
    const t = state.clock.elapsedTime * SPEED;
    g.rotation.y = -0.45 + Math.sin(t * 0.45) * 0.5 + state.pointer.x * 0.15;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -0.2 + state.pointer.y * 0.2, 0.05);
    g.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <group ref={group} rotation={[-0.25, -0.6, 0.18]}>
      <group rotation-x={Math.PI / 2}>
        <mesh geometry={body}>
          <meshPhysicalMaterial {...chromeProps(0.16)} side={THREE.DoubleSide} />
        </mesh>
        {/* Inset guide ring on each face */}
        {[0.087, -0.087].map((y) => (
          <mesh key={y} position-y={y} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.98, 0.012, 8, 160]} />
            <meshPhysicalMaterial {...chromeProps(0.05)} />
          </mesh>
        ))}
        {/* Acid rim light along the edge */}
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[1.43, 0.012, 8, 200, Math.PI * 0.9]} />
          <meshBasicMaterial color="#d4f933" toneMapped={false} />
        </mesh>
      </group>
      {/* Front and back emboss */}
      <mesh geometry={emboss} position-z={0.07}>
        <meshPhysicalMaterial {...chromeProps(0.06)} />
      </mesh>
      <mesh geometry={emboss} position-z={-0.07} rotation-y={Math.PI}>
        <meshPhysicalMaterial {...chromeProps(0.06)} />
      </mesh>
    </group>
  );
}

export default function CruxCoin({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [0, 0, 7.6], fov: 34 }} maxDpr={1.5}>
      <StudioEnvironment accent={1.2} />
      <directionalLight position={[-3, 4, 5]} intensity={0.8} />
      <Coin />
    </LazyCanvas>
  );
}
