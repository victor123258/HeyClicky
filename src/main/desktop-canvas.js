const path = require("node:path");
const { visiblePartIds } = require("../shared/scene-data");
const { validateVisual } = require("./lib/visuals");
function canvasBounds(display, placement = "right") {
  const a = display.workArea || display.bounds,
    margin = Math.min(12, Math.floor(Math.min(a.width, a.height) / 20));
  const width = Math.max(1, Math.min(1000, a.width - margin * 2)),
    height = Math.max(1, Math.min(720, a.height - margin * 2));
  const x =
    placement === "left"
      ? a.x + margin
      : placement === "center"
        ? a.x + Math.round((a.width - width) / 2)
        : a.x + a.width - width - margin;
  return { x, y: a.y + Math.round((a.height - height) / 2), width, height };
}
class DesktopCanvas {
  constructor({
    BrowserWindow,
    screen,
    onState = () => {},
    speak = async () => {},
    canNarrate = () => true,
    canInteract = () => true,
    onExplain = () => {},
  }) {
    Object.assign(this, {
      BrowserWindow,
      screen,
      onState,
      speak,
      canNarrate,
      canInteract,
      onExplain,
    });
    this.window = null;
    this.current = null;
    this.interactive = false;
    this.depth = 0;
    this.step = 0;
    this.reset = 0;
    this.viewKey = 0;
    this.audio = null;
    this.audioState = "off";
    this.animate = false;
    this.selectedId = null;
    this.focusId = null;
    this.focusRevision = 0;
    this.lastError = "";
  }
  snapshot(full = false) {
    return {
      visible: Boolean(
        this.current &&
        this.window &&
        !this.window.isDestroyed() &&
        !this.depth,
      ),
      interactive: this.interactive,
      step: this.step,
      reset: this.reset,
      viewKey: this.viewKey,
      selectedId: this.selectedId,
      selectedLabel: this.selectedPart()?.label || this.selectedId || "",
      focusId: this.focusId,
      focusRevision: this.focusRevision,
      audio: this.audioState,
      animate: this.animate,
      error: this.lastError,
      title: this.current?.spec.title || "",
      id: this.current?.id || null,
      steps: this.current?.spec.steps?.length || 0,
      ...(full ? { visual: this.current } : {}),
    };
  }
  publish() {
    const s = this.snapshot();
    this.onState(s);
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("canvas:state", this.snapshot(true));
  }
  ensure(display) {
    if (this.window && !this.window.isDestroyed()) return;
    const w = (this.window = new this.BrowserWindow({
      ...canvasBounds(display),
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, "../preload/canvas.js"),
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    }));
    w.setIgnoreMouseEvents(true);
    w.setContentProtection(true);
    w.setAlwaysOnTop(true, "screen-saver");
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("render-process-gone", () => this.dismiss());
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    w.webContents.on("did-finish-load", () => this.publish());
    w.on("closed", () => {
      if (this.window !== w) return;
      this.cancelNarration();
      this.window = null;
      this.current = null;
      this.selectedId = null;
      this.focusId = null;
      this.interactive = false;
      this.publish();
    });
    w.loadFile(path.join(__dirname, "../renderer/canvas.html"));
  }
  present(visual, display, { preserveView = false } = {}) {
    const spec = validateVisual(JSON.stringify(visual.spec));
    display = display || this.screen.getPrimaryDisplay();
    const keep = preserveView && this.current?.spec.kind === spec.kind;
    const oldStep = this.step;
    this.cancelNarration();
    this.current = { ...visual, spec };
    this.displayId = display.id;
    this.step = keep
      ? Math.min(oldStep, Math.max(0, (spec.steps?.length || 1) - 1))
      : 0;
    if (!keep || !visiblePartIds(spec, this.step).includes(this.selectedId))
      this.selectedId = null;
    this.focusId = null;
    this.reset++;
    if (!keep) this.viewKey++;
    this.lastError = "";
    this.ensure(display);
    this.setInteractive(false);
    this.refresh();
  }
  selectedPart() {
    return (
      this.current?.spec.objects?.find((o) => o.id === this.selectedId) || null
    );
  }
  refresh() {
    if (!this.current) return;
    const display = this.screen
      .getAllDisplays()
      .find((d) => d.id === this.displayId);
    if (!display) {
      this.dismiss();
      return;
    }
    this.window.setBounds(canvasBounds(display, this.current.spec.placement));
    if (this.depth) this.window.hide();
    else this.window.showInactive();
    this.publish();
  }
  setInteractive(value) {
    this.interactive = Boolean(value && this.current && !this.depth);
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(!this.interactive);
      this.window.setFocusable(this.interactive);
      if (this.interactive) {
        this.window.show();
        this.window.focus();
      }
    }
    this.publish();
  }
  suspend(value) {
    this.depth = Math.max(0, this.depth + (value ? 1 : -1));
    if (this.depth) {
      this.setInteractive(false);
      this.window?.hide();
    } else this.refresh();
  }
  cancelNarration() {
    this.audio?.abort();
    this.audio = null;
    this.audioState = "off";
    this.animate = false;
    this.publish();
  }
  dismiss() {
    this.cancelNarration();
    this.current = null;
    this.selectedId = null;
    this.focusId = null;
    this.interactive = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(true);
      this.window.setFocusable(false);
      this.window.hide();
    }
    this.publish();
  }
  async command(action, value) {
    if (action === "dismiss") {
      this.dismiss();
      return this.snapshot();
    }
    if (!this.current)
      throw Error("No desktop visual is open. Ask for a visual answer first.");
    if (["select", "focus", "explain-part"].includes(action)) {
      if (!value || value.visualId !== this.current.id)
        throw Error("This visual changed; select the part again.");
      const id = value.id === null ? null : (value.id ?? this.selectedId);
      if (
        id !== null &&
        (!this.current.spec.objects?.some((o) => o.id === id) ||
          !visiblePartIds(this.current.spec, this.step).includes(id))
      )
        throw Error("Part is not available in the current step.");
      if (action === "select") {
        if (!this.interactive || !this.canInteract())
          throw Error("Enable Interact before selecting parts.");
        this.selectedId = id;
        this.publish();
      } else {
        if (!id) throw Error("Select a part first.");
        if (action === "focus") {
          this.focusId = id;
          this.focusRevision++;
          this.publish();
        } else {
          if (!this.canInteract())
            throw Error("Finish the active task before asking about a part.");
          const part = this.current.spec.objects.find((o) => o.id === id);
          this.selectedId = id;
          this.setInteractive(false);
          await this.onExplain({
            visualId: this.current.id,
            id: part.id,
            label: part.label || part.id,
            description: part.description || "",
          });
        }
      }
      return this.snapshot();
    }
    if (action === "interact") {
      if (!this.canInteract())
        throw Error(
          "Finish the active voice/task before interacting with the canvas.",
        );
      this.setInteractive(true);
    } else if (action === "passthrough") this.setInteractive(false);
    else if (action === "animate") {
      if (typeof value !== "boolean")
        throw Error("Animation requires a boolean.");
      this.animate = value;
      this.publish();
    } else if (action === "reset") {
      this.reset++;
      this.viewKey++;
      this.publish();
    } else if (action === "step") {
      const steps = this.current.spec.steps || [];
      if (!Number.isInteger(value) || value < 0 || value >= steps.length)
        throw Error("Invalid teaching step.");
      this.cancelNarration();
      this.step = value;
      if (
        !visiblePartIds(this.current.spec, this.step).includes(this.selectedId)
      )
        this.selectedId = null;
      this.focusId = null;
      this.publish();
    } else if (action === "stop-audio") {
      this.cancelNarration();
      this.publish();
    } else if (action === "narrate" || action === "tour") {
      await this.narrate(action === "tour");
    } else throw Error("Unknown desktop canvas action.");
    return this.snapshot();
  }
  async explain(id, signal) {
    signal.throwIfAborted();
    if (this.current?.id !== id) return;
    this.step = 0;
    await this.narrate(true, { foregroundSignal: signal });
    signal.throwIfAborted();
    if (this.lastError) throw Error(this.lastError);
  }
  async narrate(tour, { foregroundSignal } = {}) {
    // Only explain() receives the task's real AbortSignal; IPC never supplies one.
    if (!foregroundSignal && !this.canNarrate())
      throw Error(
        "Finish the active voice/task before starting guided narration.",
      );
    this.cancelNarration();
    const controller = (this.audio = new AbortController()),
      visual = this.current,
      steps = visual.spec.steps?.length
        ? visual.spec.steps
        : [{ title: visual.spec.title, narration: visual.spec.caption }];
    const abort = () => controller.abort(foregroundSignal?.reason);
    foregroundSignal?.throwIfAborted();
    foregroundSignal?.addEventListener("abort", abort, { once: true });
    this.audioState = tour ? "tour" : "speaking";
    this.animate = tour;
    this.lastError = "";
    this.publish();
    try {
      for (let i = this.step; i < steps.length; i++) {
        controller.signal.throwIfAborted();
        if (this.current !== visual) return;
        this.step = i;
        if (
          !visiblePartIds(this.current.spec, this.step).includes(
            this.selectedId,
          )
        )
          this.selectedId = null;
        this.publish();
        const began = Date.now();
        await this.speak(
          steps[i].narration || steps[i].title,
          controller.signal,
        );
        const remaining =
          (steps[i].poses?.length ? (steps[i].durationMs ?? 650) : 0) -
          (Date.now() - began);
        if (tour && remaining > 0)
          await new Promise((resolve, reject) => {
            const finish = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", abort);
              resolve();
            };
            const abort = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", abort);
              reject(controller.signal.reason);
            };
            const timer = setTimeout(finish, remaining);
            controller.signal.addEventListener("abort", abort, { once: true });
            if (controller.signal.aborted) abort();
          });
        if (!tour) break;
      }
    } catch (e) {
      if (!controller.signal.aborted)
        this.lastError = String(e.message || e).slice(0, 240);
    } finally {
      foregroundSignal?.removeEventListener("abort", abort);
      if (this.audio === controller) {
        this.audio = null;
        this.audioState = "off";
        this.animate = false;
        this.publish();
      }
    }
  }
  rendererError(message) {
    this.cancelNarration();
    this.setInteractive(false);
    this.lastError = String(message).slice(0, 240);
    this.publish();
  }
  dispose() {
    this.dismiss();
    const w = this.window;
    this.window = null;
    if (w && !w.isDestroyed()) w.destroy();
  }
}
module.exports = { DesktopCanvas, canvasBounds };
