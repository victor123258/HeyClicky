const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Tasks } = require("../src/main/lib/tasks");
const { BackgroundJobs, ApprovalQueue } = require("../src/main/lib/background");
const wait = () => new Promise((r) => setImmediate(r));
test("Two off-desktop workers run independently while desktop queue remains untouched", async () => {
  const tasks = new Tasks(),
    a = tasks.enqueue("research", null, "background"),
    b = tasks.enqueue("write", null, "background"),
    c = tasks.enqueue("third", null, "background"),
    desktop = tasks.enqueue("click");
  const releases = new Map();
  const jobs = new BackgroundJobs({
    tasks,
    run: (task, signal) =>
      new Promise((resolve) =>
        releases.set(task.id, () => resolve(task.prompt + " done")),
      ),
  });
  jobs.pump();
  await wait();
  assert.equal(jobs.active.size, 2);
  assert.equal(c.status, "queued");
  assert.equal(desktop.status, "queued");
  assert.equal(tasks.next().id, desktop.id);
  releases.get(a.id)();
  await wait();
  assert.equal(a.status, "completed");
  assert.equal(jobs.active.size, 2);
  assert.equal(c.status, "running");
  assert.equal(b.history.length, 0);
  releases.get(b.id)();
  releases.get(c.id)();
  await wait();
  assert.equal(jobs.active.size, 0);
  assert.equal(desktop.status, "queued");
});
test("Stop aborts active workers and cancels queue; stale results cannot complete stopped work", async () => {
  const tasks = new Tasks();
  const a = tasks.enqueue("first", null, "background"),
    b = tasks.enqueue("second", null, "background");
  let release, seen;
  const jobs = new BackgroundJobs({
    tasks,
    limit: 1,
    run: (_, signal) => {
      seen = signal;
      return new Promise((r) => (release = r));
    },
  });
  jobs.pump();
  await wait();
  jobs.stopAll();
  assert.equal(seen.aborted, true);
  release("late result");
  await wait();
  assert.equal(a.status, "cancelled");
  assert.equal(b.status, "cancelled");
  assert.notEqual(a.result, "late result");
});
test("Concurrent approvals are serialized and queued cancelled requests never become visible", async () => {
  let resolve,
    active = 0,
    max = 0;
  const shown = [];
  const queue = new ApprovalQueue((action) => {
    shown.push(action.name);
    active++;
    max = Math.max(max, active);
    return new Promise((r) => {
      resolve = () => {
        active--;
        r(true);
      };
    });
  });
  const c = new AbortController();
  const first = queue.request({ name: "first" }, new AbortController().signal);
  const second = queue.request({ name: "second" }, c.signal);
  c.abort();
  const caught = assert.rejects(second, { name: "AbortError" });
  await wait();
  assert.deepEqual(shown, ["first"]);
  resolve();
  assert.equal(await first, true);
  await caught;
  assert.equal(max, 1);
});
test("Task kind cannot be silently changed on follow-up", () => {
  const tasks = new Tasks(),
    task = tasks.enqueue("research", null, "background");
  tasks.update(task.id, { status: "completed" });
  assert.throws(
    () => tasks.enqueue("click", task.id, "desktop"),
    /original task mode/,
  );
});
