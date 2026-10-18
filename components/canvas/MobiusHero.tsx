"use client";

import { Instance, Instances, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LabelTracker } from "./LabelTracker";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { createTwistedRing, mulberry32, prefersReducedMotion } from "./geometry";
import { useBatchClock } from "@/lib/batch";

const SPEED = prefersReducedMotion() ? 0.15 : 1;
const ACID = new THREE.Color("#d4f933");
const WHITE = new THREE.Color("#ffffff");

function InterlockedKnot() {
  const clock = useBatchClock();
  const clearing = clock !== null && clock.left <= 1;
  const flare = useRef(0);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const ringA = useMemo(() => createTwistedRing({ radius: 1.45, width: 0.42, depth: 0.19, twists: 1.5 }), []);
  const ringB = useMemo(() => createTwistedRing({ radius: 1.45, width: 0.4, depth: 0.2, twists: 2.5 }), []);

  useFrame((state, dt) => {
    const t = tilt.current;
    const s = spin.current;
    if (!t || !s) return;
    // The clearing second: the acid filament flares with the header and the tape.
    flare.current = THREE.MathUtils.damp(flare.current, clearing ? 1 : 0, clearing ? 10 : 2, dt);
    if (core.current) core.current.color.copy(ACID).lerp(WHITE, flare.current * 0.6);
    if (halo.current) halo.current.opacity = 0.16 + flare.current * 0.5;
    // Spin in the link's own plane so both loops always read as open rings.
    s.rotation.z += dt * 0.16 * SPEED;
    t.rotation.x = THREE.MathUtils.lerp(t.rotation.x, 0.62 + state.pointer.y * 0.14, 0.035);
    t.rotation.y = THREE.MathUtils.lerp(t.rotation.y, -0.5 + state.pointer.x * 0.18, 0.035);
    t.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
  });

  return (
    <group ref={tilt} rotation={[0.62, -0.5, 0]} scale={0.92}>
      <group ref={spin} rotation-z={-0.6}>
        <mesh geometry={ringA} position={[-0.72, 0, 0]}>
          <meshPhysicalMaterial {...chromeProps(0.09)} />
        </mesh>
        <group position={[0.72, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={ringB}>
            <meshPhysicalMaterial {...chromeProps(0.12)} />
          </mesh>
          {/* Acid filament running inside ring B */}
          <mesh>
            <torusGeometry args={[0.97, 0.02, 10, 220]} />
            <meshBasicMaterial ref={core} color="#d4f933" toneMapped={false} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.97, 0.085, 10, 220]} />
            <meshBasicMaterial ref={halo} color="#d4f933" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

type OrbitSpec = {
  rx: number;
  ry: number;
  rotation: [number, number, number];
  label: { text: string; t: number };
  balls: { phase: number; speed: number; scale: number }[];
};

const ORBITS: OrbitSpec[] = [
  { rx: 3.9, ry: 1.55, rotation: [1.25, 0.1, -0.32], label: { text: "SOLANA", t: 3.14 }, balls: [{ phase: 0.4, speed: 0.07, scale: 1 }, { phase: 3.6, speed: 0.07, scale: 0.7 }] },
  { rx: 3.3, ry: 2.6, rotation: [0.25, -0.5, 0.42], label: { text: "BASE", t: 3.9 }, balls: [{ phase: 1.2, speed: -0.05, scale: 0.85 }, { phase: 4.4, speed: -0.05, scale: 0.6 }] },
  { rx: 4.4, ry: 2.1, rotation: [-0.35, 0.6, -0.2], label: { text: "BSC", t: 5.95 }, balls: [{ phase: 2.2, speed: 0.04, scale: 1.1 }, { phase: 5.4, speed: 0.04, scale: 0.65 }] },
  { rx: 3.6, ry: 1.2, rotation: [1.5, -0.2, 0.18], label: { text: "ROBINHOOD", t: 0.35 }, balls: [{ phase: 0.1, speed: -0.06, scale: 0.75 }] },
];

function ellipsePoint(rx: number, ry: number, t: number) {
  return new THREE.Vector3(Math.cos(t) * rx, Math.sin(t) * ry, 0);
}

function Orbit({ spec, anchorRef }: { spec: OrbitSpec; anchorRef: (el: THREE.Object3D | null) => void }) {
  const points = useMemo(
    () => Array.from({ length: 161 }, (_, i) => ellipsePoint(spec.rx, spec.ry, (i / 160) * Math.PI * 2)),
    [spec.rx, spec.ry],
  );
  const balls = useRef<(THREE.Object3D | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime * SPEED;
    spec.balls.forEach((b, i) => {
      const obj = balls.current[i];
      if (!obj) return;
      const a = b.phase + t * b.speed * Math.PI;
      obj.position.set(Math.cos(a) * spec.rx, Math.sin(a) * spec.ry, 0);
    });
  });

  const labelPos = useMemo(() => ellipsePoint(spec.rx, spec.ry, spec.label.t), [spec]);

  return (
    <group rotation={spec.rotation}>
      <Line points={points} color="#3b3f47" lineWidth={0.8} transparent opacity={0.55} />
      {spec.balls.map((b, i) => (
        <Instance
          key={i}
          ref={(el: THREE.Object3D | null) => {
            balls.current[i] = el;
          }}
          scale={b.scale * 0.11}
        />
      ))}
      <object3D ref={anchorRef} position={labelPos} />
    </group>
  );
}

function Dust({ count = 650 }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const rand = mulberry32(7);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.4 + rand() * 3.2;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      arr[i * 3 + 2] = r * Math.cos(ph) * 0.7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y -= dt * 0.015 * SPEED;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.018} color="#aab0bb" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export default function MobiusHero({ className = "" }: { className?: string }) {
  const anchors = useRef<(THREE.Object3D | null)[]>([]);
  const labels = useRef<(HTMLElement | null)[]>([]);

  const overlay = ORBITS.map((spec, i) => (
    <span
      key={spec.label.text}
      ref={(el) => {
        labels.current[i] = el;
      }}
      className="absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] tracking-[0.24em] text-muted opacity-0 transition-opacity duration-700"
    >
      {spec.label.text}
    </span>
  ));

  return (
    <LazyCanvas className={className} camera={{ position: [0, 0, 10.5], fov: 34 }} overlay={overlay}>
      <StudioEnvironment />
      <directionalLight position={[3, 5, 4]} intensity={0.6} />
      <InterlockedKnot />
      {/* Orbits scaled in and lowered so no orb crosses the nav band or the copy */}
      <group scale={0.8} position={[0.35, -0.35, 0]}>
        <Instances limit={12} range={12}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshPhysicalMaterial {...chromeProps(0.05)} />
        {ORBITS.map((spec, i) => (
          <Orbit
            key={i}
            spec={spec}
            anchorRef={(el) => {
              anchors.current[i] = el;
            }}
          />
        ))}
        </Instances>
      </group>
      <Dust />
      <LabelTracker anchors={anchors} labels={labels} />
    </LazyCanvas>
  );
}
