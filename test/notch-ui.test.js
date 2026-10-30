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
