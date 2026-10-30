const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EdgeVoice } = require("../src/main/edge-voice");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "edge-voice-"));
  let background = false;
  const edge = new EdgeVoice({
    userData: dir,
    port: 0,
    getBackground: () => background,
    onBackground: (v) => {
      background = v;
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
  const { edge } = await fixture(t);
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
