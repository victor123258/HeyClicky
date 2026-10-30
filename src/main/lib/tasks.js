const { randomUUID } = require("node:crypto");
const TERMINAL = ["completed", "failed", "cancelled"];
class Tasks {
  constructor(onChange = () => {}) {
    this.items = [];
    this.onChange = onChange;
  }
  snapshot() {
    return this.items.map(({ history, ...task }) => ({
      ...task,
      steps: [...task.steps],
    }));
  }
  changed() {
    this.onChange(this.snapshot());
  }
  enqueue(text, id, kind = "desktop") {
    let task = id ? this.items.find((t) => t.id === id) : null;
    if (task && (task.kind || "desktop") !== kind)
      throw Error("Use the original task mode for follow-ups.");
    if (id && !task) throw Error("Task is no longer available.");
    if (task && !TERMINAL.includes(task.status))
      throw Error("Wait for this task to finish before following up.");
    if (!task) {
      if (this.items.length >= 30)
        throw Error("Clear this session before creating more than 30 tasks.");
      task = {
        id: randomUUID(),
        kind,
        title: text.slice(0, 90),
        status: "queued",
        createdAt: Date.now(),
        steps: [],
        result: "",
        history: [],
      };
      this.items.unshift(task);
    }
    Object.assign(task, {
      prompt: text,
      status: "queued",
      result: "",
      steps: [],
      updatedAt: Date.now(),
    });
    this.changed();
    return task;
  }
  next(kind = "desktop") {
    return [...this.items]
      .reverse()
      .find((t) => t.status === "queued" && (t.kind || "desktop") === kind);
  }
  get(id) {
    return this.items.find((t) => t.id === id);
  }
  update(id, data) {
    const task = this.get(id);
    if (task) {
      Object.assign(task, data, { updatedAt: Date.now() });
      this.changed();
    }
  }
  step(id, data) {
    const task = this.get(id);
    if (task) {
      task.steps.push({ ...data, at: Date.now() });
      task.steps = task.steps.slice(-80);
      this.changed();
    }
  }
  cancel(id) {
    const task = this.get(id);
    if (!task || TERMINAL.includes(task.status)) return false;
    this.update(id, { status: "cancelled" });
    return true;
  }
  stopAll(kind) {
    for (const task of this.items)
      if (
        (!kind || (task.kind || "desktop") === kind) &&
        !TERMINAL.includes(task.status)
      )
        task.status = "cancelled";
    this.changed();
  }
  clear() {
    this.items = [];
    this.changed();
  }
}
module.exports = { Tasks };
