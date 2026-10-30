const { StringDecoder } = require("node:string_decoder");
const { keyGroups } = require("./lib/hold-keys");
class Keys {
  constructor(native, onRelease, onError) {
    this.native = native;
    this.onRelease = onRelease;
    this.onError = onError;
    this.child = null;
    this.ready = false;
  }
  start(hotkeys) {
    const combos = ["talk", "agent"].map((name) => ({
      name,
      groups: keyGroups(hotkeys[name]),
    }));
    this.stop();
    const child = (this.child = this.native.launch("keys.ps1", [], { combos }));
    const decoder = new StringDecoder("utf8");
    let pending = "",
      failed = false;
    const fail = () => {
      if (this.child !== child || failed) return;
      failed = true;
      this.ready = false;
      this.onError(
        Error(
          "Voice shortcut monitoring stopped. Use the on-screen hold button or restart the app.",
        ),
      );
    };
    child.stdout.on("data", (chunk) => {
      if (this.child !== child) return;
      pending += decoder.write(chunk);
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, i);
        pending = pending.slice(i + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "ready") this.ready = true;
        else if (
          event.type === "release" &&
          ["talk", "agent"].includes(event.name)
        )
          this.onRelease(event.name);
        else if (event.type === "error") fail();
      }
      if (pending.length > 8192) {
        this.native.kill(child);
        fail();
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", fail);
    child.on("close", fail);
  }
  stop() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.native.kill(child);
  }
}
module.exports = { Keys };
