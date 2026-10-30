// Pure research/writing workers, never the desktop controller. Each gets its own
// signal/history; only explicit approved data/file tools are supplied by runAgent.
class BackgroundJobs {
  constructor({ tasks, run, limit = 2, timeout = 15 * 60 * 1000 }) {
    this.tasks = tasks;
    this.run = run;
    this.limit = limit;
    this.timeout = timeout;
    this.active = new Map();
  }
  pump() {
    while (this.active.size < this.limit) {
      const task = this.tasks.next("background");
      if (!task) return;
      const controller = new AbortController();
      this.active.set(task.id, controller);
      this.tasks.update(task.id, { status: "running" });
      const timer = setTimeout(
        () =>
          controller.abort(Error("Background job timed out after 15 minutes.")),
        this.timeout,
      );
      timer.unref?.();
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return this.run(task, controller.signal);
        })
        .then((result) => {
          controller.signal.throwIfAborted();
          this.tasks.update(task.id, {
            status: String(result).startsWith("That action was denied.")
              ? "cancelled"
              : "completed",
            result,
          });
        })
        .catch((error) => {
          this.tasks.update(task.id, {
            status: controller.signal.aborted ? "cancelled" : "failed",
            result: controller.signal.aborted
              ? controller.signal.reason?.message ||
                "Stopped. Approved file changes cannot be undone."
              : error.message,
          });
        })
        .finally(() => {
          clearTimeout(timer);
          this.active.delete(task.id);
          this.pump();
        });
    }
  }
  cancel(id) {
    this.active.get(id)?.abort();
    this.tasks.cancel(id);
  }
  stopAll() {
    for (const task of this.tasks.items)
      if (task.kind === "background") this.tasks.cancel(task.id);
    for (const c of this.active.values()) c.abort();
  }
}
// All foreground/background actions share one visible approval at a time.
class ApprovalQueue {
  constructor(present) {
    this.present = present;
    this.tail = Promise.resolve();
  }
  request(action, signal) {
    const result = this.tail.then(() => {
      signal.throwIfAborted();
      return this.present(action, signal);
    });
    this.tail = result.catch(() => {});
    return result;
  }
}
module.exports = { BackgroundJobs, ApprovalQueue };
