const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { JSDOM } = require("jsdom");
const { validate } = require("../src/main/lib/settings");
const wait = () => new Promise((r) => setTimeout(r, 25));
async function setup(t, kind, { warnings = [] } = {}) {
  const root = path.join(__dirname, "../src/renderer");
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(root, kind === "notch" ? "notch.html" : "index.html"),
      "utf8",
    ),
    { runScripts: "outside-only", url: "http://test/" },
  );
  t.after(() => dom.window.close());
  let backend = validate({ edgeBackground: true, edgeWindowMode: "minimized" }),
    emit;
  const requests = [];
  const status = () => ({
    connected: true,
    backgroundAllowed: backend.edgeBackground,
    windowMode: backend.edgeWindowMode,
    detail: "fixture",
  });
  const api = {
    get: async () => ({ state: "idle", mode: "expanded", route: "settings" }),
    onEvent: (fn) => {
      if (kind === "panel") emit = fn;
    },
    onAppEvent: (fn) => (emit = fn),
    call: async (name, ...args) => {
      requests.push({ name, args });
      if (name === "edge-background")
        backend = { ...backend, edgeWindowMode: "hidden" };
      if (name === "save-settings") backend = validate(args[0]);
      if (name === "patch-settings")
        backend = validate({ ...backend, ...args[0] });
      const data = name.startsWith("edge-")
        ? status()
        : {
            ...backend,
            ...(name.includes("settings") && name !== "get-settings"
              ? { saveWarnings: warnings }
              : {}),
          };
      return { ok: true, data: JSON.parse(JSON.stringify(data)) };
    },
  };
  dom.window[kind === "notch" ? "notch" : "clicky"] = api;
  dom.window.eval(
    fs.readFileSync(
      path.join(root, kind === "notch" ? "notch.js" : "app.js"),
      "utf8",
    ),
  );
  await wait();
  return {
    d: dom.window.document,
    w: dom.window,
    backend: () => backend,
    set: (change) => (backend = { ...backend, ...change }),
    requests,
    status: () => emit({ type: "edge-status", data: status() }),
    event: (type, data) => emit({ type, data }),
  };
}
for (const kind of ["notch", "panel"]) {
  test(`${kind}: Hide Edge -> screen-context toggle -> full Save -> disable keeps Hidden and uses narrow patches`, async (t) => {
    const f = await setup(t, kind);
    f.d.querySelector("#edge-background").click();
    await wait();
    assert.equal(f.backend().edgeWindowMode, "hidden");
    assert.equal(f.d.querySelector("#edge-window-mode").value, "hidden");
    // An independent preference change must survive the quick action too.
    f.set({ buddySize: "large" });
    if (kind === "notch") f.d.querySelector("#screen-toggle").click();
    else {
      f.d.querySelector("#screen-context").checked = false;
      f.d
        .querySelector("#screen-context")
        .dispatchEvent(new f.w.Event("change"));
    }
    await wait();
    assert.equal(f.backend().edgeWindowMode, "hidden");
    assert.equal(f.backend().screenContext, false);
    assert.equal(f.backend().buddySize, "large");
    f.d
      .querySelector("#settings-form")
      .dispatchEvent(new f.w.Event("submit", { cancelable: true }));
    await wait();
    assert.equal(f.backend().edgeWindowMode, "hidden");
    f.d.querySelector("#edge-disable").click();
    await wait();
    assert.equal(f.backend().edgeBackground, false);
    assert.equal(f.backend().edgeWindowMode, "hidden");
    assert.deepEqual(
      f.requests
        .filter((r) => r.name === "patch-settings")
        .map((r) => JSON.parse(JSON.stringify(r.args[0]))),
      [{ screenContext: false }, { edgeBackground: false }],
    );
  });
  test(`${kind}: helper-originated Hidden mode synchronizes snapshot and select without clobbering an unchanged-mode draft`, async (t) => {
    const f = await setup(t, kind);
    f.set({ edgeWindowMode: "hidden" });
    f.status();
    assert.equal(f.d.querySelector("#edge-window-mode").value, "hidden");
    f.d.querySelector("#edge-window-mode").value = "minimized";
    f.status();
    assert.equal(f.d.querySelector("#edge-window-mode").value, "minimized");
    f.d
      .querySelector("#settings-form")
      .dispatchEvent(new f.w.Event("submit", { cancelable: true }));
    await wait();
    assert.equal(f.backend().edgeWindowMode, "minimized");
  });
  test(`${kind}: saved-with-warning is displayed as a successful save with actionable warning`, async (t) => {
    const warning = "Windows startup preference could not be applied.";
    const f = await setup(t, kind, { warnings: [warning] });
    f.d
      .querySelector("#settings-form")
      .dispatchEvent(new f.w.Event("submit", { cancelable: true }));
    await wait();
    assert.match(
      f.d.querySelector("#save-result").textContent,
      /Saved with warnings/,
    );
    assert.ok(f.d.querySelector("#save-result").textContent.includes(warning));
    assert.ok(
      f.d
        .querySelector(kind === "notch" ? "#notice" : "#toast")
        .textContent.includes(warning),
    );
  });
}

for (const kind of ["notch", "panel"]) {
  test(`${kind}: tool errors show the concrete reason as text, not injected HTML`, async (t) => {
    const f = await setup(t, kind);
    const reason = "Visual must be valid JSON <img src=x onerror=bad()>";
    f.event("tool", { name: "show_visual", status: "failed", error: reason });
    const node = f.d.querySelector(
      kind === "notch" ? "#tool-status" : ".tool-message",
    );
    assert.match(node.textContent, /show visual.*failed/);
    assert.ok(node.textContent.includes(reason));
    assert.equal(node.querySelector("img"), null);
    assert.equal(node.hidden, false);
  });
}
