const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Tasks } = require("../src/main/lib/tasks");
test("desktop tasks are queued oldest first, with independent session histories", () => {
  const tasks = new Tasks();
  const one = tasks.enqueue("First"),
    two = tasks.enqueue("Second");
  one.history.push({ role: "user", content: "Private first context" });
  assert.equal(tasks.next().id, one.id);
  tasks.update(one.id, { status: "running" });
  assert.equal(tasks.next().id, two.id);
  assert.equal(two.history.length, 0);
  assert.equal("history" in tasks.snapshot()[0], false);
});
test("follow-up resumes the same task only after completion", () => {
  const tasks = new Tasks();
  const t = tasks.enqueue("Original");
  assert.throws(() => tasks.enqueue("Follow-up", t.id), /finish/);
  tasks.update(t.id, { status: "completed" });
  t.history.push({ role: "assistant", content: "Result" });
  const resumed = tasks.enqueue("Follow-up", t.id);
  assert.equal(resumed.id, t.id);
  assert.equal(resumed.history.length, 1);
  assert.equal(resumed.status, "queued");
  assert.equal(tasks.items.length, 1);
  assert.throws(() => tasks.enqueue("No", "missing"), /available/);
});
test("stop all cancels pending work and per-task cancel leaves other tasks intact", () => {
  const tasks = new Tasks();
  const a = tasks.enqueue("a"),
    b = tasks.enqueue("b");
  assert.equal(tasks.cancel(a.id), true);
  assert.equal(tasks.cancel(a.id), false);
  assert.equal(b.status, "queued");
  tasks.stopAll();
  assert.equal(tasks.next(), undefined);
  assert.equal(b.status, "cancelled");
  tasks.clear();
  assert.equal(tasks.items.length, 0);
});
test("task activity is bounded and only current output is displayed on follow-up", () => {
  const tasks = new Tasks();
  const t = tasks.enqueue("a");
  for (let i = 0; i < 100; i++)
    tasks.step(t.id, { name: "screenshot", status: "done" });
  assert.equal(t.steps.length, 80);
  tasks.update(t.id, { status: "completed", result: "old files" });
  tasks.enqueue("again", t.id);
  assert.equal(t.steps.length, 0);
  assert.equal(t.result, "");
});
test("task retention has a fixed session limit", () => {
  const tasks = new Tasks();
  for (let i = 0; i < 30; i++) tasks.enqueue("task");
  assert.throws(() => tasks.enqueue("31"), /30 tasks/);
});
