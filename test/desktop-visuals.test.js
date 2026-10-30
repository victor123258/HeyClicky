const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  validateVisual,
  applyVisualPatch,
  visualContext,
} = require("../src/main/lib/visuals");
const { DesktopCanvas, canvasBounds } = require("../src/main/desktop-canvas");
const { runAgent } = require("../src/main/lib/agent");
const { validateTool, needsApproval } = require("../src/main/lib/tools");
const object = {
  id: "wing",
  type: "mesh",
  color: "#aabbcc",
  label: "Wing",
  x: 0,
  y: 0,
  z: 0,
  size: 1,
  vertices: [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  faces: [[0, 1, 2]],
};
const scene = (overrides = {}) =>
  validateVisual(
    JSON.stringify({
      kind: "scene3d",
      title: "Concept",
      caption: "Not a simulation",
      objects: [object],
      steps: [
        { title: "Wing", narration: "Look at the wing", highlight: ["wing"] },
      ],
      ...overrides,
    }),
  );
class Window extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.visible = false;
    this.webContents = new EventEmitter();
    this.webContents.send = (...args) => {
      this.sent = args;
    };
    this.webContents.setWindowOpenHandler = (fn) => {
      this.open = fn;
    };
  }
  isDestroyed() {
    return Boolean(this.destroyed);
  }
  setIgnoreMouseEvents(v) {
    this.ignore = v;
  }
  setFocusable(v) {
    this.focusable = v;
  }
  setContentProtection(v) {
    this.protected = v;
  }
  setAlwaysOnTop() {}
  loadFile(file) {
    this.file = file;
  }
  setBounds(bounds) {
    this.bounds = bounds;
  }
  hide() {
    this.visible = false;
  }
  showInactive() {
    this.visible = true;
  }
  show() {
    this.visible = true;
  }
  focus() {
    this.focused = true;
  }
  destroy() {
    this.destroyed = true;
    this.emit("closed");
  }
}
function manager(extra = {}) {
  const screen = {
    getAllDisplays: () => [
      { id: 7, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } },
    ],
    getPrimaryDisplay() {
      return this.getAllDisplays()[0];
    },
  };
  return new DesktopCanvas({ BrowserWindow: Window, screen, ...extra });
}
const present = (m) => m.present({ id: "one", spec: scene() });
test("custom geometry, transforms, safe vectors and narrative steps canonicalize", () => {
  const spec = scene({
    objects: [
      {
        ...object,
        rotation: [0, 90, 0],
        scale: [2, 0.5, 1],
        motion: { mode: "rotate", axis: "y", speed: 0.3 },
      },
    ],
  });
  assert.equal(spec.objects[0].motion.speed, 0.3);
  assert.equal(spec.objects[0].opacity, 1);
  assert.equal(spec.steps[0].highlight[0], "wing");
  assert.equal(
    validateTool("show_visual", { spec: JSON.stringify(spec) }).spec,
    JSON.stringify(spec),
  );
  assert.equal(needsApproval("update_visual"), false);
});
test("reject malformed geometry, duplicate IDs, excessive motion and invalid references", () => {
  for (const changes of [
    {
      vertices: [
        [null, 0, 0],
        [0, 0, 0],
        [1, 1, 1],
      ],
    },
    { faces: [[0, 1, 3]] },
    { rotation: [0, 0, Infinity] },
    { scale: [0, 1, 1] },
    { motion: { mode: "script", axis: "y", speed: 1 } },
    { to: ["x", 1, 1], type: "arrow" },
  ])
    assert.throws(() => scene({ objects: [{ ...object, ...changes }] }));
  assert.throws(() => scene({ objects: [object, object] }));
  assert.throws(() =>
    scene({ steps: [{ title: "x", narration: "y", highlight: ["missing"] }] }),
  );
  assert.throws(() =>
    scene({
      objects: Array.from({ length: 9 }, (_, i) => ({
        ...object,
        id: "a" + i,
        motion: { mode: "pulse", axis: "y", speed: 1 },
      })),
    }),
  );
});
test("mesh and JSON aggregate budgets cannot be bypassed", () => {
  const huge = {
    ...object,
    vertices: Array.from({ length: 256 }, () => [0, 0, 0]),
    faces: [[0, 1, 2]],
  };
  assert.throws(
    () =>
      scene({
        objects: Array.from({ length: 17 }, (_, i) => ({
          ...huge,
          id: "x" + i,
        })),
        steps: [],
      }),
    /budget/,
  );
  assert.throws(() => validateVisual(" ".repeat(60001)), /limit/);
  assert.throws(() => applyVisualPatch(scene(), " ".repeat(30001)), /limit/);
});
test("patch merges stable IDs without mutating old geometry, adds and removes atomically", () => {
  const old = scene(),
    patch = applyVisualPatch(
      old,
      JSON.stringify({
        objects: [
          { id: "wing", color: "#ff0000", rotation: [0, 20, 0] },
          { ...object, id: "tail" },
        ],
        caption: "Revised",
      }),
    );
  assert.equal(patch.objects.length, 2);
  assert.deepEqual(patch.objects[0].vertices, old.objects[0].vertices);
  assert.equal(old.objects[0].color, "#aabbcc");
  assert.throws(() =>
    applyVisualPatch(old, JSON.stringify({ remove: ["wing"] })),
  );
  const removed = applyVisualPatch(
    patch,
    JSON.stringify({ remove: ["wing"], steps: [] }),
  );
  assert.equal(removed.objects[0].id, "tail");
  assert.throws(() =>
    applyVisualPatch(old, '{"objects":[{"id":"wing","script":"bad"}]}'),
  );
  assert.throws(() => applyVisualPatch(old, '{"items":[]}'));
  assert.throws(() => applyVisualPatch(null, "{}"));
  assert.throws(() => applyVisualPatch(old, '{"kind":"chart"}'));
});
test("2D freeform shape coordinates, colors, points and step visibility are checked", () => {
  const raw = {
    kind: "canvas2d",
    title: "Flow",
    caption: "Explanation",
    elements: [
      {
        id: "p",
        type: "path",
        points: [
          [0, 0],
          [1000, 1000],
        ],
        color: "#00ff00",
      },
    ],
    steps: [{ title: "flow", narration: "Trace", visible: ["p"] }],
  };
  assert.equal(validateVisual(JSON.stringify(raw)).elements[0].fontSize, 24);
  assert.throws(() =>
    validateVisual(
      JSON.stringify({ ...raw, elements: [{ type: "text", x: -1 }] }),
    ),
  );
  assert.throws(() =>
    validateVisual(
      JSON.stringify({
        ...raw,
        elements: [{ type: "path", points: [[0, 0]] }],
      }),
    ),
  );
});
test("context removes geometry payloads and executable fields while retaining IDs and transforms", () => {
  const spec = scene({
    script: "evil",
    objects: [
      {
        ...object,
        texture: "https://example.com/a",
        motion: { mode: "pulse", axis: "y", speed: 1 },
      },
    ],
  });
  const context = visualContext(spec);
  assert.equal(context.objects[0].id, "wing");
  assert.equal(context.objects[0].vertexCount, 3);
  assert.equal(context.objects[0].vertices, undefined);
  assert.equal(context.objects[0].texture, undefined);
  assert.equal(context.script, undefined);
  assert.equal(spec.objects[0].vertices.length, 3);
  const updated = applyVisualPatch(
    spec,
    '{"objects":[{"id":"wing","motion":null}]}',
  );
  assert.equal(updated.objects[0].motion, undefined);
});
test("desktop canvas is lazy, sandboxed, protected and click-through; repeated visuals reuse window", async () => {
  const m = manager();
  assert.equal(m.window, null);
  present(m);
  const w = m.window;
  assert.equal(w.options.transparent, true);
  assert.equal(w.options.webPreferences.sandbox, true);
  assert.equal(w.options.webPreferences.nodeIntegration, false);
  assert.equal(w.ignore, true);
  assert.equal(w.focused, undefined);
  assert.equal(w.protected, true);
  await m.command("interact");
  assert.equal(w.ignore, false);
  assert.equal(w.focusable, true);
  await m.command("passthrough");
  assert.equal(w.ignore, true);
  assert.equal(w.focusable, false);
  present(m);
  assert.equal(m.window, w);
  m.dispose();
  assert.equal(w.destroyed, true);
});
test("nested capture/input suspension restores only pass-through; disconnected display dismisses", async () => {
  const m = manager();
  present(m);
  await m.command("interact");
  m.suspend(true);
  m.suspend(true);
  assert.equal(m.window.visible, false);
  m.suspend(false);
  assert.equal(m.window.visible, false);
  m.suspend(false);
  assert.equal(m.window.visible, true);
  assert.equal(m.window.ignore, true);
  m.screen.getAllDisplays = () => [];
  m.refresh();
  assert.equal(m.current, null);
  assert.equal(m.window.visible, false);
});
test("canvas placement stays within small/negative work areas", () => {
  for (const width of [100, 320, 1920])
    for (const height of [90, 480, 1080])
      for (const placement of ["left", "right", "center"]) {
        const a = { x: -1920, y: -200, width, height };
        const b = canvasBounds({ workArea: a }, placement);
        assert.ok(
          b.x >= a.x &&
            b.y >= a.y &&
            b.x + b.width <= a.x + a.width &&
            b.y + b.height <= a.y + a.height,
        );
      }
});
test("tour synchronizes steps, motion and injected abortable speech without overlapping foreground", async () => {
  const calls = [],
    m = manager({
      speak: async (text, signal) => {
        assert.equal(signal.aborted, false);
        calls.push([text, m.step, m.animate]);
      },
    });
  present(m);
  await m.command("tour");
  assert.deepEqual(calls, [["Look at the wing", 0, true]]);
  assert.equal(m.audioState, "off");
  assert.equal(m.animate, false);
  m.canNarrate = () => false;
  m.canInteract = () => false;
  await assert.rejects(m.command("narrate"), /Finish/);
  await assert.rejects(m.command("interact"), /Finish/);
});
test("new scene, dismiss, renderer failure and explicit stop abort narration and release input", async () => {
  for (const action of ["dismiss", "replace", "error", "stop"]) {
    let signal;
    const m = manager({
      speak: (_text, s) =>
        new Promise((resolve, reject) => {
          signal = s;
          s.addEventListener("abort", () => reject(s.reason), { once: true });
        }),
    });
    present(m);
    await m.command("interact");
    const reading = m.command("tour");
    assert.ok(signal);
    if (action === "dismiss") m.dismiss();
    if (action === "replace") present(m);
    if (action === "error") m.rendererError("GPU failed");
    if (action === "stop") await m.command("stop-audio");
    await reading;
    assert.equal(signal.aborted, true);
    assert.equal(m.audioState, "off");
    if (action !== "stop") assert.equal(m.window.ignore, true);
    m.dispose();
  }
});
test("talk voice follow-up gets active context and executes update_visual without desktop approval", async () => {
  let turn = 0,
    executed = false;
  await runAgent({
    text: "Make that wing red",
    mode: "talk",
    activeVisual: visualContext(scene()),
    signal: new AbortController().signal,
    complete: async (messages, tools) => {
      assert.ok(tools.some((t) => t.function.name === "update_visual"));
      assert.ok(
        messages.some(
          (m) =>
            typeof m.content === "string" &&
            m.content.includes("Active visual context") &&
            m.content.includes("wing"),
        ),
      );
      return turn++
        ? { role: "assistant", content: "The wing is red." }
        : {
            role: "assistant",
            tool_calls: [
              {
                id: "patch",
                type: "function",
                function: {
                  name: "update_visual",
                  arguments:
                    '{"changes":"{\\"objects\\":[{\\"id\\":\\"wing\\",\\"color\\":\\"#ff0000\\"}]}"}',
                },
              },
            ],
          };
    },
    execute: async (name, args) => {
      assert.equal(name, "update_visual");
      assert.equal(
        applyVisualPatch(scene(), args.changes).objects[0].color,
        "#ff0000",
      );
      executed = true;
      return "Updated";
    },
    approve: () => {
      throw Error("Should not ask for graphics-only patch");
    },
  });
  assert.equal(executed, true);
});
