const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "../src/renderer");
const wait = () => new Promise((r) => setTimeout(r, 20));
async function setup() {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "notch.html"), "utf8"),
    { runScripts: "outside-only", url: "http://preview/notch.html" },
  );
  dom.window.eval(fs.readFileSync(path.join(root, "notch-demo.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(root, "notch.js"), "utf8"));
  await wait();
  return dom;
}
test("notch contains Home, conversation and complete settings, with no external panel navigation", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    assert.equal(d.body.classList.contains("browser-preview"), true);
    assert.equal(d.querySelector("#workspace").hidden, false);
    for (const route of ["chat", "settings", "home"]) {
      d.querySelector(`[data-route=${route}]`).click();
      await wait();
      assert.equal(d.querySelector(`#route-${route}`).hidden, false);
    }
    assert.equal(d.querySelectorAll("#hotkeys input").length, 5);
  } finally {
    dom.window.close();
  }
});
test("peek and collapsed native-layout states keep the workspace hidden", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    d.querySelector("[data-preview=collapsed]").click();
    assert.equal(d.querySelector("#workspace").hidden, true);
    d.querySelector("[data-preview=peek]").click();
    assert.equal(d.querySelector("#peek").hidden, false);
    d.querySelector("#open-home").click();
    await wait();
    assert.equal(d.querySelector("#workspace").hidden, false);
  } finally {
    dom.window.close();
  }
});
test("sample task cards are labelled previews and open their own thread", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    assert.equal(d.querySelectorAll("#jobs .job-card").length, 0);
    d.querySelector("#demo-tasks").click();
    await wait();
    assert.equal(d.querySelectorAll("#jobs .job-card").length, 2);
    assert.match(d.querySelector("#notice").textContent, /Sample cards/);
    d.querySelector("#jobs .job-card").click();
    await wait();
    assert.match(d.querySelector("#thread-title").textContent, /spreadsheet/);
  } finally {
    dom.window.close();
  }
});
test("notch message text is escaped and new agent requests create real session cards in preview", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    d.querySelector("[data-mode=agent]").click();
    d.querySelector("#prompt").value = "<img src=x onerror=bad()>";
    d.querySelector("#composer").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    assert.equal(d.querySelector("#thread img"), null);
    assert.equal(
      d.querySelector(".message-text").textContent,
      "<img src=x onerror=bad()>",
    );
    assert.equal(d.querySelectorAll("#jobs .job-card").length, 1);
  } finally {
    dom.window.close();
  }
});
test("notch settings persist new caption preference and refuse real keys in browser preview", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    d.querySelector("#captions").checked = false;
    d.querySelector("#settings-form").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    assert.match(d.querySelector("#save-result").textContent, /Saved/);
    assert.equal(d.querySelector("#captions").checked, false);
    d.querySelector("#api-key").value = "secret";
    d.querySelector("#settings-form").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    assert.match(
      d.querySelector("#notice").textContent,
      /Do not enter a real key/,
    );
  } finally {
    dom.window.close();
  }
});
test("keyboard hold button waits for release; cancel does not create a message", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document,
      b = d.querySelector("#hold-talk");
    b.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait();
    assert.match(d.querySelector("#status").textContent, /Listening/);
    assert.equal(d.querySelectorAll(".message").length, 0);
    b.dispatchEvent(
      new dom.window.KeyboardEvent("keyup", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait();
    assert.match(
      d.querySelector("#voice-transcript").textContent,
      /No audio was recorded/,
    );
    assert.equal(d.querySelectorAll(".message").length, 0);
  } finally {
    dom.window.close();
  }
});
test("Edge provider controls persist without granting background consent in the renderer", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector("#edge-options").hidden, true);
    d.querySelector("#voice-provider").value = "edge";
    d.querySelector("#voice-provider").dispatchEvent(
      new dom.window.Event("change"),
    );
    assert.equal(d.querySelector("#edge-options").hidden, false);
    assert.match(d.querySelector("#edge-options").textContent, /Microsoft/);
    d.querySelector("#edge-language").value = "bn-BD";
    d.querySelector("#edge-fallback").checked = false;
    d.querySelector("#settings-form").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    const saved = (await dom.window.notchDemo.call("get-settings")).data;
    assert.equal(saved.voiceProvider, "edge");
    assert.equal(saved.edgeLanguage, "bn-BD");
    assert.equal(saved.edgeFallback, false);
    assert.equal(saved.edgeBackground, false);
    d.querySelector("#edge-setup").click();
    await wait();
    assert.match(
      d.querySelector("#edge-status").textContent,
      /Design preview only/,
    );
  } finally {
    dom.window.close();
  }
});
test("Hidden Edge preference saves independently from background permission; dark UI has bounded sizing", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    d.querySelector("#voice-provider").value = "edge";
    d.querySelector("#voice-provider").dispatchEvent(
      new dom.window.Event("change"),
    );
    d.querySelector("#edge-window-mode").value = "hidden";
    d.querySelector("#settings-form").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    const value = (await dom.window.notchDemo.call("get-settings")).data;
    assert.equal(value.edgeWindowMode, "hidden");
    assert.equal(value.edgeBackground, false);
    assert.ok(d.querySelector("#edge-background"));
    assert.ok(d.querySelector("#mode-hint"));
    const css = fs.readFileSync(path.join(root, "notch.css"), "utf8");
    assert.match(css, /color-scheme:\s*dark/);
    assert.match(css, /max-height:\s*55vh/);
    assert.match(css, /font-size:\s*14px/);
  } finally {
    dom.window.close();
  }
});
test("Background job mode and structured visual preview are available from the notch", async () => {
  const dom = await setup();
  try {
    const d = dom.window.document;
    d.querySelector("[data-mode=background]").click();
    assert.match(d.querySelector("#mode-hint").textContent, /No screen/);
    d.querySelector("#prompt").value = "Research a topic";
    d.querySelector("#composer").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
    await wait();
    const jobs = (await dom.window.notchDemo.call("tasks")).data;
    assert.equal(jobs[0].kind, "background");
    // Preview scenes contain no HTML; a missing WebGL renderer gives a clear fallback.
    d.querySelector("#all-chat").click();
    d.querySelector("#demo-visual").click();
    await wait();
    assert.equal(d.querySelector("#visual-panel").hidden, false);
    assert.match(d.querySelector("#visual-title").textContent, /3D/);
    assert.equal(d.querySelector("#visual-canvas script"), null);
  } finally {
    dom.window.close();
  }
});
test("desktop canvas controls work without opening chat and desktop setting round-trips", async () => {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "notch.html"), "utf8"),
    { runScripts: "outside-only", url: "http://preview/notch.html" },
  );
  try {
    dom.window.eval(fs.readFileSync(path.join(root, "notch-demo.js"), "utf8"));
    let appEvent;
    const old = dom.window.notchDemo.onAppEvent;
    dom.window.notchDemo.onAppEvent = (fn) => {
      appEvent = fn;
      old(fn);
    };
    dom.window.eval(fs.readFileSync(path.join(root, "notch.js"), "utf8"));
    await wait();
    const d = dom.window.document;
    appEvent({
      type: "canvas-status",
      data: {
        id: "test",
        title: "Safe desktop visual",
        visible: true,
        interactive: false,
        audio: "off",
      },
    });
    assert.equal(d.querySelector("[data-canvas-controls]").hidden, false);
    assert.equal(
      d.querySelector("[data-canvas-title]").textContent,
      "Safe desktop visual",
    );
    assert.equal(d.querySelector("[data-canvas=passthrough]").disabled, true);
    assert.equal(d.querySelector("[data-canvas=stop-audio]").hidden, true);
    appEvent({
      type: "canvas-status",
      data: {
        id: "test",
        title: "Safe desktop visual",
        visible: true,
        interactive: true,
        audio: "tour",
      },
    });
    assert.equal(d.querySelector("[data-canvas=interact]").disabled, true);
    assert.equal(d.querySelector("[data-canvas=stop-audio]").hidden, false);
    d.querySelector("[data-route=settings]").click();
    await wait();
    d.querySelector("#desktop-visuals").checked = false;
    d.querySelector("#settings-form").dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await wait();
    assert.equal(
      (await dom.window.notchDemo.call("get-settings")).data.desktopVisuals,
      false,
    );
    appEvent({ type: "canvas-status", data: { id: null, audio: "off" } });
    assert.equal(d.querySelector("[data-canvas-controls]").hidden, true);
  } finally {
    dom.window.close();
  }
});
