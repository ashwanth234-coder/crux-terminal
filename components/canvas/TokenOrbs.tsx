"use client";

import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LabelTracker } from "./LabelTracker";
import { LazyCanvas } from "./LazyCanvas";
import { createGlassMaterial, prefersReducedMotion } from "./geometry";
import { TokenGlyph } from "@/components/terminal/TokenGlyph";
import { ORB_TOKENS, type OrbToken } from "@/lib/tokens";

const SPEED = prefersReducedMotion() ? 0.15 : 1;

/** Fibonacci-sphere nodes linked to their near neighbours: the routing mesh. */
function useNetwork(count: number, radius: number) {
  return useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      nodes.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(radius));
    }
    const dim: number[] = [];
    const lit: number[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (nodes[i].distanceTo(nodes[j]) < radius * 0.52) {
          const target = (i * 7 + j * 3) % 9 === 0 ? lit : dim;
          target.push(...nodes[i].toArray(), ...nodes[j].toArray());
        }
      }
    }
    const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodes);
    const dimGeo = new THREE.BufferGeometry();
    dimGeo.setAttribute("position", new THREE.Float32BufferAttribute(dim, 3));
    const litGeo = new THREE.BufferGeometry();
    litGeo.setAttribute("position", new THREE.Float32BufferAttribute(lit, 3));
    return { nodeGeo, dimGeo, litGeo };
  }, [count, radius]);
}

function Globe() {
  const group = useRef<THREE.Group>(null);
  const glass = useMemo(() => createGlassMaterial("#dfe3ec", 0.05), []);
  const { nodeGeo, dimGeo, litGeo } = useNetwork(54, 1.02);

  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.14 * SPEED;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.12;
  });

  return (
    <group>
      <mesh material={glass}>
        <sphereGeometry args={[1.22, 64, 64]} />
      </mesh>
      <group ref={group}>
        <points geometry={nodeGeo}>
          <pointsMaterial size={0.045} color="#e0e2ec" sizeAttenuation transparent opacity={0.9} />
        </points>
        <lineSegments geometry={dimGeo}>
          <lineBasicMaterial color="#5d636e" transparent opacity={0.45} />
        </lineSegments>
        <lineSegments geometry={litGeo}>
          <lineBasicMaterial color="#d4f933" transparent opacity={0.85} toneMapped={false} />
        </lineSegments>
      </group>
      <Sparkles count={36} scale={2.4} size={1.6} speed={0.25 * SPEED} color="#d4f933" opacity={0.7} />
    </group>
  );
}

function TokenOrb({
  token,
  index,
  anchorRef,
}: {
  token: OrbToken;
  index: number;
  anchorRef: (el: THREE.Object3D | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const glass = useMemo(() => createGlassMaterial(token.highlight ? "#d4f933" : "#e0e2ec", 0.1), [token.highlight]);

  useEffect(() => {
    const target = ref.current;
    if (!target || prefersReducedMotion()) return;
    const tween = gsap.to(target.position, {
      y: token.position[1] + 0.16,
      duration: 2.1 + index * 0.4,
      delay: index * 0.25,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    return () => {
      tween.kill();
    };
  }, [index, token.position]);

  return (
    <group ref={ref} position={token.position}>
      <mesh material={glass}>
        <sphereGeometry args={[0.17, 32, 32]} />
      </mesh>
      <object3D ref={anchorRef} />
    </group>
  );
}

function TokenChip({ token }: { token: OrbToken }) {
  const up = token.change >= 0;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 backdrop-blur-md ${
        token.highlight ? "border-acid/80 bg-void/70 shadow-[0_0_24px_-6px_rgba(212,249,51,0.7)]" : "border-line-2 bg-void/60"
      }`}
    >
      <TokenGlyph symbol={token.symbol} className="h-6 w-6" />
      <div className="leading-tight">
        <div className="font-mono text-[11px] font-semibold text-chrome">${token.symbol}</div>
        <div className={`font-mono text-[10px] ${up ? "text-up" : "text-down"}`}>
          {up ? "+" : ""}
          {token.change.toFixed(1)}%
        </div>
      </div>
      {token.highlight && (
        <svg viewBox="0 0 40 16" className="ml-1 h-4 w-10" aria-hidden="true">
          <path d="M1 13 7 10l5 2 6-6 5 3 6-7 4 3 5-4" fill="none" stroke="#d4f933" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default function TokenOrbs({ className = "" }: { className?: string }) {
  const anchors = useRef<(THREE.Object3D | null)[]>([]);
  const labels = useRef<(HTMLElement | null)[]>([]);

  const overlay = ORB_TOKENS.map((t, i) => (
    <div
      key={t.symbol}
      ref={(el) => {
        labels.current[i] = el;
      }}
      className="absolute left-0 top-0 opacity-0 transition-opacity duration-700"
    >
      <TokenChip token={t} />
    </div>
  ));

  return (
    <LazyCanvas className={className} camera={{ position: [0, 0, 5.6], fov: 38 }} maxDpr={1.5} overlay={overlay}>
      <Globe />
      {ORB_TOKENS.map((t, i) => (
        <TokenOrb
          key={t.symbol}
          token={t}
          index={i}
          anchorRef={(el) => {
            anchors.current[i] = el;
          }}
        />
      ))}
      <LabelTracker anchors={anchors} labels={labels} />
    </LazyCanvas>
  );
}
