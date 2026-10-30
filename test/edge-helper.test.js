const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const wait = () => new Promise((r) => setImmediate(r));
async function fixture(t) {
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(__dirname, "../src/edge-voice/index.html"),
      "utf8",
    ),
    {
      runScripts: "outside-only",
      url: "http://127.0.0.1:21843/#test-capability",
    },
  );
  const w = dom.window,
    events = [],
    recorders = [];
  let controller;
  Object.defineProperty(w.navigator, "userAgent", {
    value: "Mozilla/5.0 Edg/140.0",
  });
  Object.defineProperty(w.navigator, "mediaDevices", {
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
  });
  w.TextDecoder = TextDecoder;
  w.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-capability");
    if (url === "/event") {
      events.push(JSON.parse(options.body));
      return { ok: true };
    }
    return {
      ok: true,
      body: new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
    };
  };
  w.SpeechRecognition = class {
    constructor() {
      recorders.push(this);
    }
    start() {
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.aborted = true;
    }
    result(text, final = true) {
      const result = [{ transcript: text }];
      result.isFinal = final;
      this.onresult?.({ resultIndex: 0, results: [result] });
    }
  };
  w.eval(
    fs.readFileSync(path.join(__dirname, "../src/edge-voice/voice.js"), "utf8"),
  );
  await wait();
  t.after(async () => {
    controller.close();
    await wait();
    w.close();
  });
  return {
    w,
    events,
    recorders,
    async send(command) {
      controller.enqueue(
        new TextEncoder().encode(JSON.stringify(command) + "\n"),
      );
      await wait();
    },
  };
}
test("Visible helper requires recognition success AND explicit consent for background approval", async (t) => {
  const f = await fixture(t),
    d = f.w.document;
  assert.equal(f.w.location.hash, "");
  assert.equal(d.querySelector("#background").disabled, true);
  d.querySelector("#consent").checked = true;
  d.querySelector("#consent").dispatchEvent(new f.w.Event("change"));
  assert.equal(d.querySelector("#background").disabled, true);
  d.querySelector("#test").click();
  await wait();
  const rec = f.recorders[0];
  rec.result("real test sentence");
  rec.stop();
  await wait();
  assert.ok(f.events.some((e) => e.type === "test-success"));
  assert.equal(d.querySelector("#background").disabled, false);
  d.querySelector("#background").click();
  await wait();
  assert.ok(
    f.events.some(
      (e) => e.type === "background-approved" && e.windowMode === "hidden",
    ),
  );
});
test("Helper held recognition never submits before finish and acknowledges Stop without late text", async (t) => {
  const f = await fixture(t);
  await f.send({
    type: "start",
    id: "one",
    mode: "talk",
    held: true,
    language: "en-US",
  });
  f.recorders[0].result("held sentence");
  await wait();
  assert.ok(!f.events.some((e) => e.type === "final"));
  await f.send({ type: "finish", id: "one" });
  assert.equal(f.events.find((e) => e.type === "final").text, "held sentence");
  await f.send({ type: "cancel", id: "one" });
  assert.ok(f.events.some((e) => e.type === "stopped" && e.id === "one"));
  await f.send({ type: "start", id: "two", mode: "talk", held: true });
  const rec = f.recorders[1];
  await f.send({ type: "cancel", id: "two" });
  rec.result("late");
  rec.stop();
  await wait();
  assert.equal(rec.aborted, true);
  assert.equal(f.events.filter((e) => e.type === "final").length, 1);
  assert.ok(f.events.some((e) => e.type === "stopped" && e.id === "two"));
});
test("Visible test cannot replace an active app microphone; helper Stop cancels the turn", async (t) => {
  const f = await fixture(t);
  await f.send({ type: "start", id: "active", mode: "talk", held: true });
  f.w.document.querySelector("#test").click();
  await wait();
  assert.equal(f.recorders.length, 1);
  f.w.document.querySelector("#stop").click();
  await wait();
  assert.equal(f.recorders[0].aborted, true);
  assert.ok(f.events.some((e) => e.type === "cancelled" && e.id === "active"));
});
