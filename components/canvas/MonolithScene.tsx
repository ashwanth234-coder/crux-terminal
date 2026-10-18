"use client";

import { MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment } from "./StudioEnvironment";
import { mulberry32, prefersReducedMotion } from "./geometry";
import { useBatchClock } from "@/lib/batch";

const SPEED = prefersReducedMotion() ? 0.15 : 1;
const BEAM_HEIGHT = 5.2;

function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.22, "rgba(226,232,242,0.5)");
  grd.addColorStop(0.6, "rgba(160,170,190,0.08)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** Soft vertical shaft: bright core fading sideways and upward. */
function shaftTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, "rgba(255,255,255,0)");
  h.addColorStop(0.5, "rgba(255,255,255,1)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = "destination-in";
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

/** Horizontal falloff only: bright centre, soft edges, full height. */
function coreTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 4;
  const g = c.getContext("2d")!;
  const h = g.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0, "rgba(255,255,255,0)");
  h.addColorStop(0.3, "rgba(240,244,250,0.55)");
  h.addColorStop(0.5, "rgba(255,255,255,1)");
  h.addColorStop(0.7, "rgba(240,244,250,0.55)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = h;
  g.fillRect(0, 0, 128, 4);
  return new THREE.CanvasTexture(c);
}

/** The monolith of light. Flares when the current batch clears. */
function Monolith() {
  const clock = useBatchClock();
  const flare = useRef(0);
  const target = useRef(0);
  const glow = useMemo(() => radialTexture(), []);
  const shaft = useMemo(() => shaftTexture(), []);
  const core = useMemo(() => coreTexture(), []);
  const wide = useRef<THREE.MeshBasicMaterial>(null);
  const tight = useRef<THREE.MeshBasicMaterial>(null);
  const spill = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  useEffect(() => {
    target.current = clock && clock.left <= 1 ? 1 : 0;
  }, [clock]);

  useEffect(
    () => () => {
      glow.dispose();
      shaft.dispose();
      core.dispose();
    },
    [glow, shaft, core],
  );

  useFrame((state, dt) => {
    flare.current = THREE.MathUtils.damp(flare.current, target.current, target.current ? 9 : 2.2, dt);
    const breathe = 0.04 * Math.sin(state.clock.elapsedTime * 1.3 * SPEED);
    const f = flare.current;
    if (wide.current) wide.current.opacity = 0.42 + breathe + f * 0.35;
    if (tight.current) tight.current.opacity = 0.75 + breathe + f * 0.25;
    if (spill.current) spill.current.opacity = 0.6 + f * 0.4;
    if (light.current) light.current.intensity = 26 + f * 40;
  });

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;

  return (
    <group>
      {/* Core: a soft-edged slab rather than a hard box, so the light has falloff */}
      <mesh position={[0, BEAM_HEIGHT / 2, 0.02]}>
        <planeGeometry args={[0.9, BEAM_HEIGHT]} />
        <meshBasicMaterial map={core} {...additive} />
      </mesh>
      <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.28, BEAM_HEIGHT, 0.06]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {/* Volume: a wide, faint column of scattered light */}
      <mesh position={[0, BEAM_HEIGHT / 2 + 0.6, -0.05]}>
        <planeGeometry args={[9, BEAM_HEIGHT + 5]} />
        <meshBasicMaterial map={glow} color="#8f9aae" opacity={0.22} {...additive} />
      </mesh>
      <mesh position={[0, BEAM_HEIGHT / 2, 0.08]}>
        <planeGeometry args={[4.6, BEAM_HEIGHT + 2.6]} />
        <meshBasicMaterial ref={wide} map={glow} color="#cfd6e4" {...additive} />
      </mesh>
      <mesh position={[0, BEAM_HEIGHT / 2, 0.1]}>
        <planeGeometry args={[1.5, BEAM_HEIGHT + 0.8]} />
        <meshBasicMaterial ref={tight} map={glow} {...additive} />
      </mesh>
      <mesh position={[0, BEAM_HEIGHT + 2.2, 0]}>
        <planeGeometry args={[0.36, 4.4]} />
        <meshBasicMaterial map={shaft} opacity={0.5} {...additive} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0.6]}>
        <planeGeometry args={[7.5, 2.6]} />
        <meshBasicMaterial ref={spill} map={glow} {...additive} />
      </mesh>
      <pointLight ref={light} position={[0, 2.2, 0.7]} distance={11} decay={2} color="#eef2f8" />
    </group>
  );
}

