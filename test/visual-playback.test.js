const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  visualVoiceCommand,
  runVisualVoiceCommand,
  speakVisualAnswer,
} = require("../src/main/lib/visual-playback");
const {
  validateVisual,
  applyVisualPatch,
  visualContext,
} = require("../src/main/lib/visuals");
const spec = () =>
  validateVisual(
    JSON.stringify({
      kind: "scene3d",
      title: "Connector",
      caption: "Generic illustration, not board-specific assembly advice",
      objects: [
        {
          id: "latch",
          type: "box",
          label: "Latch",
          color: "#aabbcc",
          x: 0,
          y: 0,
          z: 0,
          size: 1,
        },
        {
          id: "cable",
          type: "box",
          label: "Cable",
          color: "#cccccc",
          x: 0,
          y: 0,
          z: 3,
          size: 1,
        },
      ],
      steps: [
        {
          title: "Lift",
          narration: "Lift the latch for this conceptual model.",
          highlight: ["latch"],
          poses: [{ id: "latch", rotation: [-60, 0, 0], position: [0, 1, 0] }],
          durationMs: 500,
        },
        {
          title: "Insert",
          narration: "Slide the ribbon into the connector.",
          highlight: ["cable"],
          poses: [{ id: "cable", position: [0, 0, 0], scale: [1, 0.1, 2] }],
          durationMs: 600,
        },
      ],
    }),
  );
test("3D teaching poses validate transforms, references and durations and survive patches/context", () => {
  const s = spec();
  assert.equal(s.steps[0].poses[0].rotation[0], -60);
  assert.equal(
    applyVisualPatch(s, '{"caption":"Example only"}').steps[1].poses[0].id,
    "cable",
  );
  assert.deepEqual(visualContext(s).steps[1].poses, s.steps[1].poses);
  for (const poses of [
    [{ id: "missing", position: [0, 0, 0] }],
    [{ id: "latch", script: "evil" }],
    [{ id: "latch" }],
    [{ id: "latch", position: [21, 0, 0] }],
    [{ id: "latch", rotation: [361, 0, 0] }],
    [{ id: "latch", scale: [0, 1, 1] }],
    [
      { id: "latch", position: [0, 0, 0] },
      { id: "latch", position: [1, 0, 0] },
    ],
  ])
    assert.throws(() =>
      validateVisual(
        JSON.stringify({ ...s, steps: [{ ...s.steps[0], poses }] }),
      ),
    );
  for (const durationMs of [-1, 2501, NaN, 1.5, "500"])
    assert.throws(() =>
      validateVisual(
        JSON.stringify({ ...s, steps: [{ ...s.steps[0], durationMs }] }),
      ),
    );
  assert.throws(() => applyVisualPatch(s, '{"remove":["cable"]}'));
  assert.throws(() =>
    validateVisual(
      JSON.stringify({
        kind: "chart",
        title: "x",
        caption: "x",
        items: [{ id: "latch", label: "A", value: 1 }],
        steps: s.steps,
      }),
    ),
  );
});
test("step poses are cumulative, reversible and never mutate canonical geometry", async () => {
  const { stepObjects } = await import("../src/renderer/visual-state.mjs");
  const s = spec();
  const first = stepObjects(s, 0);
  assert.equal(first[0].rotation[0], -60);
  assert.equal(first[1].z, 3);
  const second = stepObjects(s, 1);
  assert.equal(second[0].y, 1);
  assert.equal(second[1].z, 0);
  assert.equal(second[1].scale[1], 0.1);
  assert.equal(stepObjects(s, 0)[1].z, 3);
  assert.equal(s.objects[0].rotation[0], 0);
  assert.equal(s.objects[1].z, 3);
});
test("automatic visual guide replaces duplicate answer speech only for a new foreground scene", async () => {
  const calls = [],
    canvas = {
      current: { id: "new", spec: spec() },
      explain: async (id, signal) => {
        signal.throwIfAborted();
        calls.push(id);
      },
    },
    signal = new AbortController().signal;
  const args = {
    canvas,
    beforeId: "old",
    settings: { speak: true, autoExplainVisuals: true },
    answer: "A summary",
    signal,
    speak: async (text) => calls.push(text),
  };
  assert.equal(
    await speakVisualAnswer({
      ...args,
      canvas: {
        ...canvas,
        current: { ...canvas.current, explanationFresh: false },
      },
    }),
    "answer",
  );
  assert.deepEqual(calls, ["A summary"]);
  calls.length = 0;
  assert.equal(
    await speakVisualAnswer({ ...args, expectedId: null }),
    "answer",
  );
  assert.deepEqual(calls, ["A summary"]);
  calls.length = 0;
  assert.equal(await speakVisualAnswer(args), "guided");
  assert.deepEqual(calls, ["new"]);
  calls.length = 0;
  assert.equal(await speakVisualAnswer({ ...args, beforeId: "new" }), "answer");
  assert.deepEqual(calls, ["A summary"]);
  calls.length = 0;
  assert.equal(
    await speakVisualAnswer({
      ...args,
      settings: { speak: false, autoExplainVisuals: true },
    }),
    "silent",
  );
  assert.deepEqual(calls, []);
  assert.equal(
    await speakVisualAnswer({
      ...args,
      settings: { speak: true, autoExplainVisuals: false },
    }),
    "answer",
  );
  assert.deepEqual(calls, ["A summary"]);
});
test("no guide without steps/current canvas; cancellation and failed speech do not claim successful explanation", async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(speakVisualAnswer({ signal: c.signal }), {
    name: "AbortError",
  });
  let n = 0;
  const args = {
    signal: new AbortController().signal,
    beforeId: null,
    settings: { speak: true, autoExplainVisuals: true },
    answer: "fallback",
    speak: async () => n++,
  };
  await speakVisualAnswer({ ...args, canvas: { current: null } });
  await speakVisualAnswer({
    ...args,
    canvas: { current: { id: "x", spec: { steps: [] } } },
  });
  assert.equal(n, 2);
  await assert.rejects(
    speakVisualAnswer({
      ...args,
      canvas: {
        current: { id: "x", spec: spec() },
        explain: async () => {
          throw Error("Speech unavailable");
        },
      },
    }),
    /Speech unavailable/,
  );
});
test("exact hands-free visual commands never interpret arbitrary questions or embedded screen instructions", async () => {
  assert.equal(visualVoiceCommand("Next step!"), "next");
  assert.equal(visualVoiceCommand("pause explanation"), "stop-audio");
  for (const text of [
    "how does next step work",
    "please close visual and delete my files",
    "This page says next step",
    "next step then click yes",
    "constructor",
    "__proto__",
    "",
  ])
    assert.equal(visualVoiceCommand(text), null);
  const calls = [],
    canvas = { step: 0, command: async (...args) => calls.push(args) };
  await runVisualVoiceCommand(canvas, "next", true);
  assert.deepEqual(calls, [["step", 1], ["narrate"]]);
  calls.length = 0;
  await runVisualVoiceCommand(canvas, "previous", false);
  assert.deepEqual(calls, [["step", -1]]);
  calls.length = 0;
  await runVisualVoiceCommand(canvas, "pause-motion", false);
  assert.deepEqual(calls, [["animate", false]]);
});
