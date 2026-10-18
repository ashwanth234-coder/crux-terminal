"use client";

import { Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LazyCanvas } from "./LazyCanvas";
import { StudioEnvironment, chromeProps } from "./StudioEnvironment";
import { prefersReducedMotion } from "./geometry";

const SPEED = prefersReducedMotion() ? 0.15 : 1;

const HEIGHT_FN = /* glsl */ `
  uniform float uTime;
  float crux_height(vec2 p) {
    float r = length(p);
    float well = -0.85 * exp(-r * r * 1.35);
    float ripple = 0.075 * sin(r * 9.0 - uTime * 2.4) * exp(-r * 0.32);
    float swirl = 0.025 * sin(atan(p.y, p.x) * 3.0 + r * 4.0 - uTime * 1.3) * smoothstep(0.2, 1.2, r);
    return well + ripple + swirl;
  }
`;

// Shared with the compiled shader; only one pool is ever on the page.
const uniforms = { uTime: { value: 0 } };

/**
 * Liquid-metal pool: displacement and analytic normals run in the vertex
 * shader, so the CPU never touches the 16k-vertex surface.
 */
function Pool() {
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ ...chromeProps(0.1) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${HEIGHT_FN}`)
        .replace(
          "#include <beginnormal_vertex>",
          `float e = 0.012;
           float h0 = crux_height(position.xy);
           float hx = crux_height(position.xy + vec2(e, 0.0));
           float hy = crux_height(position.xy + vec2(0.0, e));
           vec3 objectNormal = normalize(vec3(-(hx - h0) / e, -(hy - h0) / e, 1.0));
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`,
        )
        .replace("#include <begin_vertex>", "vec3 transformed = vec3(position.xy, position.z + h0);");
    };
    return m;
  }, []);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt * SPEED;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} material={material}>
      {/* Subdivided disc (radial rings) so the vertex shader has a real surface to ripple */}
      <ringGeometry args={[0, 7.5, 192, 120]} />
    </mesh>
  );
}

/** A twisting chrome stream pouring into the well. */
function Stream() {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const k = i / 80;
      const a = k * Math.PI * 3.2;
      const r = 0.05 + (1 - k) * 0.55;
      pts.push(new THREE.Vector3(Math.cos(a) * r + (1 - k) * 1.6, 3.4 - k * 4.0, Math.sin(a) * r - (1 - k) * 0.6));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 240, 0.06, 20, false);
    // Taper toward the top so it reads as a falling ribbon rather than a pipe.
    const pos = g.attributes.position;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const seg = Math.floor(i / 21) / 240;
      const pt = curve.getPointAt(Math.min(seg, 1));
      tmp.fromBufferAttribute(pos, i).sub(pt).multiplyScalar(0.35 + seg * 1.1).add(pt);
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25 * SPEED;
  });

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshPhysicalMaterial {...chromeProps(0.06)} />
    </mesh>
  );
}

export default function LiquidVortex({ className = "" }: { className?: string }) {
  return (
    <LazyCanvas className={className} camera={{ position: [0, 2.6, 4.6], fov: 38 }} maxDpr={1.5}>
      <StudioEnvironment accent={0.35} overhead={0}>
        {/* A mirror floor mostly sees the far wall: thin horizon bands that the ripples bend into liquid stripes. */}
        <Lightformer form="rect" intensity={1.3} position={[0, 0.8, -8]} scale={[16, 0.5, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 2.6, -8]} scale={[16, 0.3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 4.6, -7]} scale={[16, 0.25, 1]} />
        {[-3, -1.6, -0.4, 0.8, 2.2].map((z, i) => (
          <Lightformer key={z} form="rect" intensity={1 - i * 0.12} position={[0, 6, z]} rotation-x={Math.PI / 2} scale={[14, 0.16, 1]} />
        ))}
      </StudioEnvironment>
      <group position-y={-0.6}>
        <Pool />
        <Stream />
      </group>
    </LazyCanvas>
  );
}
