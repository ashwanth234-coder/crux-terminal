"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import * as THREE from "three";

type Props = {
  anchors: RefObject<(THREE.Object3D | null)[]>;
  labels: RefObject<(HTMLElement | null)[]>;
};

/**
 * Pins DOM labels (rendered as the canvas overlay) to 3D anchors by projecting
 * each anchor once per frame and writing the transform directly — no React
 * renders and no extra roots, unlike drei's <Html>.
 */
export function LabelTracker({ anchors, labels }: Props) {
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    anchors.current.forEach((obj, i) => {
      const el = labels.current[i];
      if (!obj || !el) return;
      obj.getWorldPosition(v).project(camera);
      // Keep the whole label inside the canvas so narrow screens never clip it.
      const half = el.offsetWidth / 2 + 8;
      const x = THREE.MathUtils.clamp((v.x * 0.5 + 0.5) * size.width, half, size.width - half);
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = v.z > 1 ? "0" : "1";
    });
  });

  return null;
}
