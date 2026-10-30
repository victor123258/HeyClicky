const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Settings } = require("../src/main/lib/settings");
const { SettingsUpdater } = require("../src/main/lib/settings-update");
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clicky-settings-update-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = new Settings(dir, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  settings.save({});
  let active = settings.value;
  const registrations = [];
  const registerHotkeys = (value) => {
    active = value;
    registrations.push(value.hotkeys.talk);
  };
  const updater = new SettingsUpdater({
    settings,
    registerHotkeys,
    ...options,
  });
  return {
    settings,
    updater,
    registrations,
    active: () => active,
    disk: () => JSON.parse(fs.readFileSync(settings.file)).settings,
  };
}
test("optional OS failures return visible warnings, preserving durable settings and active new hotkeys", async (t) => {
  const attempted = [];
  const f = fixture(t, {
    effects: () => [
      {
        warning: "Windows startup preference could not be applied.",
        run: () => {
          throw Error("Injected OS failure");
        },
      },
      {
        warning: "Appearance refresh failed.",
        run: () => attempted.push("appearance"),
      },
    ],
  });
  const saved = await f.updater.save({
    ...f.settings.value,
    startWithWindows: true,
    hotkeys: { ...f.settings.value.hotkeys, talk: "Ctrl+Alt+T" },
  });
  assert.equal(saved.hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.active().hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.disk().hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.disk().startWithWindows, true);
  assert.deepEqual(saved.saveWarnings, [
    "Windows startup preference could not be applied.",
  ]);
  assert.deepEqual(attempted, ["appearance"]);
  assert.equal(f.registrations.length, 1);
});
test("persistence failure restores previous hotkeys and leaves old key/preferences intact", async (t) => {
  let effects = 0;
  const f = fixture(t, { effects: () => [{ run: () => effects++ }] });
  const previous = f.settings.value;
  const old = f.disk();
  f.settings.save = () => {
    throw Error("Injected disk failure");
  };
  await assert.rejects(
    f.updater.save(
      { ...previous, hotkeys: { ...previous.hotkeys, talk: "Ctrl+Alt+T" } },
      "not-persisted",
    ),
    /disk failure/,
  );
  assert.deepEqual(f.disk(), old);
  assert.equal(f.settings.key, "");
  assert.equal(f.active(), previous);
  assert.equal(f.settings.value, previous);
  assert.equal(effects, 0);
  assert.deepEqual(f.registrations, ["Ctrl+Alt+T", previous.hotkeys.talk]);
});
test("hotkey registration failure restores the old mapping before any disk write", async (t) => {
  const f = fixture(t),
    old = f.disk();
  let calls = 0;
  f.updater.registerHotkeys = (value) => {
    calls++;
    if (calls === 1) throw Error("Hotkey unavailable");
    assert.equal(value.hotkeys.talk, old.hotkeys.talk);
  };
  await assert.rejects(
    f.updater.save({
      ...f.settings.value,
      hotkeys: { ...old.hotkeys, talk: "Ctrl+Alt+T" },
    }),
    /unavailable/,
  );
  assert.deepEqual(f.disk(), old);
  assert.equal(calls, 2);
});
test("rollback failure is reported explicitly, not hidden behind the original save error", async (t) => {
  const f = fixture(t);
  f.updater.registerHotkeys = () => {
    throw Error("registration failed");
  };
  await assert.rejects(
    f.updater.save(f.settings.value),
    /previous hotkeys could not be restored/,
  );
});
test("quick patches merge authoritative preferences, never stale UI snapshots or defaults", async (t) => {
  const f = fixture(t);
  await f.updater.updateEdge(true, "minimized");
  await f.updater.updateEdge(true, "hidden");
  const saved = await f.updater.patch({ screenContext: false });
  assert.equal(saved.edgeWindowMode, "hidden");
  assert.equal(saved.edgeBackground, true);
  assert.equal(saved.screenContext, false);
  await f.updater.patch({ edgeBackground: false });
  assert.equal(f.settings.value.edgeWindowMode, "hidden");
  for (const patch of [
    {},
    null,
    [],
    { edgeWindowMode: "minimized" },
    { key: "secret" },
    { screenContext: "false" },
    JSON.parse('{"__proto__":{}}'),
  ])
    await assert.rejects(f.updater.patch(patch));
});
test("public saves/patches cannot approve background use or bypass active task guard", async (t) => {
  let idle = true;
  const f = fixture(t, { canSave: () => idle });
  await assert.rejects(
    f.updater.patch({ edgeBackground: true }),
    /visible Edge helper/,
  );
  await assert.rejects(
    f.updater.save({ ...f.settings.value, edgeBackground: true }),
    /visible Edge helper/,
  );
  idle = false;
  await assert.rejects(
    f.updater.patch({ screenContext: false }),
    /Stop the current/,
  );
  assert.equal(f.settings.value.screenContext, true);
  await assert.rejects(f.updater.updateEdge(true, "arbitrary"), /Invalid/);
});
test("queued quick updates merge at execution time, after prior OS effects and helper updates finish", async (t) => {
  let release, started;
  const firstStarted = new Promise((r) => (started = r));
  let first = true;
  let idle = true;
  const f = fixture(t, {
    canSave: () => idle,
    effects: () => [
      {
        warning: "Effect failed",
        run: async () => {
          if (first) {
            first = false;
            started();
            await new Promise((r) => (release = r));
          }
        },
      },
    ],
  });
  const save = f.updater.save({ ...f.settings.value, model: "openai/gpt-4.1" });
  await firstStarted;
  const hide = f.updater.updateEdge(true, "hidden");
  const patch = f.updater.patch({ screenContext: false });
  release();
  await Promise.all([save, hide, patch]);
  assert.equal(f.settings.value.model, "openai/gpt-4.1");
  assert.equal(f.settings.value.edgeWindowMode, "hidden");
  assert.equal(f.settings.value.edgeBackground, true);
  assert.equal(f.settings.value.screenContext, false);
  const blocked = f.updater.patch({ screenContext: true });
  idle = false;
  await assert.rejects(blocked, /Stop the current/);
});
test("actual main settings handlers keep saved hotkeys active when Windows login settings fail", async (t) => {
  const f = fixture(t);
  const source = fs.readFileSync(
    path.join(__dirname, "../src/main/index.js"),
    "utf8",
  );
  const begin = source.indexOf("  settingsUpdater = new SettingsUpdater("),
    end = source.indexOf('  handle("test-key",', begin);
  assert.ok(begin > 0 && end > begin);
  const handlers = new Map(),
    events = [];
  const install = new Function(
    "deps",
    `const {SettingsUpdater,settings,registerHotkeys,controller,listeningMode,requestRunning,app,broadcast,notch,desktopCanvas,edge,emit,panel,handle}=deps;let settingsUpdater;${source.slice(begin, end)}`,
  );
  install({
    SettingsUpdater,
    settings: f.settings,
    registerHotkeys: f.updater.registerHotkeys,
    controller: null,
    listeningMode: null,
    requestRunning: false,
    app: {
      getPath: () => "/mock/HeyClicky.exe",
      setLoginItemSettings: () => {
        throw Error("Injected Windows startup failure");
      },
    },
    broadcast: () => {},
    notch: { setEnabled: () => {} },
    desktopCanvas: { dismiss: () => {} },
    edge: {
      send: () => {},
      applyWindowPreferences: async () => {},
      status: () => ({}),
    },
    emit: (...args) => events.push(args),
    panel: { show: () => {}, focus: () => {} },
    handle: (name, fn) => handlers.set(name, fn),
  });
  const result = await handlers.get("save-settings")({
    ...f.settings.value,
    hotkeys: { ...f.settings.value.hotkeys, talk: "Ctrl+Alt+T" },
  });
  assert.equal(result.hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.active().hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.disk().hotkeys.talk, "Ctrl+Alt+T");
  assert.match(result.saveWarnings[0], /Windows startup preference/);
  assert.equal(events.at(-1)[0], "edge-status");
  await handlers.get("patch-settings")({ screenContext: false });
  assert.equal(f.settings.value.hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.settings.value.screenContext, false);
});

test("post-commit refresh setup failure is a warning too, never a hotkey rollback", async (t) => {
  const f = fixture(t, {
    effects: () => {
      throw Error("Injected refresh setup failure");
    },
  });
  const saved = await f.updater.save({
    ...f.settings.value,
    hotkeys: { ...f.settings.value.hotkeys, talk: "Ctrl+Alt+T" },
  });
  assert.equal(f.active().hotkeys.talk, "Ctrl+Alt+T");
  assert.equal(f.disk().hotkeys.talk, "Ctrl+Alt+T");
  assert.match(saved.saveWarnings[0], /refresh failed/);
});
