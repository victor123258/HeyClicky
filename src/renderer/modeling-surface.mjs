import { Color } from "three";
// Pure, testable material policy. Opaque parts must stay on the opaque render
// path; marking every surface transparent caused depth-sorting artifacts.
export function surfaceOptions(o, emphasized = true, animate = false) {
  const opacity = o.opacity ?? 1;
  const pulsing = animate && o.motion?.mode === "pulse";
  const transparent = opacity < 1 || pulsing;
  return {
    color: emphasized ? o.color : new Color(o.color).multiplyScalar(0.55),
    roughness: o.material?.roughness ?? 0.42,
    metalness: o.material?.metalness ?? 0.08,
    clearcoat: o.material?.clearcoat ?? 0.2,
    transparent,
    depthWrite: !transparent,
    opacity,
    wireframe: o.wireframe ?? false,
    emissive: o.material?.emissive ?? "#000000",
    emissiveIntensity: o.material?.emissiveIntensity ?? 0,
  };
}
