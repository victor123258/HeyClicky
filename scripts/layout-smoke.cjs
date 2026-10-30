// Optional real-browser layout acceptance; no API keys, microphone or native input.
const assert = require("node:assert/strict");
const { validate } = require("../src/main/lib/settings");
async function checkLayouts(browser, base = "http://127.0.0.1:3000") {
  const errors = [];
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  const inside = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `${selector} has no box`);
    const v = page.viewportSize();
    assert.ok(
      box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= v.width + 1 &&
        box.y + box.height <= v.height + 1,
      `${selector} outside ${JSON.stringify(v)}: ${JSON.stringify(box)}`,
    );
  };
  try {
    await page.addInitScript((config) => {
      let state = { mode: "expanded", state: "idle", route: "home" };
      window.notch = {
        get: async () => state,
        onEvent: (fn) => (window.__layout = fn),
        onAppEvent: (fn) => (window.__app = fn),
        open: async (route) => {
          state = { ...state, route };
          window.__layout(state);
        },
        expand: async (value) => {
          state = { ...state, mode: value ? "expanded" : "collapsed" };
          window.__layout(state);
        },
        call: async (name, ...args) => {
          if (["save-settings", "patch-settings"].includes(name))
            config = { ...config, ...args[0] };
          return { ok: true, data: config };
        },
      };
      window.overlay = { onEvent: (fn) => (window.__overlay = fn) };
    }, validate({}));
    for (const viewport of [
      { width: 704, height: 760 },
      { width: 704, height: 640 },
      { width: 616, height: 457 },
      { width: 488, height: 430 },
      { width: 360, height: 480 },
    ]) {
      console.log("Notch", viewport);
      await page.setViewportSize(viewport);
      await page.goto(base + "/notch.html");
      await page.waitForSelector("#workspace:not([hidden])");
      await inside("#notch");
      await inside("#composer");
      await page.locator("[data-route=settings]").click();
      await page.locator("#buddy-size").scrollIntoViewIfNeeded();
      await inside("#buddy-size");
      await page.locator("#buddy-size").selectOption("large");
      await page
        .locator("#settings-form button[type=submit]")
        .scrollIntoViewIfNeeded();
      await inside("#settings-form button[type=submit]");
      await page.locator("#settings-form button[type=submit]").click();
      await page.waitForFunction(() =>
        document.querySelector("#save-result").textContent.includes("Saved"),
      );
      assert.equal(await page.locator("#buddy-size").inputValue(), "large");
      await page.evaluate(() =>
        window.__app({
          type: "approval",
          data: {
            id: "fixture",
            name: "click",
            args: { description: "A".repeat(5000) },
          },
        }),
      );
      await page.locator("#deny").scrollIntoViewIfNeeded();
      await inside("#deny");
      await page.locator("#allow").scrollIntoViewIfNeeded();
      await inside("#allow");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    for (const viewport of [
      { width: 980, height: 720 },
      { width: 736, height: 488 },
      { width: 640, height: 440 },
      { width: 488, height: 430 },
    ]) {
      console.log("Panel", viewport);
      await page.setViewportSize(viewport);
      await page.goto(base + "/index.html");
      await page.waitForFunction(() => document.querySelector("#model")?.value);
      await page.locator("[data-view=settings]").click();
      await page.locator("#buddy-size").scrollIntoViewIfNeeded();
      await inside("#buddy-size");
      await page
        .locator("#settings-form button[type=submit]")
        .scrollIntoViewIfNeeded();
      await inside("#settings-form button[type=submit]");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Panel horizontal overflow",
      );
    }
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(base + "/overlay.html");
    await page.evaluate(() =>
      window.__overlay({
        type: "init",
        data: {
          bounds: { x: -800, y: 0, width: 800, height: 600 },
          workArea: { x: -800, y: 0, width: 800, height: 560 },
          buddy: true,
          buddySize: "small",
        },
      }),
    );
    for (const size of ["small", "medium", "large"])
      for (const point of [
        { x: -800, y: 0 },
        { x: -1, y: 0 },
        { x: -800, y: 599 },
        { x: -1, y: 599 },
      ]) {
        await page.evaluate(
          ({ size, point }) => {
            window.__overlay({ type: "buddy-size", data: size });
            window.__overlay({ type: "state", data: "transcribing" });
            window.__overlay({ type: "cursor", data: point });
          },
          { size, point },
        );
        await page.waitForTimeout(180);
        await inside("#buddy");
        await inside("#buddy-label");
        const rect = await page.locator("#buddy").boundingBox();
        assert.ok(rect.y + rect.height <= 560, "Buddy overlaps taskbar");
      }
    assert.equal(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    assert.deepEqual(errors, []);
    console.log(
      "LAYOUT_BROWSER_OK: laptop/scaled notch and panel layouts, reachable settings/approval controls, live buddy sizes, monitor corners, status labels and taskbar avoidance",
    );
  } finally {
    await page.close();
  }
}
module.exports = { checkLayouts };
if (require.main === module)
  (async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      await checkLayouts(browser, process.env.PREVIEW_URL);
    } finally {
      await browser.close();
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
