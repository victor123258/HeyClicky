const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  estimatedTriangles,
  tessellation,
} = require("../src/shared/model-quality");
const { validateVisual } = require("../src/main/lib/visuals");
const scene = (objects) => ({
  kind: "scene3d",
  title: "Model",
  caption: "Conceptual",
  objects,
});

test("smoother curved geometry stays within the shared, enforced triangle estimates", async () => {
  const { geometry } = await import("../src/renderer/modeling-geometry.mjs");
  const objects = validateVisual(
    scene([
      ...[
        "box",
        "sphere",
        "cylinder",
        "cone",
        "torus",
        "roundedBox",
        "plane",
      ].map((type) => ({ type })),
      {
        type: "tube",
        points: [
          [0, 0, 0],
          [1, 1, 0],
          [2, 0, 0],
        ],
        radius: 0.1,
        segments: 64,
      },
      {
        type: "lathe",
        profile: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        segments: 64,
      },
      {
        type: "extrude",
        profile: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        depth: 0.5,
        bevel: 0.1,
      },
    ]),
  ).objects;
  for (const o of objects) {
    const g = geometry(o);
    try {
      const triangles = (g.index?.count ?? g.attributes.position.count) / 3;
      assert.ok(
        triangles > 0 && triangles <= estimatedTriangles(o),
        `${o.type}: ${triangles}`,
      );
      assert.ok([...g.attributes.normal.array].every(Number.isFinite));
      if (o.type === "sphere")
        assert.equal(g.parameters.widthSegments, tessellation.radial);
      if (o.type === "tube")
        assert.equal(g.parameters.radialSegments, tessellation.tubeRadial);
    } finally {
      g.dispose();
    }
  }
  assert.doesNotThrow(() =>
    validateVisual(
      scene(Array.from({ length: 39 }, () => ({ type: "torus" }))),
    ),
  );
  assert.throws(
    () =>
      validateVisual(
        scene(Array.from({ length: 40 }, () => ({ type: "torus" }))),
      ),
    /60,000/,
  );
});

test("custom meshes preserve hard mechanical edges instead of averaging them into melted corners", async () => {
  const { geometry } = await import("../src/renderer/modeling-geometry.mjs");
  const g = geometry({
    type: "mesh",
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
    ],
  });
  try {
    assert.equal(g.attributes.position.count, 6);
    const n = g.attributes.normal;
    for (let i = 0; i < 3; i++)
      assert.deepEqual([n.getX(i), n.getY(i), n.getZ(i)], [0, 0, 1]);
    for (let i = 3; i < 6; i++)
      assert.deepEqual([n.getX(i), n.getY(i), n.getZ(i)], [0, 1, 0]);
  } finally {
    g.dispose();
  }
});

test("opaque parts use depth-writing opaque materials; fades and playing pulses use the transparent path", async () => {
  const { surfaceOptions } = await import(
    "../src/renderer/modeling-surface.mjs"
  );
  const o = { color: "#aabbcc", opacity: 1, motion: { mode: "pulse" } };
  assert.equal(surfaceOptions(o).transparent, false);
  assert.equal(surfaceOptions(o).depthWrite, true);
  for (const m of [
    surfaceOptions({ ...o, opacity: 0.5 }),
    surfaceOptions(o, true, true),
  ]) {
    assert.equal(m.transparent, true);
    assert.equal(m.depthWrite, false);
  }
  const context = surfaceOptions(o, false);
  assert.equal(context.transparent, false);
  assert.equal(context.opacity, 1);
  assert.equal(context.depthWrite, true);
  assert.notEqual("#" + context.color.getHexString(), o.color);
  const explicit = surfaceOptions({
    ...o,
    material: { roughness: 0.8, metalness: 0.9, clearcoat: 0 },
  });
  assert.equal(explicit.roughness, 0.8);
  assert.equal(explicit.metalness, 0.9);
  assert.equal(explicit.clearcoat, 0);
});

test("legacy names, descriptions and offsets remain validated metadata after callout removal and edits", () => {
  const { applyVisualPatch } = require("../src/main/lib/visuals");
  const current = validateVisual(
    scene([
      {
        id: "part",
        type: "box",
        label: "Housing",
        description: "Outer shell",
        labelOffset: [0, 1, 0],
      },
    ]),
  );
  const next = applyVisualPatch(current, {
    objects: [{ id: "part", color: "#ff0000" }],
  });
  assert.equal(next.objects[0].label, "Housing");
  assert.equal(next.objects[0].description, "Outer shell");
  assert.deepEqual(next.objects[0].labelOffset, [0, 1, 0]);
});
