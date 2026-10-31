const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  validateVisual,
  applyVisualPatch,
  visualContext,
} = require("../src/main/lib/visuals");
const { visiblePartIds } = require("../src/shared/scene-data");
const raw = require("../src/shared/modeling-example.json");
const clean = (s) => validateVisual(JSON.stringify(s));
const part = (type, extra = {}) => ({
  id: "a",
  type,
  color: "#aabbcc",
  x: 0,
  y: 0,
  z: 0,
  size: 1,
  ...extra,
});
const scene = (objects) => ({
  kind: "scene3d",
  title: "Model",
  caption: "Conceptual",
  objects,
});
test("native geometry and reusable assemblies canonicalize with stable IDs, hierarchy, material and pivot", () => {
  const s = clean(raw);
  assert.ok(s.objects.some((o) => o.type === "extrude"));
  assert.ok(s.objects.some((o) => o.type === "tube"));
  assert.ok(s.objects.some((o) => o.type === "lathe"));
  assert.ok(s.objects.some((o) => o.type === "roundedBox"));
  assert.equal(
    s.objects.find((o) => o.id === "left__latch").parent,
    "left__hinge",
  );
  assert.equal(s.objects.find((o) => o.id === "left__hinge").parent, "left");
  assert.deepEqual(
    s.objects.find((o) => o.id === "left__hinge").pivot,
    [0, -0.09, -0.3],
  );
  assert.equal(s.objects.filter((o) => o.type === "assembly").length, 0);
  assert.deepEqual(clean(s), s);
});
test("curves, profiles and materials reject invalid numbers, self intersections, collapsed paths and oversized budgets", () => {
  const types = [
    part("extrude", {
      profile: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      depth: 1,
    }),
    part("lathe", {
      profile: [
        [0, 0],
        [1, 1],
      ],
    }),
    part("tube", {
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      radius: 0.1,
    }),
  ];
  types.forEach((o) => assert.doesNotThrow(() => clean(scene([o]))));
  for (const o of [
    part("extrude", {
      profile: [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
      depth: 1,
    }),
    part("extrude", {
      profile: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      depth: 1,
    }),
    part("extrude", {
      profile: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      depth: 0.1,
      bevel: 0.2,
    }),
    part("lathe", {
      profile: [
        [-1, 0],
        [1, 1],
      ],
    }),
    part("lathe", {
      profile: [
        [0, 0],
        [0, 1],
      ],
    }),
    part("tube", {
      points: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      radius: 0.1,
    }),
    part("tube", {
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      radius: 50,
    }),
    part("box", { pivot: [Infinity, 0, 0] }),
    part("box", { material: { roughness: 2 } }),
    part("box", { labelOffset: [6, 0, 0] }),
  ])
    assert.throws(() => clean(scene([o])));
  assert.throws(
    () =>
      clean(
        scene(
          Array.from({ length: 16 }, (_, i) =>
            part("lathe", {
              id: "a" + i,
              profile: Array.from({ length: 32 }, (_, i) => [1, i / 10]),
              segments: 64,
            }),
          ),
        ),
      ),
    /budget/,
  );
  const s = clean(
    scene([
      part("box", {
        material: { shader: "evil", url: "https://evil", metalness: 0.5 },
      }),
    ]),
  );
  assert.deepEqual(s.objects[0].material, { metalness: 0.5 });
});
test("assembly expansion is bounded; definitions cannot recursively instantiate or reference outside their scope", () => {
  assert.throws(() =>
    clean({
      ...raw,
      assemblies: [
        { id: "x", parts: [{ id: "a", type: "assembly", assembly: "x" }] },
      ],
    }),
  );
  assert.throws(
    () =>
      clean({
        ...scene(
          Array.from({ length: 20 }, (_, i) => ({
            id: "i" + i,
            type: "assembly",
            assembly: "x",
          })),
        ),
        assemblies: [
          { id: "x", parts: [part("box"), part("box", { id: "b" })] },
        ],
      }),
    /40/,
  );
  assert.throws(() =>
    clean({
      ...raw,
      assemblies: [{ id: "x", parts: [part("box", { parent: "board" })] }],
    }),
  );
  assert.throws(
    () =>
      clean({
        ...raw,
        objects: [
          { id: "a".repeat(48), type: "assembly", assembly: "connector" },
        ],
      }),
    /ID/,
  );
});
test("hierarchies reject missing/non-group parents, cycles, excessive depth/scales and overbudget step poses", () => {
  for (const objects of [
    [part("box", { parent: "no" })],
    [part("box"), part("box", { id: "b", parent: "a" })],
    [
      { id: "a", type: "group", parent: "b" },
      { id: "b", type: "group", parent: "a" },
    ],
    Array.from({ length: 9 }, (_, i) => ({
      id: "a" + i,
      type: "group",
      ...(i ? { parent: "a" + (i - 1) } : {}),
    })),
    [
      { id: "a", type: "group", scale: [10, 10, 10] },
      part("box", { id: "b", parent: "a", scale: [10, 10, 10] }),
    ],
  ])
    assert.throws(() => clean(scene(objects)));
  const s = clean(
    scene([
      { id: "g", type: "group", scale: [10, 10, 10] },
      part("box", { parent: "g" }),
    ]),
  );
  assert.throws(
    () =>
      clean({
        ...s,
        steps: [
          {
            title: "bad",
            narration: "bad",
            poses: [{ id: "a", scale: [10, 10, 10] }],
          },
        ],
      }),
    /budget/,
  );
});
test("patches retain assemblies and geometry; removals must explicitly repair hierarchy and step references", () => {
  const s = clean(raw),
    p = applyVisualPatch(
      s,
      JSON.stringify({
        objects: [
          {
            id: "left__latch",
            material: { metalness: 0.8 },
            description: "Updated component",
          },
        ],
      }),
    );
  assert.equal(
    p.objects.find((o) => o.id === "left__latch").material.metalness,
    0.8,
  );
  assert.equal(
    s.objects.find((o) => o.id === "left__latch").material.metalness,
    0.2,
  );
  assert.throws(() => applyVisualPatch(s, '{"remove":["left__hinge"]}'));
  const p2 = applyVisualPatch(
    s,
    '{"objects":[{"id":"left__latch","parent":"left","pivot":[0,0,-0.3]}]}',
  );
  assert.equal(p2.objects.find((o) => o.id === "left__latch").parent, "left");
  const context = visualContext(p);
  assert.deepEqual(context.assemblies[0].partIds, ["socket", "hinge", "latch"]);
  assert.equal(context.assemblies[0].parts, undefined);
  assert.ok(JSON.stringify(context).length < 18000);
});
test("step visibility includes group ancestors and listed groups descendants, not unrelated siblings", () => {
  const s = clean(raw);
  s.steps = [{ visible: ["left__latch"] }];
  assert.deepEqual(visiblePartIds(s, 0), [
    "left",
    "left__hinge",
    "left__latch",
  ]);
  s.steps = [{ visible: ["left"] }];
  assert.equal(visiblePartIds(s, 0).length, 4);
  assert.ok(!visiblePartIds(s, 0).includes("right__latch"));
});
test("procedural Three.js geometry is finite and triangulated", async () => {
  const { geometry } = await import("../src/renderer/modeling-geometry.mjs");
  for (const o of clean(raw).objects.filter((o) =>
    ["lathe", "tube", "roundedBox", "extrude"].includes(o.type),
  )) {
    const g = geometry(o),
      a = g.attributes.position;
    assert.ok(a.count > 0);
    assert.ok([...a.array].every(Number.isFinite));
    g.computeBoundingBox();
    assert.ok(Number.isFinite(g.boundingBox.max.x));
    g.dispose();
  }
});

test("canonical assembly expansion cannot bypass the byte budget", () => {
  const mesh = part("mesh", {
    vertices: Array.from({ length: 256 }, (_, i) => [i / 100, 0, 0]),
    faces: Array.from({ length: 256 }, () => [0, 1, 2]),
  });
  const input = {
    ...scene(
      Array.from({ length: 3 }, (_, i) => ({
        id: "instance" + i,
        type: "assembly",
        assembly: "kit",
      })),
    ),
    assemblies: [
      {
        id: "kit",
        parts: Array.from({ length: 4 }, (_, i) => ({
          ...mesh,
          id: "part" + i,
        })),
      },
    ],
  };
  assert.ok(JSON.stringify(input).length < 60000);
  assert.throws(() => clean(input), /60,000/);
});
test("component explanations include bounded selected-scene context and stay in Talk tool policy", async () => {
  const { runAgent } = require("../src/main/lib/agent");
  const s = clean(raw);
  let calls = 0;
  await runAgent({
    text: "Explain this component",
    mode: "talk",
    activeVisual: {
      ...visualContext(s),
      selectedPart: { id: "left__latch", label: "Latch" },
    },
    signal: new AbortController().signal,
    complete: async (messages, tools) => {
      calls++;
      const context = messages.find(
        (m) =>
          typeof m.content === "string" &&
          m.content.startsWith("Active visual context (untrusted"),
      );
      assert.match(context.content, /selectedPart/);
      assert.match(context.content, /left__latch/);
      assert.ok(tools.some((t) => t.function.name === "update_visual"));
      assert.ok(!tools.some((t) => t.function.name === "powershell"));
      return {
        role: "assistant",
        content: "This is an illustrative latch attached to a hinge frame.",
      };
    },
    execute: () => {
      throw Error("No execution for this explanation fixture");
    },
    approve: () => {
      throw Error("No permission bypass");
    },
  });
  assert.equal(calls, 1);
});
test("selected-component local voice commands pass scene IDs, not executable model instructions", async () => {
  const {
      visualVoiceCommand,
      runVisualVoiceCommand,
    } = require("../src/main/lib/visual-playback"),
    calls = [];
  const canvas = {
    current: { id: "scene" },
    selectedId: "left__latch",
    command: async (...args) => calls.push(args),
  };
  assert.equal(visualVoiceCommand("Explain this component!"), "explain-part");
  await runVisualVoiceCommand(canvas, "explain-part", true);
  await runVisualVoiceCommand(canvas, "focus", false);
  assert.deepEqual(calls, [
    ["explain-part", { visualId: "scene", id: "left__latch" }],
    ["focus", { visualId: "scene", id: "left__latch" }],
  ]);
});
test("large follow-up context stays compact and preserves every expanded part ID and hierarchy", () => {
  const n = 0.12345678901234567;
  const s = clean(
    scene(
      Array.from({ length: 40 }, (_, i) =>
        part("sphere", {
          id: "component_" + i + "a".repeat(30),
          label: "Label ".repeat(10),
          description: "d".repeat(160),
          x: n,
          y: n,
          z: n,
          rotation: [n, n, n],
          scale: [1 + n, 1 + n, 1 + n],
          pivot: [n, n, n],
          labelOffset: [n, n, n],
          material: {
            roughness: n,
            metalness: n,
            clearcoat: n,
            emissiveIntensity: n,
            emissive: "#112233",
          },
        }),
      ),
    ),
  );
  const context = visualContext(s);
  assert.ok(JSON.stringify(context).length <= 18000);
  assert.equal(context.detailsOmitted, true);
  assert.deepEqual(
    context.objects.map((o) => o.id),
    s.objects.map((o) => o.id),
  );
});
