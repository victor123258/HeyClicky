const path = require("node:path");
const { notchBounds } = require("./lib/notch-layout");
class Notch {
  constructor({ BrowserWindow, screen, enabled = true, state = "idle" }) {
    this.screen = screen;
    this.enabled = enabled;
    this.state = state;
    this.mode = "collapsed";
    this.route = "home";
    this.suspended = false;
    this.suspendDepth = 0;
    this.preview = "";
    this.kind = "hint";
    this.window = new BrowserWindow({
      ...notchBounds(screen.getPrimaryDisplay()),
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "../preload/notch.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window.setAlwaysOnTop(true, "screen-saver");
    this.window.setContentProtection(true);
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (e) => e.preventDefault());
    this.window.webContents.on("did-finish-load", () => this.render());
    this.window.loadFile(path.join(__dirname, "../renderer/notch.html"));
  }
  snapshot() {
    return {
      state: this.state,
      mode: this.mode,
      route: this.route,
      expanded: this.mode !== "collapsed",
      preview: this.preview,
      kind: this.kind,
    };
  }
  render() {
    if (this.window.isDestroyed()) return;
    this.window.setBounds(
      notchBounds(this.screen.getPrimaryDisplay(), this.mode),
    );
    this.window.setFocusable?.(this.mode === "expanded" && !this.suspended);
    this.window.webContents.send("notch:event", this.snapshot());
    if (this.enabled && !this.suspended) this.window.showInactive();
    else this.window.hide();
  }
  peek() {
    if (this.mode === "collapsed") {
      this.mode = "peek";
      this.render();
    }
  }
  open(route = "home", focus = true) {
    this.mode = "expanded";
    this.route = route;
    this.enabled = true;
    this.render();
    if (focus && !this.suspended) this.window.focus();
  }
  expand(value) {
    if (value) this.open();
    else {
      this.mode = "collapsed";
      this.render();
    }
  }
  setEnabled(value) {
    this.enabled = value;
    this.render();
  }
  setState(state) {
    this.state = state;
    if (state !== "idle" && this.mode === "collapsed") this.mode = "peek";
    this.render();
  }
  message(text, kind = "hint") {
    this.preview = String(text).slice(0, 700);
    this.kind = kind;
    if (kind === "error" && this.mode === "collapsed") this.mode = "peek";
    this.render();
  }
  clear() {
    this.preview = "";
    this.kind = "hint";
    this.render();
  }
  suspend(value) {
    this.suspendDepth = Math.max(0, this.suspendDepth + (value ? 1 : -1));
    this.suspended = this.suspendDepth > 0;
    this.render();
  }
  destroy() {
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
module.exports = { Notch };
