import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
export function geometry(o) {
  if (o.type === "mesh") {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(o.vertices.flat(), 3),
    );
    g.setIndex(o.faces.flat());
    g.computeVertexNormals();
    return g;
  }
  if (o.type === "sphere") return new THREE.SphereGeometry(o.size / 2, 24, 16);
  if (o.type === "cylinder")
    return new THREE.CylinderGeometry(o.size / 2, o.size / 2, o.size, 24);
  if (o.type === "cone") return new THREE.ConeGeometry(o.size / 2, o.size, 24);
  if (o.type === "torus")
    return new THREE.TorusGeometry(o.size / 2, o.size / 8, 12, 32);
  if (o.type === "plane") return new THREE.PlaneGeometry(o.size, o.size);
  if (o.type === "roundedBox")
    return new RoundedBoxGeometry(o.size, o.size, o.size, 2, o.size * 0.12);
  if (o.type === "tube")
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(o.points.map((p) => new THREE.Vector3(...p))),
      o.segments ?? 32,
      o.radius,
      12,
      false,
    );
  if (o.type === "lathe")
    return new THREE.LatheGeometry(
      o.profile.map((p) => new THREE.Vector2(...p)),
      o.segments ?? 32,
    );
  if (o.type === "extrude") {
    const shape = new THREE.Shape();
    o.profile.forEach((p, i) => (i ? shape.lineTo(...p) : shape.moveTo(...p)));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: o.depth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: (o.bevel ?? 0) > 0,
      bevelThickness: o.bevel ?? 0,
      bevelSize: o.bevel ?? 0,
      bevelSegments: 2,
    });
  }
  return new THREE.BoxGeometry(o.size, o.size, o.size);
}
// Collision-aware label placement, deterministic and bounded. Lower-priority crowded labels hide.
export function placeLabels(labels, width, height) {
  const used = [],
    out = [];
  for (const l of labels) {
    const w = Math.min(220, Math.max(72, l.text.length * 8 + 20), width),
      h = 24;
    for (const delta of [0, 28, -28, 56, -56, 84, -84, 112, -112, 140, -140]) {
      const x = Math.max(
          0,
          Math.min(width - w, l.x + (l.x < width / 2 ? 18 : -w - 18)),
        ),
        y = Math.max(0, Math.min(height - h, l.y - 12 + delta));
      if (
        used.some(
          (b) =>
            x < b.x + b.w + 4 &&
            x + w + 4 > b.x &&
            y < b.y + b.h + 3 &&
            y + h + 3 > b.y,
        )
      )
        continue;
      const box = { ...l, x, y, w, h };
      used.push(box);
      out.push(box);
      break;
    }
  }
  return out;
}
