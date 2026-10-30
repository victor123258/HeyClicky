const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EdgeVoice } = require("../src/main/edge-voice");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "edge-voice-"));
  let background = false,
    windowMode = "hidden";
  const edge = new EdgeVoice({
    userData: dir,
    port: 0,
    getBackground: () => background,
    getWindowMode: () => windowMode,
    onBackground: (v, mode) => {
      background = v;
      if (mode) windowMode = mode;
    },
  });
  await edge.ensureServer();
  t.after(async () => {
    await edge.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const request = (url, options = {}) =>
    fetch(edge.origin + url, {
      ...options,
      headers: { Authorization: `Bearer ${edge.token}`, ...options.headers },
    });
  const events = [];
  edge.send = (e) => events.push(e);
  // Real HTTP security is tested separately. Recognition protocol uses a fake
  // connected stream so these tests never start a browser or open a microphone.
  const connect = () => {
    edge.stream = { destroyed: false, end() {}, write() {} };
    edge.lastBeat = Date.now();
  };
  const texts = [],
    errors = [],
    ends = [],
    status = [];
  const listen = (mode = "talk", held = true) => {
    connect();
    edge.listen(
      mode,
      (t) => texts.push(t),
      (s) => status.push(s),
      (e) => errors.push(e),
      (r) => ends.push(r),
      "en-US",
      { held },
    );
    return edge.active.id;
  };
  return {
    edge,
    request,
    events,
    connect,
    listen,
    texts,
    errors,
    ends,
    status,
  };
}
test("Loopback helper enforces capability, host, origin, no framing and no secret in public status", async (t) => {
  const { edge, request } = await fixture(t);
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await request("/event", {
        method: "POST",
        headers: { Authorization: "" },
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/event", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    await new Promise((resolve, reject) => {
      require("node:http")
        .get(
          edge.origin + "/",
          { headers: { Host: "evil.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on("error", reject);
    }),
    403,
  );
  assert.equal(
    (await request("/", { headers: { Origin: "https://evil.example" } }))
      .status,
    403,
  );
  assert.equal((await request("/../package.json")).status, 404);
  assert.ok(!JSON.stringify(edge.status()).includes(edge.token));
  assert.equal(
    (await request("/event", { method: "POST", body: "{" })).status,
    400,
  );
});
test("Background approval requires a successful visible recognition test", async (t) => {
  const { edge, connect } = await fixture(t);
  connect();
  await assert.rejects(edge.event({ type: "background-approved" }));
  assert.equal(edge.status().backgroundAllowed, false);
  await edge.event({ type: "test-success" });
  await edge.event({ type: "background-approved" });
  assert.equal(edge.status().backgroundAllowed, true);
});
test("Held Edge turn submits one final only after release; late messages are ignored", async (t) => {
  const f = await fixture(t),
    id = f.listen();
  await Promise.resolve();
  await f.edge.event({ type: "ready", id });
  await f.edge.event({ type: "partial", id, text: "hello" });
  assert.deepEqual(f.texts, []);
  f.edge.finishListening();
  await f.edge.event({ type: "final", id, text: "hello world" });
  await f.edge.event({ type: "final", id, text: "duplicate" });
  assert.deepEqual(f.texts, ["hello world"]);
  assert.deepEqual(f.ends, [{ ok: true }]);
  assert.equal(f.errors.length, 0);
});
test("Early held end cannot submit text; cancellation is acknowledged without later events", async (t) => {
  const f = await fixture(t),
    id = f.listen();
  await Promise.resolve();
  await f.edge.event({ type: "ready", id });
  await f.edge.event({ type: "final", id, text: "too soon" });
  assert.deepEqual(f.texts, []);
  assert.equal(f.errors.length, 1);
  assert.ok(f.edge.pendingStops.has(id));
  await f.edge.event({ type: "stopped", id });
  assert.equal(f.edge.pendingStops.size, 0);
});
test("Release during startup is forwarded immediately when the helper connects", async (t) => {
  const f = await fixture(t),
    id = f.listen();
  f.edge.finishListening();
  await Promise.resolve();
  assert.deepEqual(
    f.events.slice(-2).map((e) => e.type),
    ["start", "finish"],
  );
  await f.edge.event({ type: "ready", id });
  await f.edge.event({ type: "final", id, text: "short turn" });
  assert.deepEqual(f.texts, ["short turn"]);
});
test("Stop invalidates pending text and cancels the exact session", async (t) => {
  const f = await fixture(t),
    id = f.listen();
  await Promise.resolve();
  f.edge.cancel();
  await f.edge.event({ type: "final", id, text: "late" });
  assert.deepEqual(f.texts, []);
  assert.deepEqual(f.ends, []);
  assert.ok(f.events.some((e) => e.type === "cancel" && e.id === id));
  await f.edge.event({ type: "stopped", id });
});
test("Edge failure without setup is actionable and releases the turn", async (t) => {
  const f = await fixture(t);
  f.edge.listen(
    "test",
    () => {},
    () => {},
    (e) => f.errors.push(e),
    (r) => f.ends.push(r),
  );
  await new Promise((r) => setImmediate(r));
  assert.match(f.errors[0].message, /Set up Edge/);
  assert.equal(f.edge.active, null);
  assert.deepEqual(f.ends, [{ ok: false }]);
});

test("Real NDJSON connection carries start/finish and replacement cannot write after end", async (t) => {
  const f = await fixture(t),
    edge = f.edge;
  edge.send = EdgeVoice.prototype.send.bind(edge);
  const response = await f.request("/stream"),
    reader = response.body.getReader();
  let pending = "";
  async function line() {
    while (!pending.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw Error("Stream ended");
      pending += new TextDecoder().decode(value);
    }
    const end = pending.indexOf("\n"),
      item = JSON.parse(pending.slice(0, end));
    pending = pending.slice(end + 1);
    return item;
  }
  assert.equal((await line()).type, "hello");
  assert.equal(edge.connected, true);
  edge.listen(
    "talk",
    (text) => f.texts.push(text),
    () => {},
    (error) => f.errors.push(error),
    (r) => f.ends.push(r),
    "en-US",
    { held: true },
  );
  const start = await line();
  assert.equal(start.type, "start");
  await edge.event({ type: "ready", id: start.id });
  const replacement = await f.request("/stream");
  assert.equal(replacement.status, 200);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /replaced/);
  assert.deepEqual(f.ends, [{ ok: false }]);
  // An old helper can acknowledge its exact cancellation without touching the new stream.
  await edge.event({ type: "stopped", id: start.id });
  assert.equal(edge.pendingStops.size, 0);
  await reader.cancel();
  await replacement.body.cancel();
});
test("Explicit helper cancellation releases active turn without a recognition error", async (t) => {
  const f = await fixture(t),
    id = f.listen();
  await Promise.resolve();
  await f.edge.event({ type: "cancelled", id });
  await f.edge.event({ type: "final", id, text: "late" });
  assert.equal(f.edge.active, null);
  assert.deepEqual(f.ends, [{ ok: false, cancelled: true }]);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.texts, []);
});
test("Hidden background window is opt-in and visible setup restores it", async (t) => {
  const f = await fixture(t),
    actions = [];
  f.edge.getWindowMode = () => "hidden";
  f.edge.windowAction = async (a) => actions.push(a);
  f.connect();
  await assert.rejects(f.edge.background(), /approve background/);
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  assert.equal(f.edge.status().windowMode, "hidden");
  assert.deepEqual(actions, ["hide"]);
  assert.match(f.edge.status().detail, /experimental/);
  await f.edge.openSetup();
  assert.deepEqual(actions, ["hide", "restore"]);
  assert.equal(f.edge.forceVisible, true);
});

function fakeNative(edge, collect = async () => "1") {
  const actions = [];
  edge.native = {
    launch: (script, args, input) => {
      assert.equal(script, "edge-window.ps1");
      assert.equal(input.profile, edge.profile);
      actions.push(input.action);
      return input;
    },
    collect,
  };
  return actions;
}
test("Hide helper explicitly replaces a saved minimized preference after approved setup", async (t) => {
  const f = await fixture(t);
  f.connect();
  const actions = fakeNative(f.edge);
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved", windowMode: "minimized" });
  assert.equal(f.edge.status().windowMode, "minimized");
  await f.edge.background("hidden");
  assert.equal(f.edge.status().windowMode, "hidden");
  assert.deepEqual(actions, ["minimize", "hide"]);
  await f.edge.openSetup();
  assert.deepEqual(actions, ["minimize", "hide", "restore"]);
  assert.match(f.edge.status().detail, /restored/);
});
test("Hidden setup still needs successful microphone test and rejects invalid modes", async (t) => {
  const f = await fixture(t);
  f.connect();
  const actions = fakeNative(f.edge);
  await assert.rejects(f.edge.background("hidden"), /test.*approve/);
  await assert.rejects(
    f.edge.event({ type: "background-approved", windowMode: "hidden" }),
    /Test the microphone/,
  );
  await f.edge.event({ type: "test-success" });
  await assert.rejects(
    f.edge.event({ type: "background-approved", windowMode: "arbitrary" }),
    /Invalid Edge window mode/,
  );
  assert.equal(f.edge.status().backgroundAllowed, false);
  assert.deepEqual(actions, []);
  await f.edge.event({ type: "background-approved" });
  assert.deepEqual(actions, ["hide"]);
});
test("Failed native verification does not claim the helper window was hidden", async (t) => {
  const f = await fixture(t);
  f.connect();
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  fakeNative(f.edge, async () => "0");
  await assert.rejects(f.edge.background(), /could not be verified/);
  assert.match(f.edge.status().detail, /Could not verify/);
  await f.edge.keepInBackground();
  assert.match(f.edge.status().detail, /Could not verify/);
});
test("Saving a changed window preference applies immediately; disabling background restores setup", async (t) => {
  const f = await fixture(t);
  f.connect();
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  const actions = fakeNative(f.edge);
  await f.edge.applyWindowPreferences({
    edgeBackground: true,
    edgeWindowMode: "minimized",
  });
  assert.deepEqual(actions, ["hide"]);
  await f.edge.onBackground(false);
  await f.edge.applyWindowPreferences({
    edgeBackground: true,
    edgeWindowMode: "hidden",
  });
  assert.deepEqual(actions, ["hide", "restore"]);
  assert.equal(f.edge.forceVisible, true);
});
test("A native startup hide cannot finish after and undo explicit setup restore", async (t) => {
  const f = await fixture(t);
  f.connect();
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  let release, started;
  const ready = new Promise((r) => (started = r));
  const actions = fakeNative(f.edge, async (input) => {
    if (input.action === "hide") {
      started();
      await new Promise((r) => (release = r));
    }
    return "1";
  });
  const hide = f.edge.background();
  await ready;
  const restore = f.edge.openSetup();
  release();
  await Promise.all([hide, restore]);
  assert.deepEqual(actions, ["hide", "restore"]);
  assert.equal(f.edge.forceVisible, true);
  assert.match(f.edge.status().detail, /restored/);
});
test("Queued stale hides are skipped once the user restores visible setup", async (t) => {
  const f = await fixture(t);
  f.connect();
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  let release, started;
  const ready = new Promise((r) => (started = r));
  let first = true;
  const actions = fakeNative(f.edge, async () => {
    if (first) {
      first = false;
      started();
      await new Promise((r) => (release = r));
    }
    return "1";
  });
  const pending = f.edge.windowAction("restore");
  await ready;
  const hide = f.edge.keepInBackground();
  const show = f.edge.openSetup();
  release();
  await Promise.all([pending, hide, show]);
  assert.deepEqual(actions, ["restore", "restore"]);
});
test("Speech ready reasserts approved background mode, but never hides an explicitly restored setup", async (t) => {
  const f = await fixture(t);
  f.connect();
  await f.edge.event({ type: "test-success" });
  await f.edge.event({ type: "background-approved" });
  const actions = fakeNative(f.edge);
  const id = f.listen();
  await f.edge.event({ type: "ready", id });
  await f.edge.windowQueue;
  assert.deepEqual(actions, ["hide"]);
  f.edge.forceVisible = true;
  const next = f.listen();
  await f.edge.event({ type: "ready", id: next });
  await f.edge.windowQueue;
  assert.deepEqual(actions, ["hide"]);
  f.edge.cancel();
  for (const pending of f.edge.pendingStops.keys())
    await f.edge.event({ type: "stopped", id: pending });
});

test("Approved cold launches request hiding before a helper stream connects; cancelled launches do not open Edge", async (t) => {
  const f = await fixture(t);
  await f.edge.onBackground(true, "hidden");
  f.edge.platform = "win32";
  f.edge.edgePath = () => "dedicated-msedge.exe";
  const launches = [];
  const actions = fakeNative(f.edge);
  f.edge.spawn = (exe, args, options) => {
    launches.push({ exe, args, options });
    const child = new (require("node:events").EventEmitter)();
    child.unref = () => {};
    return child;
  };
  await f.edge.launch(false);
  assert.equal(launches.length, 0);
  f.edge.active = {};
  try {
    await f.edge.launch(false);
    await f.edge.windowQueue;
    assert.equal(launches.length, 1);
    assert.ok(launches[0].args.includes("--start-minimized"));
    assert.ok(launches[0].args.includes(`--user-data-dir=${f.edge.profile}`));
    assert.deepEqual(actions, ["hide"]);
  } finally {
    f.edge.active = null;
  }
});
