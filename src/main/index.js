const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen,
  desktopCapturer,
  safeStorage,
  shell,
  dialog,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { Settings } = require("./lib/settings");
const { complete } = require("./lib/llm");
const { runAgent } = require("./lib/agent");
const { timeQuestion } = require("./lib/clock");
const { Voice } = require("./voice");
const { EdgeVoice } = require("./edge-voice");
const { Notch } = require("./notch");
const { Tasks } = require("./lib/tasks");
const { BackgroundJobs, ApprovalQueue } = require("./lib/background");
const { searchWeb, text: htmlText } = require("./lib/research");
const { createDocument } = require("./lib/documents");
const { validateVisual } = require("./lib/visuals");
const { Keys } = require("./keys");
const { keyGroups } = require("./lib/hold-keys");
const native = require("./native");
const smokeMode = process.argv.includes("--smoke-test");
if (smokeMode) {
  app.disableHardwareAcceleration();
  if (!process.env.HEYCLICKY_TEST_USER_DATA)
    throw Error(
      "Smoke tests require isolated user data. Use scripts/desktop-smoke.js.",
    );
  app.setPath("userData", process.env.HEYCLICKY_TEST_USER_DATA);
}

let backgroundJobs;
let visualResults = [];
let edge,
  edgeClosing = false;
let panel,
  tray,
  settings,
  speech,
  notch,
  keys,
  heldTurn,
  controller,
  approval,
  quitting = false,
  state = "idle",
  listeningMode;
let overlays = [],
  history = [],
  messages = [],
  activeDisplay,
  lastAnnotations = [],
  requestRunning = false,
  currentTaskId = null,
  approvalPublic = null;
