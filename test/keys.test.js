const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { keyGroups } = require("../src/main/lib/hold-keys");
const { Keys } = require("../src/main/keys");
test("hold shortcut keys are explicit virtual-key groups, not arbitrary scripts", () => {
  assert.deepEqual(keyGroups("CommandOrControl+Shift+Space"), [
    [17],
    [16],
    [32],
  ]);
  assert.deepEqual(keyGroups("Win+Alt+F12"), [[91, 92], [18], [123]]);
  assert.deepEqual(keyGroups("ctrl+q"), [[17], [81]]);
  assert.throws(() => keyGroups("Ctrl+;DoSomething"), /support/);
});
test("release monitoring is scoped to talk/agent and stale helpers are ignored", () => {
  const children = [],
    releases = [],
    errors = [];
  const native = {
    launch: () => {
      const c = new EventEmitter();
      c.stdout = new PassThrough();
      c.stderr = new PassThrough();
      children.push(c);
      return c;
    },
    kill: () => {},
  };
  const keys = new Keys(
    native,
    (n) => releases.push(n),
    (e) => errors.push(e.message),
  );
  const config = { talk: "Ctrl+Shift+Space", agent: "Ctrl+Shift+A" };
  keys.start(config);
  children[0].stdout.write(
    '{"type":"ready"}\n{"type":"release","name":"talk"}\n',
  );
  assert.equal(keys.ready, true);
  assert.deepEqual(releases, ["talk"]);
  keys.start(config);
  children[0].emit("close", 0);
  assert.equal(errors.length, 0);
  children[1].emit("close", 1);
  assert.equal(errors.length, 1);
  assert.equal(keys.ready, false);
  keys.stop();
});
