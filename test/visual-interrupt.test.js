// Exercise the real foreground/hold handlers in an isolated VM without launching Electron,
// requesting microphone permission or contacting a model. Window/speech boundaries are injected.
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
const {
  speakVisualAnswer,
  visualVoiceCommand,
  runVisualVoiceCommand,
} = require("../src/main/lib/visual-playback");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../src/main/index.js"),
  "utf8",
);
function fixture() {
  let release, startedResolve;
  const started = new Promise((r) => (startedResolve = r)),
    calls = [];
  const canvas = {
    current: null,
    step: 0,
    audioState: "off",
    cancelNarration() {
      release?.();
    },
    setInteractive() {},
    dismiss() {
      this.cancelNarration();
      this.current = null;
    },
    async explain() {
      this.audioState = "tour";
      startedResolve();
      await new Promise((r) => (release = r));
      this.audioState = "off";
    },
    async command(action, value) {
      calls.push([action, value]);
      if (action === "step") this.step = value;
    },
  };
  const ctx = vm.createContext({
    AbortController,
    setImmediate,
    controller: null,
    listeningMode: null,
    requestRunning: false,
    currentTaskId: null,
    state: "idle",
    afterVisualGuide: null,
    visualResumeVersion: 0,
    backgroundJobs: null,
    approval: null,
    heldTurn: null,
    history: [],
    activeDisplay: null,
    lastAnnotations: [],
    quitting: false,
    desktopCanvas: canvas,
    settings: {
      key: "fixture",
      value: { screenContext: false, speak: true, autoExplainVisuals: true },
    },
    tasks: { get: () => null, next: () => null, stopAll() {} },
    screen: {
      getDisplayNearestPoint: () => ({ bounds: {} }),
      getCursorScreenPoint: () => ({}),
    },
    keys: { ready: true },
    notch: { clear() {} },
    execute() {
      canvas.current = {
        id: "new",
        spec: { steps: [{ narration: "First" }, { narration: "Second" }] },
      };
      return "Visual shown";
    },
    approve() {
      throw Error("Unexpected approval");
    },
    broadcast() {},
    emit() {},
    setState(s) {
      ctx.state = s;
    },
    error(e) {
      throw e;
    },
    speech: {
      speak() {
        throw Error("No duplicate speech expected");
      },
      stop() {
        calls.push(["stop-speech"]);
      },
      stopListening() {
        calls.push(["cancel-mic"]);
      },
      listen() {
        calls.push(["listen"]);
      },
    },
    speakVisualAnswer,
    visualVoiceCommand,
    runVisualVoiceCommand,
    runAgent: async ({ execute }) => {
      calls.push(["model"]);
      await execute("show_visual", {});
      return "summary";
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf("async function ask("),
      source.indexOf("function cancelTask("),
    ),
    ctx,
  );
  vm.runInContext(
    source.slice(
      source.indexOf("function startHold("),
      source.indexOf("function toggleDictation("),
    ),
    ctx,
  );
  vm.runInContext(
    source.slice(
      source.indexOf("function stop("),
      source.indexOf("function registerHotkeys("),
    ),
    ctx,
  );
  return { ctx, canvas, calls, started };
}
test("new spoken step command interrupts automatic guide, waits for task drain, keeps visual and avoids another model call", async () => {
  const { ctx, canvas, calls, started } = fixture();
  const asking = ctx.ask("Teach me");
  await started;
  ctx.submit("next step", "talk");
  await asking;
  await new Promise(setImmediate);
  assert.equal(ctx.requestRunning, false);
  assert.equal(ctx.controller, null);
  assert.equal(canvas.current.id, "new");
  assert.equal(canvas.step, 1);
  assert.equal(calls.filter((c) => c[0] === "model").length, 1);
  assert.ok(calls.some((c) => c[0] === "narrate"));
});
test("holding Talk during automatic guide opens microphone only after narration/task settles", async () => {
  const { ctx, calls, started } = fixture();
  const asking = ctx.ask("Teach me");
  await started;
  ctx.startHold("talk", "keyboard");
  assert.equal(
    calls.some((c) => c[0] === "listen"),
    false,
  );
  await asking;
  await new Promise(setImmediate);
  assert.ok(calls.some((c) => c[0] === "listen"));
  assert.equal(ctx.heldTurn.mode, "talk");
});
test("releasing a pending hold before guide drains never opens microphone or submits a follow-up", async () => {
  const { ctx, calls, started } = fixture();
  const asking = ctx.ask("Teach me");
  await started;
  ctx.startHold("talk", "keyboard");
  ctx.releaseHold("keyboard", true);
  await asking;
  await new Promise(setImmediate);
  assert.equal(
    calls.some((c) => c[0] === "listen"),
    false,
  );
  assert.equal(ctx.heldTurn, null);
  assert.equal(calls.filter((c) => c[0] === "model").length, 1);
});

test("Stop after task drain invalidates already-scheduled microphone resume", async () => {
  const { ctx, calls, started } = fixture();
  const asking = ctx.ask("Teach me");
  await started;
  ctx.startHold("talk", "keyboard");
  await asking;
  ctx.stop();
  await new Promise(setImmediate);
  assert.equal(
    calls.some((c) => c[0] === "listen"),
    false,
  );
});
