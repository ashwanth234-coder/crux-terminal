"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { prefersReducedMotion } from "./geometry";

const SPEED = prefersReducedMotion() ? 0.15 : 1;
const RINGS = 9;

/** Intent → solver → settlement: a cascade of chrome rings spiralling down onto a dais. */
function Cascade() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const chrome = useMemo(() => new THREE.MeshPhysicalMaterial({ ...chromeProps(0.08) }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime * SPEED;
    for (let i = 0; i < RINGS; i++) {
      const k = i / (RINGS - 1);
      const y = 1.75 - k * 3.0 + Math.sin(t * 1.4 - i * 0.7) * 0.05;
      const r = 0.42 + k * 0.62;
      dummy.position.set(Math.sin(t * 0.6 + i * 0.6) * 0.06 * (1 - k), y, 0);
      dummy.rotation.set(Math.PI / 2 + Math.sin(t * 0.8 + i) * 0.08, 0, t * 0.3 + i * 0.5);
      dummy.scale.set(r, r, 1 + k * 0.4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, chrome, RINGS]}>
      <torusGeometry args={[1, 0.06, 20, 96]} />
    </instancedMesh>
  );
}

function Dais() {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (glow.current) glow.current.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 2.2 * SPEED) * 0.25;
  });
  return (
    <group position={[0, -1.55, 0]}>
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[1.35, 1.5, 0.32, 96]} />
        <meshPhysicalMaterial {...chromeProps(0.3)} color="#565b64" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.0, 0]}>
        <torusGeometry args={[1.18, 0.02, 12, 160]} />
        <meshBasicMaterial ref={glow} color="#d4f933" transparent toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.2, 1.1, 96]} />
        <meshBasicMaterial color="#d4f933" transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function GlassHelix({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [0, 2.3, 6.4], fov: 36 }} maxDpr={1.5}>
      <StudioEnvironment accent={0.6} />
      <group rotation-x={0.12}>
        <Cascade />
        <Dais />
      </group>
    </LazyCanvas>
  );
}
