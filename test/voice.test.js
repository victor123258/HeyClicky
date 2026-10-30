const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Voice } = require("../src/main/voice");
function setup(settings = {}) {
  const engine = () => ({
    calls: [],
    stop() {},
    stopListening() {},
    cancel() {},
    finishListening() {
      this.finished = true;
    },
    listen(...args) {
      this.calls.push(args);
    },
  });
  const windows = engine(),
    edge = engine(),
    notices = [],
    texts = [],
    errors = [],
    ends = [],
    status = [];
  const voice = new Voice({
    windows,
    edge,
    getSettings: () => ({
      voiceProvider: "edge",
      edgeFallback: true,
      edgeLanguage: "bn-BD",
      ...settings,
    }),
    notify: (t) => notices.push(t),
  });
  voice.listen(
    "talk",
    (t) => texts.push(t),
    (s) => status.push(s),
    (e) => errors.push(e),
    (r) => ends.push(r),
    "en-GB",
    { held: true },
  );
  return { voice, windows, edge, notices, texts, errors, ends, status };
}
function fail(engine) {
  const c = engine.calls.at(-1);
  c[3](Error("Failed"));
  c[4]({ ok: false });
}
test("Edge language is separate; fallback prompts repeat and ignores late provider callbacks", () => {
  const f = setup();
  assert.equal(f.edge.calls[0][5], "bn-BD");
  fail(f.edge);
  assert.equal(f.windows.calls.length, 1);
  assert.equal(f.windows.calls[0][5], "en-GB");
  assert.equal(f.notices.length, 1);
  f.edge.calls[0][1]("late Edge text");
  fail(f.edge);
  assert.equal(f.windows.calls.length, 1);
  assert.deepEqual(f.texts, []);
  f.windows.calls[0][2]({ type: "ready" });
  assert.equal(f.status[0].provider, "windows");
  f.windows.calls[0][1]("actual");
  f.windows.calls[0][4]({ ok: true });
  assert.deepEqual(f.texts, ["actual"]);
  assert.deepEqual(f.ends, [{ ok: true }]);
  assert.equal(f.errors.length, 0);
});
for (const reason of ["released", "delivered", "disabled"])
  test(`No fallback once ${reason}`, () => {
    const f = setup(reason === "disabled" ? { edgeFallback: false } : {});
    if (reason === "released") f.voice.finishListening();
    if (reason === "delivered") f.edge.calls[0][1]("already typed");
    fail(f.edge);
    assert.equal(f.windows.calls.length, 0);
    assert.equal(f.ends.length, 1);
    assert.equal(f.errors.length, 1);
  });
test("Stop ignores all late callbacks and cannot launch fallback", () => {
  const f = setup();
  f.voice.stop();
  f.edge.calls[0][1]("late");
  fail(f.edge);
  assert.deepEqual(f.texts, []);
  assert.deepEqual(f.ends, []);
  assert.equal(f.windows.calls.length, 0);
});
test("Synchronous Windows fallback launch failure reports and ends exactly once", () => {
  const f = setup();
  f.windows.listen = () => {
    throw Error("launch failed");
  };
  fail(f.edge);
  assert.equal(f.errors[0].message, "launch failed");
  assert.deepEqual(f.ends, [{ ok: false }]);
});
test("Synchronous primary provider launch failure ends instead of sticking in Starting", () => {
  const f = setup({ voiceProvider: "windows" });
  f.windows.listen = () => {
    throw Error("policy blocked");
  };
  f.voice.listen(
    "test",
    () => {},
    () => {},
    (e) => f.errors.push(e),
    (r) => f.ends.push(r),
  );
  assert.equal(f.errors[0].message, "policy blocked");
  assert.deepEqual(f.ends, [{ ok: false }]);
});
test("Explicit helper Stop never falls back or starts another microphone", () => {
  const f = setup();
  f.edge.calls[0][4]({ ok: false, cancelled: true });
  assert.equal(f.windows.calls.length, 0);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.ends, [{ ok: false, cancelled: true }]);
});
