// Trusted tessellation settings shared by validation and the local renderer.
// Raising visual quality must not silently bypass the scene's geometry budget.
const tessellation = Object.freeze({
  radial: 32,
  sphereHeight: 24,
  torusRadial: 16,
  torusTubular: 48,
  roundedBox: 3,
  tubeRadial: 16,
});
function estimatedTriangles(o) {
  switch (o.type) {
    case "sphere":
      return tessellation.radial * (tessellation.sphereHeight - 1) * 2;
    case "cylinder":
      return tessellation.radial * 4;
    case "cone":
      return tessellation.radial * 2;
    case "torus":
      return tessellation.torusRadial * tessellation.torusTubular * 2;
    case "roundedBox":
      return 12 * (2 * tessellation.roundedBox + 1) ** 2;
    case "tube":
      return (o.segments ?? 32) * tessellation.tubeRadial * 2;
    case "lathe":
      return (o.segments ?? 32) * (o.profile.length - 1) * 2;
    case "extrude":
      return o.profile.length * 20; // Includes bevels and caps.
    case "mesh":
      return o.faces.length;
    case "box":
      return 12;
    case "plane":
      return 2;
    case "arrow":
      return 32; // Conservative fixed ArrowHelper head budget.
    default:
      return 0;
  }
}
module.exports = { tessellation, estimatedTriangles };
