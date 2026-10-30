const { validate } = require("./settings");
const QUICK_FIELDS = new Set(["screenContext", "edgeBackground"]);

// Serialize UI saves and helper-originated preference changes. Only failures
// before durable persistence roll hotkeys back; optional OS/UI failures are
// explicitly reported as warnings on an otherwise successful save.
class SettingsUpdater {
  constructor({
    settings,
    registerHotkeys,
    canSave = () => true,
    effects = () => [],
  }) {
    Object.assign(this, { settings, registerHotkeys, canSave, effects });
    this.tail = Promise.resolve();
    this.accepting = true;
  }
  freeze() {
    this.accepting = false;
  }
  resume() {
    this.accepting = true;
  }
  whenIdle() {
    return this.tail.catch(() => {});
  }
  enqueue(fn) {
    if (!this.accepting)
      return Promise.reject(
        Error(
          "Settings are closing; wait for data deletion or restart the app.",
        ),
      );
    const operation = this.tail
      .catch(() => {})
      .then(() => {
        if (!this.accepting)
          throw Error("Settings are closing; update was not saved.");
        return fn();
      });
    this.tail = operation;
    return operation;
  }
  save(value, key) {
    const input = structuredClone(value);
    return this.enqueue(() => this.commit(input, key));
  }
  patch(changes) {
    if (
      !changes ||
      typeof changes !== "object" ||
      Array.isArray(changes) ||
      !Object.keys(changes).length ||
      Object.keys(changes).some((k) => !QUICK_FIELDS.has(k))
    )
      return Promise.reject(
        Error(
          "Only screen context and background-launch preference may be updated here.",
        ),
      );
    const patch = structuredClone(changes);
    return this.enqueue(() =>
      this.commit({ ...this.settings.value, ...patch }),
    );
  }
  // Internal only: the authenticated visible helper still performs the real
  // microphone test/consent check before calling this. Never exposed as IPC.
  updateEdge(allowed, windowMode) {
    if (
      typeof allowed !== "boolean" ||
      (windowMode !== undefined &&
        !["hidden", "minimized"].includes(windowMode))
    )
      return Promise.reject(Error("Invalid Edge preference."));
    return this.enqueue(() =>
      this.settings.save({
        ...this.settings.value,
        edgeBackground: allowed,
        ...(windowMode ? { edgeWindowMode: windowMode } : {}),
      }),
    );
  }
  async commit(input, key) {
    if (!this.canSave())
      throw Error("Stop the current task before changing settings.");
    const next = validate(input),
      previous = this.settings.value;
    if (next.edgeBackground && !previous.edgeBackground)
      throw Error(
        "Enable background use from the visible Edge helper after a successful test.",
      );
    let saved;
    try {
      this.registerHotkeys(next);
      saved = this.settings.save(next, key);
    } catch (error) {
      try {
        this.registerHotkeys(previous);
      } catch {
        throw Error(
          "Settings were not saved and previous hotkeys could not be restored. Restart the app to recover.",
        );
      }
      throw error;
    }
    const saveWarnings = [];
    try {
      for (const effect of this.effects({ next, previous })) {
        try {
          await effect.run();
        } catch {
          saveWarnings.push(effect.warning);
        }
      }
    } catch {
      // Even a failure building the optional effect list cannot turn a durable
      // commit into a misleading "save failed" or roll active hotkeys back.
      saveWarnings.push(
        "Settings were saved, but application refresh failed. Restart the app to apply them.",
      );
    }
    return { ...saved, saveWarnings };
  }
}
module.exports = { SettingsUpdater };
