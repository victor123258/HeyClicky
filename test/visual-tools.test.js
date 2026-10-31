const { test } = require("node:test");
const assert = require("node:assert/strict");
const { tools, validateTool, needsApproval } = require("../src/main/lib/tools");
const { validateVisual, applyVisualPatch } = require("../src/main/lib/visuals");
const { runAgent } = require("../src/main/lib/agent");
const { complete } = require("../src/main/lib/llm");

const examples = [
  { kind: "chart", items: [{ label: "A", value: 2 }] },
  { kind: "diagram", nodes: [{ id: "a", label: "A", x: 100, y: 100 }] },
  {
    kind: "canvas2d",
    elements: [{ type: "arrow", x: 100, y: 500, x2: 900, y2: 500 }],
  },
  { kind: "scene3d", objects: [{ id: "ball", type: "sphere" }] },
].map((s) => ({ title: "Example", caption: "Conceptual, not measured", ...s }));

test("all function descriptions fit a conservative 1024-character provider budget", () => {
  for (const { function: f } of tools) {
    assert.ok(
      f.description.length <= 1024,
      `${f.name}: ${f.description.length}`,
    );
    assert.equal(f.parameters.additionalProperties, false);
    assert.deepEqual(
      f.parameters.required,
      Object.keys(f.parameters.properties),
    );
  }
  const visual = tools.find((t) => t.function.name === "show_visual").function;
  assert.match(visual.parameters.properties.spec.description, /canvas2d/);
  assert.match(visual.parameters.properties.spec.description, /scene3d/);
});

for (const spec of examples) {
  test(`${spec.kind}: object and JSON-string tool payloads reach the same canonical visual`, () => {
    const original = structuredClone(spec);
    const canonical = validateVisual(spec);
    for (const payload of [spec, JSON.stringify(spec)]) {
      const args = validateTool("show_visual", { spec: payload });
      assert.equal(typeof args.spec, "string");
      assert.deepEqual(validateVisual(args.spec), canonical);
      // Main, desktop canvas and renderer all revalidate; defaults must be stable.
      assert.deepEqual(validateVisual(JSON.stringify(canonical)), canonical);
    }
    assert.deepEqual(spec, original);
  });
  test(`${spec.kind}: follow-up patches accept both encodings without losing the scene`, () => {
    const current = validateVisual(spec);
    for (const changes of [{ caption: "Updated" }, '{"caption":"Updated"}']) {
      const args = validateTool("update_visual", { changes });
      assert.equal(typeof args.changes, "string");
      assert.deepEqual(applyVisualPatch(current, args.changes), {
        ...current,
        caption: "Updated",
      });
      assert.deepEqual(applyVisualPatch(current, { caption: "Updated" }), {
        ...current,
        caption: "Updated",
      });
      assert.equal(current.caption, spec.caption);
    }
  });
}

test("3D defaults only fill omitted fields; explicit invalid values and missing geometry still fail", () => {
  const scene = examples[3];
  const defaults = validateVisual(scene).objects[0];
  assert.deepEqual(
    [defaults.x, defaults.y, defaults.z, defaults.size, defaults.color],
    [0, 0, 0, 1, "#a4b5cf"],
  );
  for (const field of [
    { x: 21 },
    { x: "0" },
    { x: null },
    { size: 0 },
    { size: null },
    { color: "red" },
    { color: null },
    { type: "javascript" },
    { type: "arrow" },
    { type: "mesh" },
    { type: "tube" },
  ])
    assert.throws(() =>
      validateVisual({
        ...scene,
        objects: [{ ...scene.objects[0], ...field }],
      }),
    );
  const next = applyVisualPatch(validateVisual(scene), {
    objects: [{ id: "new", type: "box" }],
  });
  assert.equal(next.objects.length, 2);
  assert.equal(next.objects[1].size, 1);
  assert.throws(
    () => applyVisualPatch(next, { objects: [{ id: "new", x: 100 }] }),
    /bounded/,
  );
  assert.throws(
    () =>
      validateVisual({
        ...scene,
        objects: Array.from({ length: 41 }, () => ({ type: "box" })),
      }),
    /1–40/,
  );
});

test("defaulted 3D template parts expand and revalidate without multiplying objects", () => {
  const s = validateVisual({
    ...examples[3],
    assemblies: [{ id: "part", parts: [{ id: "body", type: "box" }] }],
    objects: [{ id: "instance", type: "assembly", assembly: "part" }],
  });
  assert.equal(s.objects.length, 2);
  assert.equal(s.objects[1].parent, "instance");
  assert.deepEqual(validateVisual(s), s);
});

test("diagram edges and labels may be omitted, but invalid labels/references are not repaired", () => {
  const spec = examples[1];
  assert.deepEqual(validateVisual(spec).edges, []);
  assert.deepEqual(
    validateVisual({ ...spec, edges: [{ from: "a", to: "a" }] }).edges,
    [{ from: "a", to: "a", label: "" }],
  );
  for (const edges of [
    null,
    [{ from: "a", to: "missing" }],
    [{ from: "a", to: "a", label: null }],
  ])
    assert.throws(() => validateVisual({ ...spec, edges }), /edges/);
});

