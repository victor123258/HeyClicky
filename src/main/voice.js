const { Speech } = require("./speech");
// Provider fallback is allowed only before finalization and before any delivered
// dictation. Stop/restart invalidates all previous provider callbacks.
class Voice {
  constructor({
    windows = new Speech(),
    edge,
    getSettings,
    notify = () => {},
  }) {
    this.windows = windows;
    this.edge = edge;
    this.getSettings = getSettings;
    this.notify = notify;
    this.generation = 0;
    this.engine = null;
    this.released = false;
  }
  stop() {
    this.generation++;
    this.engine = null;
    this.released = false;
    this.windows.stop();
    this.edge.cancel();
  }
  stopListening() {
    this.generation++;
    this.engine = null;
    this.released = false;
    this.windows.stopListening();
    this.edge.cancel();
  }
  finishListening() {
    this.released = true;
    this.engine?.finishListening();
  }
  listen(mode, onText, onStatus, onError, onEnd, language = "", options = {}) {
    this.stop();
    const generation = this.generation,
      settings = this.getSettings();
    let delivered = false;
    const current = () => this.generation === generation;
    const run = (provider) => {
      if (!current()) return;
      const engine = (this.engine =
        provider === "edge" ? this.edge : this.windows);
      let failure,
        complete = false;
      const valid = () => current() && !complete;
      const finish = (result) => {
        if (!valid()) return;
        complete = true;
        if (
          !result.ok &&
          provider === "edge" &&
          settings.edgeFallback &&
          !delivered &&
          !this.released
        ) {
          this.edge.cancel();
          this.notify(
            "Edge input failed. Switching to Windows speech; please repeat your question after Listening appears.",
          );
          run("windows");
          return;
        }
        this.engine = null;
        try {
          if (!result.ok) onError(failure || Error("Voice input stopped."));
        } finally {
          onEnd(result);
        }
      };
      try {
        engine.listen(
          mode,
          (text) => {
            if (valid()) {
              delivered = true;
              onText(text);
            }
          },
          (event) => {
            if (valid()) onStatus({ ...event, provider });
          },
          (error) => {
            failure = error;
          },
          finish,
          provider === "edge" ? settings.edgeLanguage : language,
          {
            ...options,
            onPartial: (text) => {
              if (valid()) options.onPartial?.(text);
            },
            onLevel: (level) => {
              if (valid()) options.onLevel?.(level);
            },
          },
        );
      } catch (error) {
        failure = error;
        finish({ ok: false });
      }
    };
    run(settings.voiceProvider === "edge" ? "edge" : "windows");
  }
  diagnostics() {
    return this.windows.diagnostics();
  }
  voices() {
    return this.windows.voices();
  }
  speak(...args) {
    return this.windows.speak(...args);
  }
}
module.exports = { Voice };
