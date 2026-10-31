// Optional real-browser regression check. Install playwright-core separately, start npm run preview,
// then CHROMIUM_PATH=/path/to/chrome node scripts/graphics-smoke.cjs. No AI/mic/screen capture.
const assert = require("node:assert/strict");
async function checkGraphics(browser, base = "http://127.0.0.1:3000") {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/canvas.html?example=connector");
    await page.waitForSelector("#stage canvas");
    assert.equal(await page.locator("#error").isVisible(), false);
    const capture = () => page.evaluate(() => window.visuals.capture());
    await page.mouse.move(400, 250);
    await page.mouse.down();
    await page.mouse.move(580, 310, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    const orbit = (await capture()).camera;
    await page.locator("#next").click();
    await page.waitForTimeout(150);
    const moving = await capture();
    assert.ok(
      moving.objects.latch.position[1] > 0.35 &&
        moving.objects.latch.position[1] < 1,
    );
    const frame = await page.locator("#stage").screenshot();
    await page.waitForTimeout(220);
    assert.notDeepEqual(await page.locator("#stage").screenshot(), frame);
    await page.waitForFunction(
      () =>
        Math.abs(window.visuals.capture().objects.latch.position[1] - 1) <
        0.00001,
    );
    assert.deepEqual((await capture()).camera, orbit);
    await page.locator("#next").click();
    await page.waitForFunction(
      () =>
        Math.abs(window.visuals.capture().objects.ribbon.position[2] - 1) <
          0.00001 &&
        Math.abs(window.visuals.capture().objects.contacts.position[2] - 0.1) <
          1e-9,
    );
    const inserted = await capture();
    assert.equal(inserted.objects.latch.position[1], 1);
    assert.ok(Math.abs(inserted.objects.contacts.position[2] - 0.1) < 1e-9);
    await page.locator("#previous").click();
    await page.waitForFunction(
      () =>
        Math.abs(window.visuals.capture().objects.ribbon.position[2] - 2) <
        0.00001,
    );
    const patchCamera = await page.evaluate(() => {
      const view = window.visuals.capture(),
        s = structuredClone(window.connectorExample.spec);
      s.objects.find((o) => o.id === "latch").color = "#ff9900";
      window.visuals.render(document.querySelector("#stage"), s, {
        transparent: true,
        desktop: true,
        step: 1,
        previousView: view,
      });
      return window.visuals.capture().camera;
    });
    assert.deepEqual(patchCamera, orbit);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#step-select").selectOption("0");
    await page.locator("#step-select").selectOption("1");
    assert.equal((await capture()).objects.latch.position[1], 1);
    await page.locator("#reset").click();
    assert.notDeepEqual((await capture()).camera, orbit);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#reset").isDisabled(), true);
    const alpha = await page.evaluate(() => {
      window.visuals.render(
        document.querySelector("#stage"),
        {
          kind: "canvas2d",
          title: "Transparent",
          caption: "",
          elements: [
            {
              id: "a",
              type: "arrow",
              x: 200,
              y: 200,
              x2: 700,
              y2: 700,
              color: "#ffffff",
              label: "",
            },
          ],
        },
        { transparent: true },
      );
      return document
        .querySelector("#stage canvas")
        .getContext("2d")
        .getImageData(0, 0, 1, 1).data[3];
    });
    assert.equal(alpha, 0);
    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 480 });
      await page.goto(base + "/canvas.html?example=connector");
      await page.waitForSelector("#stage canvas");
      assert.equal(await page.locator("#error").isVisible(), false);
      assert.ok(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "GRAPHICS_SMOKE_OK: real mesh poses/tween frames, cumulative cable/latch motion, reverse steps, camera preservation/reset, reduced motion, Escape, alpha and responsive canvas",
    );
  } finally {
    await page.close();
  }
}
module.exports = { checkGraphics };
if (require.main === module)
  (async () => {
    if (!process.env.CHROMIUM_PATH)
      throw Error(
        "Set CHROMIUM_PATH to an installed Chromium/Chrome executable.",
      );
    const { chromium } = require("playwright-core");
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    try {
      await checkGraphics(browser, process.env.GRAPHICS_BASE_URL);
      await checkModeling(browser, process.env.GRAPHICS_BASE_URL);
      await checkToolPayloads(browser, process.env.GRAPHICS_BASE_URL);
    } finally {
      await browser.close();
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
async function checkModeling(browser, base = "http://127.0.0.1:3000") {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/canvas.html?example=modeling");
    await page.waitForSelector("#stage canvas");
    assert.equal(await page.locator("#error").isVisible(), false);
    const capture = () => page.evaluate(() => window.visuals.capture());
    const dragStage = await page.locator("#stage canvas").boundingBox();
    await page.mouse.move(
      dragStage.x + dragStage.width / 2,
      dragStage.y + dragStage.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dragStage.x + dragStage.width / 2 + 45,
      dragStage.y + dragStage.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.equal(await page.locator("#part-select").inputValue(), "");
    await page.locator("#reset").click();
    const before = await capture();
    assert.ok(before.objects.left__latch);
    assert.ok(before.objects.right__latch);
    const stage = await page.locator("#stage canvas").boundingBox(),
      [x, y] = before.objects.knob.screenPoint;
    await page.mouse.click(stage.x + x, stage.y + y);
    assert.ok(await page.locator("#part-select").inputValue());
    await page.locator("#part-select").selectOption("left__latch");
    assert.match(
      await page.locator("#part-description").textContent(),
      /Latch/,
    );
    const selected = await capture();
    await page.locator("#focus-part").click();
    await page.waitForTimeout(550);
    assert.notDeepEqual((await capture()).camera, selected.camera);
    await page.locator("#reset").click();
    const reset = await capture();
    await page.locator("#next").click();
    await page.waitForFunction(
      () =>
        Math.abs(window.visuals.capture().objects.left__hinge.quaternion[0]) >
        0.5,
    );
    await page.waitForTimeout(250);
    const after = await capture();
    assert.deepEqual(
      after.objects.left__hinge.pivotWorld,
      before.objects.left__hinge.pivotWorld,
    );
    assert.notDeepEqual(
      after.objects.left__latch.worldPosition,
      before.objects.left__latch.worldPosition,
    );
    assert.deepEqual(
      after.objects.right__latch.worldPosition,
      before.objects.right__latch.worldPosition,
    );
    assert.deepEqual(after.camera, reset.camera);
    assert.equal(
      await page.locator("#part-select").inputValue(),
      "left__latch",
    );
    const boxes = await page
      .locator(".scene-part-label:not([hidden])")
      .evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    assert.ok(boxes.length >= 3);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
        );
      }
    const oldColor = await page.evaluate(
      () => window.visuals.capture().objects.left__latch.colors[0],
    );
    await page.evaluate(() => {
      const s = structuredClone(window.visuals.modelingExample.spec);
      s.objects.find((o) => o.id === "left__latch").color = "#ff5500";
      window.visuals.render(document.querySelector("#stage"), s, {
        transparent: true,
        desktop: true,
        step: 1,
        previousView: window.visuals.capture(),
        interactive: true,
      });
    });
    await page.waitForTimeout(200);
    const changingColor = await page.evaluate(
      () => window.visuals.capture().objects.left__latch.colors[0],
    );
    assert.notEqual(changingColor, oldColor);
    await page.waitForFunction(
      () =>
        window.visuals.capture().objects.left__latch.colors[0] === "#ff5500",
    );
    assert.deepEqual((await capture()).camera, reset.camera);
    await page.locator("#explain-part").click();
    assert.match(await page.locator("#error").textContent(), /Windows app/);
    await page.keyboard.press("Escape");
    const oldSelection = await page.locator("#part-select").inputValue();
    await page.mouse.click(stage.x + x, stage.y + y);
    assert.equal(await page.locator("#part-select").inputValue(), oldSelection);
    assert.equal(await page.locator("#focus-part").isDisabled(), true);
    await page.screenshot({
      path: ".cache/modeling-preview.png",
      omitBackground: true,
    });
    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 480 });
      await page.goto(base + "/canvas.html?example=modeling");
      await page.waitForSelector("#stage canvas");
      assert.equal(await page.locator("#error").isVisible(), false);
      assert.ok(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "MODELING_BROWSER_OK: curved/extruded assemblies, click selection, component controls, fixed world hinge pivots, inherited child motion, camera focus/preservation, labels and pass-through",
    );
  } finally {
    await page.close();
  }
}
module.exports.checkModeling = checkModeling;

