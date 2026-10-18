"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { mulberry32, prefersReducedMotion } from "./geometry";

const SPEED = prefersReducedMotion() ? 0.15 : 1;
const BEAMS = 46;
const WAVES = 4;

/** Vertical light filaments arranged in an arc: bids arriving inside the window. */
function Beams() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: BEAMS }, (_, i) => {
      const a = Math.PI * (0.08 + (i / (BEAMS - 1)) * 0.84);
      const r = 1.7 + rand() * 0.9;
      const x = Math.cos(a) * r;
      const h = 0.4 + rand() * 1.9;
      // Filaments behind the clock readout stay short so they never cross its labels.
      return { x, z: -Math.sin(a) * r * 0.7, h: Math.abs(x) < 0.85 ? Math.min(h, 0.55) : h, phase: rand() * 6 };
    });
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime * SPEED;
    seeds.forEach((s, i) => {
      const h = s.h * (0.75 + 0.25 * Math.sin(t * 1.6 + s.phase));
      dummy.position.set(s.x, h / 2 - 0.02, s.z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, BEAMS]}>
      <boxGeometry args={[0.012, 1, 0.012]} />
      <meshBasicMaterial color="#f2f4f8" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Concentric pressure waves expanding from the clearing point. */
function Waves() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime * SPEED * 0.35;
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const k = (t + i / WAVES) % 1;
      const s = 0.4 + k * 2.6;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    });
  });
  return (
    <group rotation-x={-Math.PI / 2} position-y={0.01}>
      {Array.from({ length: WAVES }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <ringGeometry args={[0.97, 1, 128]} />
          <meshBasicMaterial color="#e0e2ec" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Pedestal() {
  return (
    <group>
      {[1.35, 1.05, 0.75].map((r, i) => (
        <mesh key={r} position-y={-0.08 - i * 0.0} rotation-x={Math.PI / 2}>
          <torusGeometry args={[r, 0.035 + i * 0.01, 16, 160]} />
          <meshPhysicalMaterial {...chromeProps(0.1)} />
        </mesh>
      ))}
      <mesh position-y={-0.22}>
        <cylinderGeometry args={[0.55, 0.62, 0.3, 64]} />
        <meshPhysicalMaterial {...chromeProps(0.2)} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.065}>
        <circleGeometry args={[0.5, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.37}>
        <circleGeometry args={[3.2, 96]} />
        <meshPhysicalMaterial color="#0b0c0e" metalness={0.9} roughness={0.35} envMapIntensity={0.6} />
      </mesh>
    </group>
  );
}

export default function BatchAuctionRings({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [0, 1.6, 5.2], fov: 36 }} maxDpr={1.5}>
      <StudioEnvironment accent={0.2} />
      <group position-y={-0.6} rotation-x={0.08}>
        <Pedestal />
        <Waves />
        <Beams />
      </group>
    </LazyCanvas>
  );
}