/** Faceted chrome pillars forming the canyon; one instanced draw call. */
function Canyon() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const COUNT = 30;

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rand = mulberry32(2026);
    const o = new THREE.Object3D();
    let n = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const near = i / 10;
        const h = 4.8 - near * 3.1 + rand() * 1.1;
        o.position.set(side * (0.75 + i * 0.62 + rand() * 0.3), h * 0.42, -0.8 - rand() * 2.8 + near * 0.8);
        o.scale.set(0.45 + rand() * 0.45, h, 0.45 + rand() * 0.4);
        o.rotation.set((rand() - 0.5) * 0.12, rand() * Math.PI, side * (0.04 + rand() * 0.08));
        o.updateMatrix();
        m.setMatrixAt(n++, o.matrix);
      }
      // Low foreground boulders frame the explorer
      for (let i = 0; i < 4; i++) {
        const h = 0.25 + rand() * 0.55;
        o.position.set(side * (1.6 + i * 1.1 + rand() * 0.5), h * 0.3, 1.8 + rand() * 1.6);
        o.scale.set(0.5 + rand() * 0.6, h, 0.4 + rand() * 0.5);
        o.rotation.set(0, rand() * Math.PI, 0);
        o.updateMatrix();
        m.setMatrixAt(n++, o.matrix);
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshPhysicalMaterial color="#b9bfca" metalness={1} roughness={0.2} clearcoat={0.6} clearcoatRoughness={0.15} flatShading envMapIntensity={0.85} />
    </instancedMesh>
  );
}

function Explorer() {
  // Near-black metal: a silhouette against the beam that still catches a rim of the studio light.
  const black = <meshStandardMaterial color="#0a0b0d" metalness={0.85} roughness={0.35} />;
  return (
    <group position={[0.02, 0, 1.15]} scale={0.72}>
      <mesh position={[0, 0.34, 0]}>
        <capsuleGeometry args={[0.07, 0.22, 4, 12]} />
        {black}
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.062, 16, 16]} />
        {black}
      </mesh>
      <mesh position={[0, 0.38, 0.07]}>
        <boxGeometry args={[0.13, 0.19, 0.08]} />
        {black}
      </mesh>
      {[-0.035, 0.035].map((x) => (
        <mesh key={x} position={[x, 0.1, 0]}>
          <boxGeometry args={[0.04, 0.22, 0.05]} />
          {black}
        </mesh>
      ))}
    </group>
  );
}

function CameraRig() {
  const look = useMemo(() => new THREE.Vector3(0, 1.7, 0), []);
  useFrame((state, dt) => {
    const cam = state.camera;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, state.pointer.x * 0.5, 2, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, 1.25 + state.pointer.y * 0.25, 2, dt);
    cam.lookAt(look);
  });
  return null;
}

export default function MonolithScene({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [0, 1.25, 9.5], fov: 32 }} maxDpr={1.5}>
      <color attach="background" args={["#050505"]} />
      <fog attach="fog" args={["#050505", 8.5, 22]} />
      <StudioEnvironment accent={0} overhead={1.4} />
      <CameraRig />
      <Monolith />
      <Canyon />
      <Explorer />
      <Sparkles count={70} scale={[1.6, 5, 1.2]} position={[0, 2.6, 0.5]} size={1.3} speed={0.18 * SPEED} opacity={0.55} color="#ffffff" />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[220, 60]}
          mixBlur={0.8}
          mixStrength={7}
          mirror={0.9}
          roughness={0.55}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#0b0c0e"
          metalness={0.6}
        />
      </mesh>
    </LazyCanvas>
  );
}