async function checkToolPayloads(browser, base = "http://127.0.0.1:3000") {
  const { validateTool } = require("../src/main/lib/tools");
  const {
    validateVisual,
    applyVisualPatch,
  } = require("../src/main/lib/visuals");
  const page = await browser.newPage({
    viewport: { width: 1000, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/canvas.html?example=connector");
    await page.waitForSelector("#stage canvas");
    for (const data of [
      { kind: "chart", items: [{ label: "A", value: 2 }] },
      { kind: "diagram", nodes: [{ id: "a", label: "A", x: 500, y: 500 }] },
      {
        kind: "canvas2d",
        elements: [{ type: "box", x: 100, y: 100, x2: 400, y2: 400 }],
      },
      { kind: "scene3d", objects: [{ id: "ball", type: "sphere" }] },
    ]) {
      for (const encode of [(v) => v, JSON.stringify]) {
        const args = validateTool("show_visual", {
          spec: encode({
            title: "Tool regression",
            caption: "Conceptual",
            ...data,
          }),
        });
        const spec = validateVisual(args.spec);
        const patch = validateTool("update_visual", {
          changes: encode(
            data.kind === "scene3d"
              ? { objects: [{ id: "ball", color: "#ff0000" }] }
              : { caption: "Edited" },
          ),
        });
        for (const value of [spec, applyVisualPatch(spec, patch.changes)]) {
          const result = await page.evaluate((s) => {
            const host = document.querySelector("#stage");
            window.visuals.render(host, s, {
              transparent: true,
              desktop: true,
            });
            const canvas = host.querySelector("canvas");
            return {
              width: canvas?.width,
              height: canvas?.height,
              objects: window.visuals.capture()?.objects,
            };
          }, value);
          assert.ok(
            result.width > 0 && result.height > 0,
            `${data.kind} canvas`,
          );
          if (data.kind === "scene3d") {
            assert.ok(result.objects.ball);
            assert.equal(result.objects.ball.colors[0], value.objects[0].color);
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "VISUAL_TOOL_BROWSER_OK: charts/diagrams/2D/3D, both payload encodings, omitted-field defaults and follow-up patches render in the production bundle",
    );
  } finally {
    await page.close();
  }
}
module.exports.checkToolPayloads = checkToolPayloads;
