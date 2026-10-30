const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { panelLayout } = require("../src/main/lib/window-layout");
const { notchBounds } = require("../src/main/lib/notch-layout");
const { placeBuddy, sizes } = require("../src/renderer/buddy-layout");
const { validate } = require("../src/main/lib/settings");

test("panel and notch remain in logical work area across laptop/DPI sizes and negative monitors", () => {
  for (const [width, height] of [
    [1920, 1040],
    [1366, 728],
    [1024, 728],
    [768, 520],
    [640, 440],
    [320, 240],
  ])
    for (const x of [0, -1920]) {
      const display = {
        workArea: { x, y: -40, width, height },
        scaleFactor: 2,
      };
      const p = panelLayout(display, {
        x: x - 300,
        y: -300,
        width: 1800,
        height: 1200,
      });
      assert.ok(p.width <= width && p.height <= height);
      assert.ok(p.minWidth <= p.width && p.minHeight <= p.height);
      assert.ok(
        p.x >= x &&
          p.y >= -40 &&
          p.x + p.width <= x + width &&
          p.y + p.height <= height - 40,
      );
      for (const mode of ["collapsed", "peek", "expanded"]) {
        const n = notchBounds(display, mode);
        assert.ok(n.width <= width && n.height <= height);
        assert.ok(n.x >= x && n.x + n.width <= x + width);
      }
    }
  const laptop = notchBounds(
    { workArea: { x: 0, y: 0, width: 1366, height: 728 } },
    "expanded",
  );
  assert.equal(laptop.height, 640);
  assert.deepEqual(
    panelLayout({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    { x: 470, y: 180, width: 980, height: 720, minWidth: 640, minHeight: 480 },
  );
});
test("cursor sizes are bounded, validated and safely default for old preferences", () => {
  assert.equal(validate({}).buddySize, "small");
  for (const buddySize of Object.keys(sizes))
    assert.equal(validate({ buddySize }).buddySize, buddySize);
  assert.throws(() => validate({ buddySize: "enormous" }), /cursor buddy/);
});
test("buddy and status label flip/clamp at every edge and inside negative-origin work areas", () => {
  const bounds = { x: -1920, y: -100, width: 1920, height: 1080 },
    work = { x: -1880, y: -100, width: 1880, height: 1040 };
  for (const size of Object.keys(sizes))
    for (const x of [-1920, -1919, -1000, -1])
      for (const y of [-100, 0, 939, 979]) {
        const p = placeBuddy(
          bounds,
          { x, y },
          size,
          { width: 135, height: 25 },
          work,
        );
        assert.ok(p.left >= 40 && p.top >= 0);
        assert.ok(p.left + p.width <= 1920 && p.top + p.height <= 1040);
        assert.ok(
          p.left + p.labelLeft >= 40 && p.left + p.labelLeft + 135 <= 1920,
        );
        assert.ok(p.top + p.labelTop >= 0 && p.top + p.labelTop + 25 <= 1040);
      }
  const tiny = placeBuddy(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 9, y: 9 },
    "large",
  );
  assert.ok(tiny.width <= 10 && tiny.height <= 10);
});
test("overlay updates size live, tracks its own monitor, clamps labels and restores cursor after annotation clear", () => {
  const dir = path.join(__dirname, "../src/renderer");
  const dom = new JSDOM(
    fs.readFileSync(path.join(dir, "overlay.html"), "utf8"),
    { runScripts: "outside-only" },
  );
  try {
    let emit;
    dom.window.overlay = { onEvent: (fn) => (emit = fn) };
    for (const name of ["buddy-layout.js", "overlay.js"])
      dom.window.eval(fs.readFileSync(path.join(dir, name), "utf8"));
    const d = dom.window.document,
      buddy = d.querySelector("#buddy");
    emit({
      type: "init",
      data: {
        bounds: { x: -1000, y: 0, width: 1000, height: 700 },
        buddy: true,
        buddySize: "small",
      },
    });
    assert.equal(buddy.hidden, true);
    emit({ type: "cursor", data: { x: -1, y: 699 } });
    assert.equal(buddy.hidden, false);
    assert.equal(buddy.style.width, "28px");
    assert.ok(parseFloat(buddy.style.left) + 28 <= 1000);
    emit({ type: "buddy-size", data: "large" });
    assert.equal(buddy.style.width, "38px");
    emit({ type: "state", data: "listening" });
    assert.equal(d.querySelector("#buddy-label").textContent, "listening");
    emit({
      type: "draw",
      data: [
        {
          bounds: { x: -1000, y: 0 },
          x: 500,
          y: 500,
          x2: 500,
          y2: 500,
          shape: "pointer",
        },
      ],
    });
    const annotation = buddy.style.left;
    emit({ type: "clear" });
    assert.notEqual(buddy.style.left, annotation);
    emit({ type: "cursor", data: { x: 0, y: 100 } });
    assert.equal(buddy.hidden, true);
    emit({ type: "buddy", data: false });
    emit({ type: "cursor", data: { x: -500, y: 100 } });
    assert.equal(buddy.hidden, true);
    emit({ type: "buddy", data: true });
    assert.equal(buddy.hidden, false);
  } finally {
    dom.window.close();
  }
});
for (const kind of ["notch", "panel"])
  test(`${kind} settings persist accessible cursor-size selection`, async () => {
    const dir = path.join(__dirname, "../src/renderer");
    const dom = new JSDOM(
      fs.readFileSync(
        path.join(dir, kind === "notch" ? "notch.html" : "index.html"),
        "utf8",
      ),
      { runScripts: "outside-only", url: "http://preview/" },
    );
    const pause = () => new Promise((r) => setTimeout(r, 25));
    try {
      for (const name of kind === "notch"
        ? ["notch-demo.js", "notch.js"]
        : ["demo.js", "app.js"])
        dom.window.eval(fs.readFileSync(path.join(dir, name), "utf8"));
      await pause();
      const select = dom.window.document.querySelector("#buddy-size");
      assert.equal(select.value, "small");
      assert.equal(
        dom.window.document
          .querySelector('label[for="buddy-size"]')
          .textContent.includes("Cursor buddy size"),
        true,
      );
      select.value = "large";
      dom.window.document
        .querySelector("#settings-form")
        .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
      await pause();
      const api = kind === "notch" ? dom.window.notchDemo : dom.window.clicky;
      assert.equal((await api.call("get-settings")).data.buddySize, "large");
      assert.equal(select.value, "large");
    } finally {
      dom.window.close();
    }
  });
