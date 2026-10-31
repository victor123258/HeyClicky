import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import quality from "../shared/model-quality.js";
const { tessellation: detail } = quality;
export function geometry(o) {
  if (o.type === "mesh") {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(o.vertices.flat(), 3),
    );
    g.setIndex(o.faces.flat());
    // Smooth gentle surfaces without melting hard mechanical edges that share
    // vertices. Normals are computed locally, never supplied as executable data.
    const creased = toCreasedNormals(g, Math.PI / 3);
    if (creased !== g) g.dispose();
    return creased;
  }
  if (o.type === "sphere")
    return new THREE.SphereGeometry(
      o.size / 2,
      detail.radial,
      detail.sphereHeight,
    );
  if (o.type === "cylinder")
    return new THREE.CylinderGeometry(
      o.size / 2,
      o.size / 2,
      o.size,
      detail.radial,
    );
  if (o.type === "cone")
    return new THREE.ConeGeometry(o.size / 2, o.size, detail.radial);
  if (o.type === "torus")
    return new THREE.TorusGeometry(
      o.size / 2,
      o.size / 8,
      detail.torusRadial,
      detail.torusTubular,
    );
  if (o.type === "plane") return new THREE.PlaneGeometry(o.size, o.size);
  if (o.type === "roundedBox")
    return new RoundedBoxGeometry(
      o.size,
      o.size,
      o.size,
      detail.roundedBox,
      o.size * 0.08,
    );
  if (o.type === "tube")
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(o.points.map((p) => new THREE.Vector3(...p))),
      o.segments ?? 32,
      o.radius,
      detail.tubeRadial,
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