test("both visual tools reject non-object JSON, malformed JSON, executable text and oversized payloads", () => {
  for (const [name, key, limit] of [
    ["show_visual", "spec", 60000],
    ["update_visual", "changes", 30000],
  ]) {
    for (const bad of [
      null,
      [],
      1,
      false,
      "null",
      "[]",
      '"string"',
      "{",
      "```json\n{}\n```",
      "alert(1)",
      "{}\0",
    ])
      assert.throws(() => validateTool(name, { [key]: bad }));
    for (const big of [
      { caption: "a".repeat(limit) },
      JSON.stringify({ caption: "a".repeat(limit) }),
    ])
      assert.throws(() => validateTool(name, { [key]: big }), /limit/);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => validateTool(name, { [key]: cyclic }), /cycles/);
  }
  for (const changes of [{}, { code: "alert(1)" }, { kind: "scene3d" }])
    assert.throws(
      () => validateTool("update_visual", { changes }),
      /Unknown or empty/,
    );
  assert.throws(
    () => validateTool("show_visual", { spec: examples[2], unexpected: true }),
    /Unexpected/,
  );
  assert.throws(() => validateTool("click", { x: 100, y: 100 }));
  assert.throws(() =>
    validateTool("click", { x: "100", y: 100, button: "left" }),
  );
  for (const name of [
    "read_file",
    "fetch_url",
    "powershell",
    "write_file",
    "create_document",
  ])
    assert.equal(needsApproval(name, false), true);
});

test("OpenRouter adapter → agent → visual validation handles object arguments and follow-up edits", async () => {
  let round = 0,
    current;
  const events = [];
  const result = await runAgent({
    text: "Draw a ball and change its color",
    mode: "talk",
    signal: new AbortController().signal,
    approve: async () => {
      throw Error("Visuals should not require approval");
    },
    onTool: (e) => events.push(e),
    complete: (messages, allowed, signal) =>
      complete({
        key: "test-only",
        model: "test",
        messages,
        tools: allowed,
        signal,
        fetchImpl: async (_url, options) => {
          const request = JSON.parse(options.body);
          for (const t of request.tools)
            assert.ok(t.function.description.length <= 1024);
          if (round++) {
            assert.ok(
              messages.some((m) => m.role === "tool" && m.content === "OK"),
            );
          }
          const message =
            round === 1
              ? {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "show",
                      type: "function",
                      function: {
                        name: "show_visual",
                        arguments: { spec: examples[3] },
                      },
                    },
                  ],
                }
              : round === 2
                ? {
                    role: "assistant",
                    tool_calls: [
                      {
                        id: "edit",
                        type: "function",
                        function: {
                          name: "update_visual",
                          arguments: JSON.stringify({
                            changes: {
                              objects: [{ id: "ball", color: "#ff0000" }],
                            },
                          }),
                        },
                      },
                    ],
                  }
                : { role: "assistant", content: "Done" };
          return { ok: true, json: async () => ({ choices: [{ message }] }) };
        },
      }),
    execute: async (name, args) => {
      assert.equal(
        typeof args[name === "show_visual" ? "spec" : "changes"],
        "string",
      );
      current =
        name === "show_visual"
          ? validateVisual(args.spec)
          : applyVisualPatch(current, args.changes);
      return "OK";
    },
  });
  assert.equal(result, "Done");
  assert.equal(current.objects[0].id, "ball");
  assert.equal(current.objects[0].color, "#ff0000");
  assert.deepEqual(
    events.map((e) => e.status),
    ["pending", "done", "pending", "done"],
  );
});

test("failed visual validation exposes a bounded concrete error and permits a corrected call, never executing invalid data", async () => {
  let round = 0,
    executions = 0;
  const events = [];
  await runAgent({
    text: "Draw a diagram",
    mode: "talk",
    signal: new AbortController().signal,
    onTool: (e) => events.push(e),
    complete: async (messages) => {
      if (round === 1)
        assert.match(messages.at(-1).content, /Tool failed:.*valid JSON/);
      if (round++ >= 2) return { role: "assistant", content: "Done" };
      return {
        role: "assistant",
        tool_calls: [
          {
            id: String(round),
            type: "function",
            function: {
              name: "show_visual",
              arguments: JSON.stringify({
                spec: round === 1 ? "{bad JSON" : examples[1],
              }),
            },
          },
        ],
      };
    },
    execute: async (_name, args) => {
      executions++;
      validateVisual(args.spec);
      return "OK";
    },
  });
  assert.equal(executions, 1);
  assert.equal(events[0].status, "failed");
  assert.match(events[0].error, /valid JSON/);
  assert.ok(events[0].error.length <= 240);
  assert.equal(events.at(-1).status, "done");
});
