import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type TwistedRingOptions = {
  radius?: number;
  /** Semi-axes of the elliptical cross-section. */
  width?: number;
  depth?: number;
  /** Cross-section rotations per loop. Half-integers give a Möbius-style band. */
  twists?: number;
  radialSegments?: number;
  tubularSegments?: number;
};

/**
 * A torus whose elliptical cross-section rotates as it travels the loop.
 * Seam vertices are welded so normals stay continuous through the twist.
 */
export function createTwistedRing({
  radius = 1.5,
  width = 0.44,
  depth = 0.2,
  twists = 1.5,
  radialSegments = 240,
  tubularSegments = 48,
}: TwistedRingOptions = {}) {
  const positions = new Float32Array((radialSegments + 1) * (tubularSegments + 1) * 3);
  let p = 0;
  for (let i = 0; i <= radialSegments; i++) {
    const u = (i / radialSegments) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const theta = u * twists;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    for (let j = 0; j <= tubularSegments; j++) {
      const v = (j / tubularSegments) * Math.PI * 2;
      const ex = Math.cos(v) * width;
      const ey = Math.sin(v) * depth;
      const n = ex * ct - ey * st;
      const b = ex * st + ey * ct;
      positions[p++] = (radius + n) * cu;
      positions[p++] = (radius + n) * su;
      positions[p++] = b;
    }
  }

  const indices: number[] = [];
  const row = tubularSegments + 1;
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < tubularSegments; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const welded = mergeVertices(geometry, 1e-4);
  welded.computeVertexNormals();
  geometry.dispose();
  return welded;
}

function starPath(target: THREE.Path, tip: number, ctrl: number) {
  target.moveTo(0, tip);
  target.quadraticCurveTo(ctrl, ctrl, tip, 0);
  target.quadraticCurveTo(ctrl, -ctrl, 0, -tip);
  target.quadraticCurveTo(-ctrl, -ctrl, -tip, 0);
  target.quadraticCurveTo(-ctrl, ctrl, 0, tip);
}

/** The Crux mark as an outlined shape (outer star minus inner star), unit-scaled. */
export function createCruxStarShape(scale = 1) {
  const shape = new THREE.Shape();
  starPath(shape, 1 * scale, 0.1 * scale);
  const hole = new THREE.Path();
  starPath(hole, 0.52 * scale, 0.055 * scale);
  shape.holes.push(hole);
  return shape;
}

export const fresnelGlass = {
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTint;
    uniform vec3 uRim;
    uniform float uBody;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec3 n = normalize(vN);
      float facing = max(dot(n, vV), 0.0);
      float fres = pow(1.0 - facing, 2.4);
      vec3 l1 = normalize(vec3(-0.5, 0.75, 0.55));
      vec3 l2 = normalize(vec3(0.7, -0.4, 0.4));
      float s1 = pow(max(dot(n, normalize(l1 + vV)), 0.0), 260.0) * 0.55;
      float s2 = pow(max(dot(n, normalize(l2 + vV)), 0.0), 60.0) * 0.35;
      vec3 col = uTint * uBody + uRim * fres + vec3(s1) + uRim * s2;
      float alpha = clamp(uBody + fres * 0.9 + s1 + s2, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `,
};

export function createGlassMaterial(rim = "#e0e2ec", body = 0.08, tint = "#9aa3b5") {
  return new THREE.ShaderMaterial({
    vertexShader: fresnelGlass.vertexShader,
    fragmentShader: fresnelGlass.fragmentShader,
    uniforms: {
      uTint: { value: new THREE.Color(tint) },
      uRim: { value: new THREE.Color(rim) },
      uBody: { value: body },
    },
    transparent: true,
    depthWrite: false,
  });
}

/** Deterministic PRNG so scenes look identical between reloads. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
