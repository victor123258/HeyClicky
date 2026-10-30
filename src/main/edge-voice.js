const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

// Real Edge, not Electron's Web Speech API. Loopback only, stable origin,
// dedicated browser profile, per-app-run bearer capability, no model API key.
class EdgeVoice {
  constructor({
    userData,
    native,
    getBackground = () => false,
    onBackground = () => {},
    onStatus = () => {},
    port = 21843,
    platform = process.platform,
    spawnImpl = spawn,
    exists = fs.existsSync,
    now = Date.now,
  } = {}) {
    this.profile = path.join(userData, "edge-voice-profile");
    this.native = native;
    this.getBackground = getBackground;
    this.onBackground = onBackground;
    this.onStatus = onStatus;
    this.port = port;
    this.platform = platform;
    this.spawn = spawnImpl;
    this.exists = exists;
    this.now = now;
    this.token = crypto.randomBytes(32).toString("hex");
    this.server = null;
    this.stream = null;
    this.active = null;
    this.starting = null;
    this.lastBeat = 0;
    this.forceVisible = false;
    this.lastDetail = "Edge helper is not connected.";
    this.successfulTest = false;
    this.pendingStops = new Map();
    this.helperTouched = false;
  }
  get connected() {
    return Boolean(
      this.stream &&
      !this.stream.destroyed &&
      this.now() - this.lastBeat < 12000,
    );
  }
  status() {
    return {
      connected: this.connected,
      backgroundAllowed: this.getBackground(),
      origin: this.origin || "http://127.0.0.1:21843",
      detail: this.lastDetail,
    };
  }
  changed(detail) {
    if (detail) this.lastDetail = detail;
    this.onStatus(this.status());
  }
  async ensureServer() {
    if (this.server?.listening) return;
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      const server = (this.server = http.createServer((req, res) =>
        this.request(req, res),
      ));
      server.on("clientError", (_err, socket) => socket.destroy());
      server.once("error", () => {
        this.server = null;
        reject(
          Error(
            "Edge voice helper could not use local port 21843. Close another copy or check local security software.",
          ),
        );
      });
      server.listen(this.port, "127.0.0.1", () => {
        this.origin = `http://127.0.0.1:${server.address().port}`;
        this.watchdog = setInterval(() => {
          if (this.active?.started && !this.connected)
            this.fail(Error("Edge helper disconnected or was suspended."));
        }, 2000);
        this.watchdog.unref?.();
        resolve();
      });
    });
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  authorized(req) {
    const auth = req.headers.authorization || "";
    const expected = `Bearer ${this.token}`;
    const a = Buffer.from(auth),
      b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  request(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    res.setHeader("Permissions-Policy", "microphone=(self)");
    // Prevent DNS rebinding, remote preview exposure and cross-origin requests.
    if (
      req.headers.host !== new URL(this.origin).host ||
      (req.headers.origin && req.headers.origin !== this.origin)
    ) {
      res.writeHead(403);
      res.end("Local helper only.");
      return;
    }
    const files = {
      "/": ["index.html", "text/html"],
      "/voice.js": ["voice.js", "text/javascript"],
      "/voice.css": ["voice.css", "text/css"],
    };
    if (req.method === "GET" && Object.hasOwn(files, req.url)) {
      const [name, type] = files[req.url];
      res.setHeader("Content-Type", `${type}; charset=utf-8`);
      fs.readFile(path.join(__dirname, "../edge-voice", name), (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end("Helper files unavailable.");
        } else res.end(data);
      });
      return;
    }
    if (!this.authorized(req)) {
      res.writeHead(401);
      res.end("Open this helper from HeyClicky Settings.");
      return;
    }
    if (req.method === "GET" && req.url === "/stream") {
      if (this.stream) {
        this.send({ type: "cancel" });
        this.stream.end();
        if (this.active?.started)
          this.fail(Error("A new Edge helper replaced the active connection."));
      }
      this.helperTouched = true;
      this.stream = res;
      this.lastBeat = this.now();
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        Connection: "keep-alive",
      });
      this.send({ type: "hello", backgroundAllowed: this.getBackground() });
      this.changed(
        "Edge helper connected. Recognition still depends on browser permission and online service availability.",
      );
      res.on("close", () => {
        if (this.stream === res) {
          this.stream = null;
          if (this.active)
            this.fail(
              Error("Edge helper window closed or connection was interrupted."),
            );
          this.changed("Edge helper disconnected.");
        }
      });
      if (this.active && !this.active.started) this.startSession();
      if (this.getBackground() && !this.forceVisible)
        this.windowAction("minimize").catch(() =>
          this.changed("Connected, but could not minimize the Edge helper."),
        );
      return;
    }
    if (req.method === "POST" && req.url === "/event") {
      req.setEncoding("utf8");
      let data = "",
        tooLarge = false;
      req.on("data", (chunk) => {
        data += chunk.toString("utf8");
        if (data.length > 32768) {
          tooLarge = true;
          res.writeHead(413);
          res.end();
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (tooLarge) return;
        try {
          const event = JSON.parse(data);
          await this.event(event);
          res.writeHead(200);
          res.end("OK");
        } catch {
          res.writeHead(400);
          res.end("Invalid helper event.");
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found.");
  }
  send(data) {
    if (this.stream && !this.stream.destroyed)
      this.stream.write(JSON.stringify(data) + "\n");
  }
  async event(event) {
    if (!event || typeof event.type !== "string") throw Error("Invalid event.");
    this.lastBeat = this.now();
    if (event.type === "heartbeat") return;
    if (event.type === "stopped") {
      clearTimeout(this.pendingStops.get(event.id));
      this.pendingStops.delete(event.id);
      return;
    }
    if (event.type === "test-success") {
      this.successfulTest = true;
      this.changed("Edge microphone test succeeded in the visible helper.");
      return;
    }
    if (event.type === "background-approved") {
      if (!this.successfulTest) throw Error("Test the microphone first.");
      await this.onBackground(true);
      this.forceVisible = false;
      this.send({ type: "hello", backgroundAllowed: true });
      await this.windowAction("minimize");
      this.changed(
        "Background use enabled. The dedicated Edge helper was asked to minimize.",
      );
      return;
    }
    const session = this.active;
    if (!session || event.id !== session.id) return; // stale, stopped or replaced turn
    if (event.type === "ready") {
      if (session.ready) return;
      session.ready = true;
      this.arm(
        session,
        session.finishing ? 12000 : session.mode === "dictate" ? 300000 : 90000,
        "Edge voice turn timed out.",
      );
      session.onStatus({
        type: "ready",
        language: session.language,
        provider: "edge",
      });
      return;
    }
    if (event.type === "partial" && typeof event.text === "string") {
      session.options.onPartial?.(event.text.slice(0, 12000));
      return;
    }
    if (
      event.type === "text" &&
      session.mode === "dictate" &&
      typeof event.text === "string"
    ) {
      session.onText(event.text.slice(0, 12000));
      return;
    }
    if (event.type === "error") {
      this.fail(
        Error(
          `Edge speech: ${String(event.error || "recognition failed").slice(0, 150)}. Open Edge setup if permission or another user gesture is needed.`,
        ),
      );
      return;
    }
    if (event.type === "final") {
      if (!session.ready || (session.options.held && !session.finishing)) {
        this.fail(
          Error("Edge stopped before release; no voice request was submitted."),
        );
        return;
      }
      if (typeof event.text !== "string" || !event.text.trim()) {
        this.fail(
          Error(
            "Edge heard no completed speech. Try the helper microphone test.",
          ),
        );
        return;
      }
      session.onText(event.text.trim().slice(0, 12000));
      this.end();
      return;
    }
    if (event.type === "ended" && session.mode === "dictate") {
      this.fail(Error("Edge dictation stopped. Restart it to continue."));
      return;
    }
  }
  edgePath() {
    const candidates = [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ]
      .filter(Boolean)
      .map((dir) =>
        path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
    return candidates.find((file) => this.exists(file));
  }
  async launch(visible) {
    if (this.platform !== "win32")
      throw Error(
        "The Edge helper requires Windows and installed Microsoft Edge.",
      );
    const executable = this.edgePath();
    if (!executable)
      throw Error(
        "Microsoft Edge was not found. Install Edge or choose Windows speech.",
      );
    await fsp.mkdir(this.profile, { recursive: true });
    if (!visible && !this.active) return;
    this.forceVisible = visible;
    const args = [
      `--user-data-dir=${this.profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--app=${this.origin}/#${this.token}`,
    ];
    if (!visible) args.push("--start-minimized");
    this.helperTouched = true;
    const child = this.spawn(executable, args, {
      stdio: "ignore",
      windowsHide: false,
    });
    child.on("error", () => {
      if (this.active)
        this.fail(Error("Could not launch the Edge voice helper."));
      this.changed("Could not launch Edge. Open setup again.");
    });
    child.unref?.();
  }
  async openSetup() {
    await this.ensureServer();
    this.forceVisible = true;
    if (this.connected) {
      try {
        await this.windowAction("restore");
        return this.status();
      } catch {
        /* Open a fresh visible helper if an old window vanished. */
      }
    }
    await this.launch(true);
    this.changed(
      "Edge setup opened. Grant microphone permission, test recognition, then choose background use.",
    );
    return this.status();
  }
  async windowAction(action) {
    if (!this.native) return;
    await this.native.collect(
      this.native.launch("edge-window.ps1", [], {
        profile: this.profile,
        action,
      }),
      undefined,
      15000,
    );
  }
  listen(mode, onText, onStatus, onError, onEnd, language, options = {}) {
    this.cancel();
    const session = (this.active = {
      id: crypto.randomUUID(),
      mode,
      onText,
      onStatus,
      onError,
      onEnd,
      language: language || "en-US",
      options,
      ready: false,
      started: false,
      finishing: false,
    });
    this.arm(
      session,
      15000,
      "Edge helper did not become ready. Open its setup window and check microphone permission.",
    );
    this.ensureServer()
      .then(async () => {
        if (this.active !== session) return;
        if (this.connected) this.startSession();
        else if (this.getBackground()) await this.launch(false);
        else
          this.fail(
            Error(
              "Set up Edge voice first: open the visible helper, test its microphone and enable background use.",
            ),
          );
      })
      .catch((error) => {
        if (this.active === session) this.fail(error);
      });
  }
  startSession() {
    const s = this.active;
    if (!s || s.started) return;
    s.started = true;
    this.send({
      type: "start",
      id: s.id,
      mode: s.mode,
      held: Boolean(s.options.held),
      language: s.language,
    });
    if (s.finishing) this.send({ type: "finish", id: s.id });
  }
  arm(session, ms, message) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      if (this.active === session) this.fail(Error(message));
    }, ms);
    session.timer.unref?.();
  }
  finishListening() {
    const s = this.active;
    if (!s || s.finishing) return;
    s.finishing = true;
    this.arm(s, 12000, "Edge did not finish transcribing after release.");
    this.send({ type: "finish", id: s.id });
  }
  end(error) {
    const s = this.active;
    if (!s) return;
    this.active = null;
    clearTimeout(s.timer);
    try {
      if (error) {
        this.abortSession(s);
        s.onError(error);
      }
    } finally {
      s.onEnd({ ok: !error });
    }
  }
  abortSession(session) {
    this.send({ type: "cancel", id: session.id });
    const timer = setTimeout(() => {
      this.pendingStops.delete(session.id);
      this.windowAction("close").catch(() =>
        this.changed(
          "Could not close an unresponsive Edge helper. Close its dedicated window manually.",
        ),
      );
    }, 2000);
    timer.unref?.();
    this.pendingStops.set(session.id, timer);
  }
  fail(error) {
    this.end(error);
  }
  cancel() {
    const s = this.active;
    if (!s) return;
    this.active = null;
    clearTimeout(s.timer);
    this.abortSession(s);
  }
  async dispose({ deleteProfile = false } = {}) {
    this.cancel();
    this.successfulTest = false;
    clearInterval(this.watchdog);
    this.send({ type: "shutdown" });
    this.stream?.end();
    this.stream = null;
    const server = this.server;
    this.server = null;
    if (server) {
      server.close();
      server.closeAllConnections?.();
    }
    if (this.platform === "win32" && this.helperTouched)
      await this.windowAction("close");
    for (const timer of this.pendingStops.values()) clearTimeout(timer);
    this.pendingStops.clear();
    this.changed("Edge helper closed.");
    if (deleteProfile)
      await fsp.rm(this.profile, {
        recursive: true,
        force: true,
        maxRetries: 6,
        retryDelay: 500,
      });
  }
}
module.exports = { EdgeVoice };