const tasks = new Tasks((data) => emit("tasks", data));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function emit(type, data) {
  if (type === "message") {
    data = {
      ...data,
      jobId: data.jobId ?? currentTaskId,
      at: Date.now(),
      id: crypto.randomUUID(),
    };
    messages.push(data);
    messages = messages.slice(-200);
  }
  if (panel && !panel.isDestroyed())
    panel.webContents.send("event", { type, data });
  if (notch && !notch.window.isDestroyed())
    notch.window.webContents.send("event", { type, data });
  if (type === "message") notch?.message(data.text, data.role);
  if (type === "voice-partial") notch?.message(data, "transcript");
  if (type === "voice-heard") notch?.message(`Heard: ${data}`, "transcript");
  if (type === "error") notch?.message(data, "error");
}
function setState(next) {
  if (currentTaskId && ["approval", "working", "thinking"].includes(next))
    tasks.update(currentTaskId, {
      status: next === "approval" ? "approval" : "running",
    });
  state = next;
  emit("state", next);
  broadcast("state", next);
  notch?.setState(next);
}
function broadcast(type, data) {
  for (const win of overlays)
    if (!win.isDestroyed()) win.webContents.send("overlay", { type, data });
}
function showPanel(route = "chat") {
  if (notch?.enabled) notch.open(route);
  else {
    panel.show();
    panel.focus();
  }
}
function error(error) {
  emit("error", error.message || String(error));
  if (notch?.enabled) notch.peek();
  else {
    panel.show();
    panel.focus();
  }
}
function stop(all = true) {
  if (all) backgroundJobs?.stopAll();
  controller?.abort();
  controller = null;
  speech?.stop();
  listeningMode = null;
  heldTurn = null;
  tasks.stopAll(all ? undefined : "desktop");
  broadcast("caption", null);
  if (
    approval &&
    (all || !approval.jobId || approval.jobId === currentTaskId)
  ) {
    approval.resolve(false);
    approval = null;
    approvalPublic = null;
    emit("approval", null);
  }
  lastAnnotations = [];
  broadcast("clear");
  notch?.clear();
  setState("idle");
}
function registerHotkeys(value) {
  globalShortcut.unregisterAll();
  keyGroups(value.hotkeys.talk);
  keyGroups(value.hotkeys.agent);
  const actions = {
    talk: () => startHold("talk", "keyboard"),
    agent: () => startHold("agent", "keyboard"),
    dictate: toggleDictation,
    panel: () =>
      notch?.mode === "expanded" ? notch.expand(false) : showPanel("home"),
    stop,
  };
  for (const [name, combo] of Object.entries(value.hotkeys)) {
    let registered = false;
    try {
      registered = globalShortcut.register(combo, actions[name]);
    } catch {
      /* invalid accelerator */
    }
    if (!registered) {
      globalShortcut.unregisterAll();
      throw Error(
        `Cannot register ${name} hotkey (${combo}). It may be invalid or used by another app.`,
      );
    }
  }
  if (!smokeMode) keys?.start(value.hotkeys);
}
function createOverlays() {
  for (const win of overlays) win.destroy();
  overlays = [];
  for (const display of screen.getAllDisplays()) {
    const win = new BrowserWindow({
      ...display.bounds,
      transparent: true,
      frame: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, "../preload/overlay.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setContentProtection(true);
    win.loadFile(path.join(__dirname, "../renderer/overlay.html"));
    win.webContents.on("did-finish-load", () =>
      win.webContents.send("overlay", {
        type: "init",
        data: { bounds: display.bounds, buddy: settings.value.buddy },
      }),
    );
    overlays.push(win);
  }
}
async function capture(signal) {
  if (!settings.value.screenContext)
    throw Error(
      "Screen context is off. Turn it on before taking a screenshot.",
    );
  signal?.throwIfAborted();
  const display = screen
    .getAllDisplays()
    .find((d) => d.id === activeDisplay?.id);
  if (!display)
    throw Error("Selected display disconnected. Start a new request.");
  const wasVisible = panel.isVisible();
  // Hide our own UI and drawings so they do not obscure the application.
  panel.hide();
  for (const win of overlays) win.hide();
  notch?.suspend(true);
  try {
    await delay(180);
    signal?.throwIfAborted();
    const scale = Math.min(1, 1600 / display.size.width);
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale),
      },
    });
    signal?.throwIfAborted();
    const source = sources.find(
      (s) => String(s.display_id) === String(display.id),
    );
    if (!source || source.thumbnail.isEmpty())
      throw Error("Could not capture this display.");
    return (
      "data:image/jpeg;base64," + source.thumbnail.toJPEG(75).toString("base64")
    );
  } finally {
    for (const win of overlays) if (!win.isDestroyed()) win.showInactive();
    if (wasVisible && !panel.isDestroyed()) panel.showInactive();
    notch?.suspend(false);
  }
}
const approvalQueue = new ApprovalQueue(presentApproval);
function approve(action, signal) {
  return approvalQueue.request(action, signal);
}
function presentApproval(action, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      approval = null;
      approvalPublic = null;
      emit("approval", null);
      resolve(value);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 120000);
    approval = {
      id: crypto.randomUUID(),
      jobId: action.jobId ?? currentTaskId,
      resolve: finish,
    };
    signal.addEventListener("abort", abort, { once: true });
    approvalPublic = { id: approval.id, jobId: currentTaskId, ...action };
    emit("approval", approvalPublic);
    if (!action.jobId || action.jobId === currentTaskId) setState("approval");
    showPanel("chat");
    if (signal.aborted) finish(false);
  });
}
async function desktopInput(request, signal) {
  // Return focus to the underlying application. Hide the notch as well: a target
  // at the top center must not accidentally click one of our own quick controls.
  panel.hide();
  notch?.suspend(true);
  try {
    await delay(350);
    signal.throwIfAborted();
    return await native.input(request, signal);
  } finally {
    notch?.suspend(false);
  }
}
async function renderPDF(html, signal) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const abort = () => {
    if (!win.isDestroyed()) win.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  timeout.unref?.();
  try {
    signal.throwIfAborted();
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    signal.throwIfAborted();
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
    });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    if (!win.isDestroyed()) win.destroy();
  }
}
async function safeTool(name, args, signal, jobId = null) {
  signal.throwIfAborted();
  if (name === "search_web") return searchWeb(args.query, signal);
  if (name === "create_document")
    return createDocument(args, signal, (html) => renderPDF(html, signal));
  if (name === "show_visual") {
    const spec = validateVisual(args.spec),
      visual = { id: crypto.randomUUID(), jobId, spec };
    visualResults.push(visual);
    visualResults = visualResults.slice(-8);
    emit("visual", visual);
    return (
      "Interactive visual added to the notch conversation. Title: " + spec.title
    );
  }
  // Only these existing approval-gated data operations may run off-desktop.
  if (!["read_file", "write_file", "fetch_url"].includes(name))
    throw Error("Tool unavailable in background mode.");
  return dataTool(name, args, signal);
}
async function dataTool(name, args, signal) {
  signal.throwIfAborted();
  if (name === "read_file") {
    const handle = await fs.open(args.path, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 32768)
        throw Error("Read limit is 32 KB and regular text files only.");
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  }
  if (name === "write_file") {
    signal.throwIfAborted();
    await fs.writeFile(args.path, args.content, { encoding: "utf8", signal });
    return "File written.";
  }
  if (name === "fetch_url") {
    const response = await fetch(args.url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      redirect: "error",
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!/text\/|application\/(json|xml)/i.test(type))
      throw Error("Only text, JSON or XML responses can be fetched.");
    const reader = response.body.getReader();
    let data = Buffer.alloc(0);
    try {
      while (data.length < 32768) {
        const { value, done } = await reader.read();
        if (done) break;
        data = Buffer.concat([
          data,
          Buffer.from(value).subarray(0, 32768 - data.length),
        ]);
      }
    } finally {
      await reader.cancel();
    }
    return (
      (/text\/html/i.test(type)
        ? htmlText(data.toString("utf8"))
        : data.toString("utf8")) +
      "\nSource: " +
      args.url +
      "\nRetrieved: " +
      new Date().toISOString() +
      "\n[Maximum 32 KB; redirects are not followed.]"
    );
  }

  throw Error("Unknown data tool.");
}
async function execute(name, args, signal) {
  signal.throwIfAborted();
  if (["search_web", "create_document", "show_visual"].includes(name))
    return safeTool(name, args, signal, currentTaskId);
  setState("working");
  if (name === "screenshot") return capture(signal);
  if (name === "draw") {
    if (!settings.value.screenContext)
      throw Error("Screen context is disabled.");
    lastAnnotations.push({ ...args, bounds: activeDisplay.bounds });
    lastAnnotations = lastAnnotations.slice(-8);
    broadcast("draw", lastAnnotations);
    return "Annotation displayed.";
  }

  if (name === "click") {
    if (!screen.getAllDisplays().some((d) => d.id === activeDisplay.id))
      throw Error("Display disconnected.");
    const b = activeDisplay.bounds;
    const point = screen.dipToScreenPoint({
      x: Math.round(b.x + (args.x / 1000) * (b.width - 1)),
      y: Math.round(b.y + (args.y / 1000) * (b.height - 1)),
    });
    await desktopInput(
      { action: "click", ...point, button: args.button },
      signal,
    );
    return "Clicked. Take a new screenshot to verify.";
  }
  if (name === "type_text") {
    await desktopInput({ action: "type", text: args.text }, signal);
    return "Text sent to focused window. Verify with a screenshot.";
  }
  if (name === "press_keys") {
    await desktopInput({ action: "keys", keys: args.keys }, signal);
    return "Keys sent. Verify result.";
  }
  if (name === "powershell")
    return (
      (await native.powershell(args.command, signal)) || "Command completed."
    );
  if (name === "open_url") {
    await shell.openExternal(args.url);
    return "Opened in default browser.";
  }
  if (["read_file", "write_file", "fetch_url"].includes(name))
    return dataTool(name, args, signal);
  throw Error("Unknown tool.");
}
async function ask(text, mode = "talk", display, taskId = null) {
  if (controller || listeningMode || requestRunning)
    throw Error("Stop the current task before starting another.");
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 12000 ||
    !["talk", "agent"].includes(mode)
  )
    throw Error("Enter a question (up to 12,000 characters).");
  if (!settings.key)
    throw Error("Open Settings and add your OpenRouter API key.");
  if (/^agent\b[\s,:]*/i.test(text)) {
    mode = "agent";
    text = text.replace(/^agent\b[\s,:]*/i, "");
  }
  const current = (controller = new AbortController());
  const signal = current.signal;
  requestRunning = true;
  currentTaskId = taskId;
  const task = taskId ? tasks.get(taskId) : null;
  if (task) tasks.update(taskId, { status: "running" });
  activeDisplay =
    display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  lastAnnotations = [];
  broadcast("clear");
  emit("message", { role: "user", text, mode });
  setState("thinking");
  try {
    const image =
      settings.value.screenContext && !timeQuestion(text)
        ? await capture(signal)
        : null;
    const chunks = [];
    const answer = await runAgent({
      text,
      mode,
      history: task ? task.history : history,
      outputDirectory: /document|report|pdf|docx|write|create/i.test(text)
        ? app.getPath("documents")
        : "",
      image,
      signal,
      askBeforeActions: settings.value.askBeforeActions,
      complete: (messages, tools, signal) =>
        complete({
          key: settings.key,
          model: settings.value.model,
          messages,
          tools,
          signal,
        }),
      execute,
      approve,
      onMessage: (text) => {
        chunks.push(text);
        emit("message", { role: "assistant", text });
      },
      onTool: (data) => {
        if (task) tasks.step(taskId, data);
        emit("tool", data);
        if (data.status !== "pending") setState("thinking");
      },
    });
    signal.throwIfAborted();
    if (answer && chunks[chunks.length - 1] !== answer)
      emit("message", { role: "assistant", text: answer });
    // Persist text only in memory, never previous screen images or tool payloads.
    const targetHistory = task ? task.history : history;
    targetHistory.push(
      { role: "user", content: text },
      {
        role: "assistant",
        content: [...chunks, ...(chunks.at(-1) !== answer ? [answer] : [])]
          .join("\n")
          .slice(0, 12000),
      },
    );
    if (task) {
      task.history = targetHistory.slice(-12);
      tasks.update(taskId, {
        status: answer.startsWith("That action was denied.")
          ? "cancelled"
          : "completed",
        result: answer,
      });
    } else history = history.slice(-12);
    if (settings.value.captions && answer)
      broadcast("caption", {
        text: answer.slice(0, 600),
        bounds: activeDisplay.bounds,
      });
    if (settings.value.speak && answer) {
      setState("speaking");
      try {
        await speech.speak(answer, settings.value, signal);
      } catch (e) {
        if (!signal.aborted)
          emit("error", "Answer ready, but voice failed: " + e.message);
      } finally {
        broadcast("caption", null);
      }
    }
  } catch (e) {
    if (task)
      tasks.update(taskId, {
        status: signal.aborted ? "cancelled" : "failed",
        result: signal.aborted
          ? "Stopped. Already performed changes cannot be undone."
          : e.message,
      });
    if (!signal.aborted) error(e);
  } finally {
    requestRunning = false;
    currentTaskId = null;
    if (controller === current) {
      controller = null;
      setState("idle");
    }
    setImmediate(pumpTasks);
  }
}
function submit(text, mode = "talk", taskId, display) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 12000 ||
    !["talk", "agent", "background"].includes(mode)
  )
    throw Error("Enter a question up to 12,000 characters.");
  if (!settings.key) {
    showPanel("settings");
    throw Error("Save your OpenRouter API key in Settings first.");
  }
  if (mode !== "background" && /^agent\b[\s,:]*/i.test(text)) {
    mode = "agent";
    text = text.replace(/^agent\b[\s,:]*/i, "");
  }
  if (!text.trim()) throw Error("Tell the agent what you want it to do.");
  if (taskId && (currentTaskId === taskId || backgroundJobs.active.has(taskId)))
    throw Error(
      "Wait for the previous task to finish stopping before following up.",
    );
  if (mode === "background") {
    const job = tasks.enqueue(text, taskId, "background");
    backgroundJobs.pump();
    return job.id;
  }
  if (mode === "agent") {
    const task = tasks.enqueue(text, taskId);
    task.display =
      display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    setImmediate(pumpTasks);
    return task.id;
  }
  if (controller || listeningMode || requestRunning)
    throw Error("A task is running. Stop it, or queue an Agent task.");
  ask(text, mode, display).catch(error);
  return null;
}
function pumpTasks() {
  if (quitting || controller || listeningMode || requestRunning) return;
  const task = tasks.next();
  if (!task) return;
  ask(task.prompt, "agent", task.display, task.id).catch((e) => {
    tasks.update(task.id, { status: "failed", result: e.message });
    error(e);
  });
}
function cancelTask(id) {
  if (typeof id !== "string" || !tasks.get(id)) throw Error("Unknown task.");
  if (!tasks.cancel(id)) return;
  if (tasks.get(id).kind === "background") {
    backgroundJobs.cancel(id);
    return;
  }
  if (currentTaskId === id) {
    controller?.abort();
    speech.stop();
    if (approval?.jobId === id) approval.resolve(false);
  }
}
function startHold(mode, source = "pointer") {
  if (!["talk", "agent", "background"].includes(mode))
    throw Error("Invalid voice mode.");
  if (heldTurn) return;
  if (source === "keyboard" && !keys?.ready) {
    error(
      Error(
        "Shortcut monitoring is starting. Try again shortly or use the on-screen hold button.",
      ),
    );
    return;
  }
  if (controller || listeningMode || requestRunning) {
    error(Error("Stop the current task before recording another."));
    return;
  }
  heldTurn = { mode, source, started: Date.now(), ready: false };
  listen(mode, true);
}
function releaseHold(source = "pointer", cancel = false) {
  const held = heldTurn;
  if (!held || held.source !== source) return;
  if (cancel || !held.ready || Date.now() - held.started < 250) {
    speech.stopListening();
    listeningMode = null;
    heldTurn = null;
    setState("idle");
    emit(
      "voice-cancelled",
      "Recording cancelled. Hold until Listening appears, then speak.",
    );
    setImmediate(pumpTasks);
    return;
  }
  heldTurn = null;
  setState("transcribing");
  speech.finishListening();
}
function listen(mode, held = false) {
  if (controller || listeningMode || requestRunning) {
    stop();
    return;
  }
  if (mode !== "test" && !settings.key) {
    heldTurn = null;
    showPanel("settings");
    error(
      Error(
        "Add your API key before voice chat. The microphone test works without a key.",
      ),
    );
    return;
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    turn = Symbol("voice-turn");
  let transcript = "";
  listeningMode = turn;
  notch?.clear();
  setState("starting");
  try {
    speech.listen(
      mode,
      (text) => {
        transcript = text;
        emit("voice-heard", text);
      },
      (event) => {
        if (heldTurn) heldTurn.ready = true;
        setState("listening");
        emit("voice-ready", {
          language: event.language,
          provider: event.provider || "windows",
          test: mode === "test",
          held,
        });
      },
      error,
      (result) => {
        if (listeningMode !== turn) return;
        listeningMode = null;
        heldTurn = null;
        setState("idle");
        if (result.cancelled)
          emit(
            "voice-cancelled",
            "Recording cancelled in Edge. No voice request was submitted.",
          );
        if (result.ok && transcript && mode !== "test") {
          try {
            submit(transcript, mode, undefined, display);
          } catch (e) {
            error(e);
          }
        } else {
          if (mode === "test" && result.ok)
            emit("voice-test-result", transcript);
          setImmediate(pumpTasks);
        }
      },
      settings.value.speechLanguage,
      {
        held,
        onPartial: (text) => emit("voice-partial", text),
        onLevel: (level) => emit("voice-level", level),
      },
    );
  } catch (e) {
    heldTurn = null;
    listeningMode = null;
    setState("idle");
    error(e);
  }
}
function toggleDictation() {
  if (controller || listeningMode) {
    stop(false);
    return;
  }
  listeningMode = "dictate";
  panel.hide();
  notch?.expand(false);
  setState("starting");
  controller = new AbortController();
  const current = controller;
  let queue = Promise.resolve();
  try {
    speech.listen(
      "dictate",
      (text) => {
        emit("dictation", text);
        queue = queue
          .then(() => {
            current.signal.throwIfAborted();
            return native.input(
              { action: "type", text: text + " " },
              current.signal,
            );
          })
          .catch((e) => {
            if (!current.signal.aborted) {
              stop(false);
              error(e);
            }
          });
      },
      (event) => {
        setState("dictating");
        emit("voice-ready", {
          language: event.language,
          provider: event.provider || "windows",
        });
      },
      (e) => {
        stop(false);
        error(e);
      },
      () => {
        if (controller === current) stop(false);
      },
      settings.value.speechLanguage,
    );
  } catch (e) {
    stop(false);
    error(e);
  }
}
function trusted(event) {
  if (
    ![panel, notch?.window].some(
      (win) =>
        win &&
        event.sender === win.webContents &&
        event.senderFrame === win.webContents.mainFrame,
    )
  )
    throw Error("Untrusted IPC sender.");
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    trusted(event);
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}
function installIPC() {
  const trustedNotch = (event) => {
    if (
      !notch ||
      event.sender !== notch.window.webContents ||
      event.senderFrame !== notch.window.webContents.mainFrame
    )
      throw Error("Untrusted notch sender.");
  };
  ipcMain.handle("notch:get", (event) => {
    trustedNotch(event);
    return notch.snapshot();
  });
  ipcMain.handle("notch:peek", (event) => {
    trustedNotch(event);
    notch.peek();
  });
  ipcMain.handle("notch:open", (event, route) => {
    trustedNotch(event);
    if (!["home", "chat", "settings"].includes(route))
      throw Error("Unknown view.");
    notch.open(route);
  });
  ipcMain.handle("notch:expand", (event, value) => {
    trustedNotch(event);
    if (typeof value !== "boolean") throw Error("Invalid expansion state.");
    notch.expand(value);
  });
  ipcMain.handle("notch:action", (event, name) => {
    trustedNotch(event);
    if (name === "stop") {
      stop();
      return;
    }
    if (name === "panel") {
      showPanel("chat");
      return;
    }
    if (name === "settings") {
      showPanel("settings");
      emit("settings-open");
      return;
    }
    if (controller || listeningMode)
      return { error: "Stop the current task first." };
    if (name === "talk" || name === "agent") listen(name);
    else if (name === "dictate") toggleDictation();
    else return { error: "Unknown notch action." };
  });
  handle("get-settings", () => ({
    ...settings.public(),
    edgeStatus: edge?.status(),
    platform: process.platform,
    version: app.getVersion(),
    state,
    history,
    messages,
    tasks: tasks.snapshot(),
    visuals: visualResults,
    approval: approvalPublic,
    packaged: app.isPackaged,
  }));
  handle("save-settings", (value, key) => {
    if (controller || listeningMode || requestRunning)
      throw Error("Stop the current task before changing settings.");
    const { validate } = require("./lib/settings");
    const next = validate(value),
      previous = settings.value;
    try {
      if (next.edgeBackground && !settings.value.edgeBackground)
        throw Error(
          "Enable background use from the visible Edge helper after a successful test.",
        );
      registerHotkeys(next);
      const saved = settings.save(next, key);
      app.setLoginItemSettings({
        openAtLogin: next.startWithWindows,
        path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath("exe"),
      });
      broadcast("buddy", next.buddy);
      notch?.setEnabled(next.notch);
      edge.send({ type: "hello", backgroundAllowed: next.edgeBackground });
      emit("edge-status", edge.status());
      if (!next.notch) {
        panel.show();
        panel.focus();
      }
      return saved;
    } catch (e) {
      registerHotkeys(previous);
      throw e;
    }
  });
  handle("test-key", async () => {
    await complete({
      key: settings.key,
      model: settings.value.model,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    return "Connected. Text request succeeded; screen mode also needs image and tool support.";
  });
  handle("voices", () => speech.voices());
  handle("speech-diagnostics", () => speech.diagnostics());
  handle("edge-status", () => edge.status());
  handle("edge-background", () => edge.background());
  handle("edge-setup", () => {
    if (controller || listeningMode || requestRunning)
      throw Error("Stop the current task before opening Edge setup.");
    return edge.openSetup();
  });
  handle("edge-close", async () => {
    if (controller || listeningMode || requestRunning)
      throw Error("Stop voice/task activity first.");
    await edge.dispose();
    return edge.status();
  });
  handle("voice-test", () => {
    if (controller || listeningMode)
      throw Error("Stop the current task before testing the microphone.");
    listen("test");
  });
  handle("windows-audio-settings", (name) => {
    const links = {
      microphone: "ms-settings:privacy-microphone",
      sound: "ms-settings:sound",
      speech: "ms-settings:speech",
    };
    if (!links[name]) throw Error("Unknown Windows settings page.");
    return shell.openExternal(links[name]);
  });
  handle("ask", (text, mode, taskId) => submit(text, mode, taskId));
  handle("tasks", () => tasks.snapshot());
  handle("cancel-task", cancelTask);
  handle("hold-start", (mode) => startHold(mode));
  handle("hold-end", (cancel) => {
    if (typeof cancel !== "boolean") throw Error("Invalid hold release.");
    releaseHold("pointer", cancel);
  });
  handle("listen", (mode) => {
    if (!["talk", "agent", "background"].includes(mode))
      throw Error("Invalid mode.");
    listen(mode);
  });
  handle("dictate", toggleDictation);
  handle("stop", stop);
  handle("hide", () => panel.hide());
  handle("clear", () => {
    if (requestRunning || backgroundJobs?.active.size)
      throw Error("Stop and wait for running tasks before clearing.");
    stop();
    history = [];
    messages = [];
    tasks.clear();
    visualResults = [];
    emit("cleared");
  });
  handle("approval", (id, allowed) => {
    if (!approval || approval.id !== id || typeof allowed !== "boolean")
      throw Error("Approval expired.");
    approval.resolve(allowed);
  });
  handle("delete-data", async () => {
    const result = await dialog.showMessageBox(
      notch?.enabled ? notch.window : panel,
      {
        type: "warning",
        title: "Delete local data?",
        message:
          "Close the dedicated Edge helper, delete its profile/permissions plus your encrypted key, settings and conversation, then quit?",
        buttons: ["Cancel", "Delete and quit"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      },
    );
    if (result.response !== 1) return false;
    stop();
    history = [];
    app.setLoginItemSettings({ openAtLogin: false });
    try {
      await edge.dispose({ deleteProfile: true });
    } catch {
      throw Error(
        "Could not remove the dedicated Edge profile. Close only its helper window and retry Delete local data. Your saved key/settings have not been deleted yet.",
      );
    }
    settings.delete();
    edgeClosing = true;
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    quitting = true;
    app.quit();
    return true;
  });
  handle("open-link", (name) => {
    const links = {
      key: "https://openrouter.ai/settings/keys",
      privacy: "https://openrouter.ai/settings/privacy",
      github: "https://github.com/victor123258/HeyClicky",
    };
    if (!links[name]) throw Error("Unknown link.");
    return shell.openExternal(links[name]);
  });
}
async function runDesktopSmoke() {
  try {
    const loaded = (win) =>
      win.webContents.isLoading()
        ? new Promise((resolve, reject) => {
            win.webContents.once("did-finish-load", resolve);
            win.webContents.once("did-fail-load", (_event, code, description) =>
              reject(Error(`${code}: ${description}`)),
            );
          })
        : Promise.resolve();
    await Promise.all([panel, notch.window, ...overlays].map(loaded));
    const pdf = await renderPDF(
      "<!doctype html><title>Smoke</title><p>PDF smoke test</p>",
      new AbortController().signal,
    );
    if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF")))
      throw Error("PDF generation failed.");
    const panelReady = await panel.webContents.executeJavaScript(`(async () => {
      const response = await window.clicky.call('get-settings');
      return response.ok && response.data.notch === true && Boolean(document.querySelector('#voice-test'));
    })()`);
    if (!panelReady)
      throw Error("Panel settings or microphone UI did not initialize.");
    await notch.window.webContents.executeJavaScript(
      "window.notch.expand(true)",
    );
    const expanded =
      await notch.window.webContents.executeJavaScript("window.notch.get()");
    if (
      !expanded.expanded ||
      notch.window.getBounds().height !==
        Math.min(800, screen.getPrimaryDisplay().workArea.height)
    )
      throw Error("Notch did not expand through its trusted bridge.");
    await notch.window.webContents.executeJavaScript(
      "window.notch.expand(false)",
    );
    if (notch.window.getBounds().height !== 40)
      throw Error("Notch did not shrink its native input area.");
    const integrated = await notch.window.webContents
      .executeJavaScript(`(async()=>{
      await window.notch.open('settings'); const s=await window.notch.call('get-settings');
      const host=document.createElement('div');window.visuals.render(host,{kind:'chart',title:'Smoke',caption:'Local',items:[{label:'A',value:1}]});
      return s.ok && Boolean(host.querySelector('canvas')) && Boolean(document.querySelector('[data-mode=background]')) && Boolean(document.querySelector('#settings-form')) && Boolean(document.querySelector('#composer'));
    })()`);
    if (!integrated) throw Error("Integrated notch chat and settings failed.");
    const isolated = await notch.window.webContents.executeJavaScript(
      'typeof window.clicky === "undefined" && typeof require === "undefined"',
    );
    if (!isolated) throw Error("Notch renderer privileges are not isolated.");
    console.log("DESKTOP_SMOKE_OK");
    quitting = true;
    app.quit();
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => panel && showPanel());
  app
    .whenReady()
    .then(() => {
      settings = new Settings(app.getPath("userData"), safeStorage);
      backgroundJobs = new BackgroundJobs({
        tasks,
        run: async (job, signal) => {
          const key = settings.key,
            model = settings.value.model;
          emit("message", {
            role: "user",
            text: job.prompt,
            mode: "background",
            jobId: job.id,
          });
          const chunks = [];
          const answer = await runAgent({
            text: job.prompt,
            mode: "background",
            history: job.history,
            signal,
            outputDirectory: /document|report|pdf|docx|write|create/i.test(
              job.prompt,
            )
              ? app.getPath("documents")
              : "",
            complete: (messages, tools, signal) =>
              complete({ key, model, messages, tools, signal }),
            execute: (name, args, signal) =>
              safeTool(name, args, signal, job.id),
            approve: async (action, signal) => {
              tasks.update(job.id, { status: "approval" });
              try {
                return await approve({ ...action, jobId: job.id }, signal);
              } finally {
                if (!signal.aborted)
                  tasks.update(job.id, { status: "running" });
              }
            },
            onMessage: (text) => {
              chunks.push(text);
              emit("message", { role: "assistant", text, jobId: job.id });
            },
            onTool: (data) => {
              tasks.step(job.id, data);
              emit("tool", { ...data, jobId: job.id });
            },
          });
          signal.throwIfAborted();
          if (answer && chunks.at(-1) !== answer)
            emit("message", { role: "assistant", text: answer, jobId: job.id });
          job.history = [
            ...job.history,
            { role: "user", content: job.prompt },
            {
              role: "assistant",
              content: [
                ...chunks,
                ...(chunks.at(-1) !== answer ? [answer] : []),
              ]
                .join("\n")
                .slice(0, 12000),
            },
          ].slice(-12);
          return answer;
        },
      });
      edge = new EdgeVoice({
        userData: app.getPath("userData"),
        native,
        getBackground: () => settings.value.edgeBackground,
        getWindowMode: () => settings.value.edgeWindowMode,
        onBackground: (allowed) => {
          settings.save({ ...settings.value, edgeBackground: allowed });
          emit("edge-status", edge.status());
        },
        onStatus: (data) => emit("edge-status", data),
      });
      speech = new Voice({
        edge,
        getSettings: () => settings.value,
        notify: (text) => {
          if (listeningMode) {
            if (heldTurn) heldTurn.ready = false;
            setState("starting");
          }
          emit("voice-notice", text);
        },
      });
      keys = new Keys(
        native,
        (name) => {
          if (heldTurn?.mode === name) releaseHold("keyboard");
        },
        (e) => {
          if (heldTurn?.source === "keyboard") releaseHold("keyboard", true);
          emit("error", e.message);
        },
      );
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      panel = new BrowserWindow({
        show: false,
        width: 1100,
        height: 790,
        minWidth: 850,
        minHeight: 650,
        title: "HeyClicky Community",
        backgroundColor: "#f6f7fb",
        autoHideMenuBar: true,
        icon: path.join(__dirname, "../../assets/icon.png"),
        webPreferences: {
          preload: path.join(__dirname, "../preload/panel.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      panel.webContents.on("will-navigate", (e) => e.preventDefault());
      panel.on("close", (e) => {
        if (!quitting) {
          e.preventDefault();
          panel.hide();
        }
      });
      installIPC();
      panel.loadFile(path.join(__dirname, "../renderer/index.html"));
      createOverlays();
      notch = new Notch({
        BrowserWindow,
        screen,
        enabled: settings.value.notch,
        state,
      });
      notch.window.webContents.on("did-finish-load", () => {
        if (settings.value.notch)
          notch.open(settings.key ? "home" : "settings", false);
        else panel.show();
      });
      const displayChanged = () => {
        createOverlays();
        notch?.render();
      };
      screen.on("display-added", displayChanged);
      screen.on("display-removed", displayChanged);
      screen.on("display-metrics-changed", displayChanged);
      tray = new Tray(
        nativeImage
          .createFromPath(path.join(__dirname, "../../assets/icon.png"))
          .resize({ width: 32, height: 32 }),
      );
      tray.setToolTip("HeyClicky Community — your desktop buddy");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open HeyClicky", click: () => showPanel("home") },
          { label: "Talk", click: () => listen("talk") },
          {
            label: "Expand notch",
            click: () => {
              notch.setEnabled(true);
              notch.expand(true);
            },
          },
          { label: "Dictate / stop", click: toggleDictation },
          { label: "Stop everything", click: stop },
          { type: "separator" },
          {
            label: "Quit",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on("double-click", () => showPanel("home"));
      panel.webContents.on("did-finish-load", () => {
        if (!settings.key) emit("settings-open");
        if (process.platform !== "win32")
          emit(
            "error",
            "Desktop automation and voice require Windows. This platform is for UI development only.",
          );
        if (!smokeMode) {
          try {
            registerHotkeys(settings.value);
          } catch (e) {
            error(e);
          }
        }
      });
      setInterval(
        () => broadcast("cursor", screen.getCursorScreenPoint()),
        45,
      ).unref();
      if (smokeMode) runDesktopSmoke();
    })
    .catch((e) => {
      dialog.showErrorBox("HeyClicky could not start", e.message);
      app.quit();
    });
  app.on("before-quit", (event) => {
    quitting = true;
    keys?.stop();
    stop();
    globalShortcut.unregisterAll();
    if (edge && !edgeClosing) {
      event.preventDefault();
      edgeClosing = true;
      edge
        .dispose()
        .catch(() => {})
        .finally(() => app.quit());
    }
  });
  app.on("window-all-closed", () => {});
}
