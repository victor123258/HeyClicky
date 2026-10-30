/* The notch is the workspace. All provider data is rendered as text, never HTML. */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const api =
  window.notch && typeof window.notch.get === "function"
    ? window.notch
    : window.notchDemo;
let layout = { mode: "collapsed", route: "home", state: "idle" },
  config,
  route = "home",
  mode = "talk",
  selectedJob = null;
let visualAnswers = [],
  renderedVisual = null;
let jobs = [],
  messages = [],
  approvalId,
  holdOwner = null,
  collapseTimer,
  saving = false;
const terminal = ["completed", "failed", "cancelled"];
const labels = {
  idle: "Here when you need me",
  starting: "Opening microphone…",
  listening: "Listening — go ahead",
  transcribing: "Making sense of that…",
  thinking: "Thinking with you…",
  working: "Lending a hand…",
  approval: "Your permission, first",
  speaking: "Talking it through…",
  dictating: "Typing your speech…",
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notify(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
}
async function call(name, ...args) {
  const result = await api.call(name, ...args);
  if (!result.ok) throw Error(result.error);
  return result.data;
}
function task(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notify(e.message);
    }
  };
}
function setMode(value) {
  mode = value;
  $("#mode-hint").textContent =
    value === "background"
      ? "Background · 2 concurrent research/writing workers. No screen, mouse or shell. Approvals still required; uses your API credits."
      : value === "agent"
        ? "Agent · desktop tools with your approval. Verify each action."
        : "Talk · answers, clock & approved web reads. Switch to Agent for desktop actions.";
  $$("[data-mode]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.mode === value),
  );
  $("#prompt").placeholder =
    value === "agent"
      ? "What would you like me to take care of?"
      : "What’s on your mind?";
}
function navigate(value) {
  const changed = route !== value;
  route = value;
  if (changed) $("main.surface").scrollTop = 0;
  $$('[id^="route-"]').forEach((p) => (p.hidden = p.id !== `route-${value}`));
  $$("[data-route]").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === value),
  );
  $("#composer-area").hidden = value === "settings";
  if (value === "chat") renderThread();
}
async function open(value) {
  navigate(value);
  await api.open(value);
}
function renderLayout(data) {
  layout = data;
  const mode = data.mode || (data.expanded ? "expanded" : "collapsed");
  $("#notch").dataset.layout = mode;
  $("#workspace").hidden = mode !== "expanded";
  $("#peek").hidden = mode !== "peek";
  $("#expand").setAttribute("aria-expanded", String(mode !== "collapsed"));
  $("#status").textContent = labels[data.state] || data.state;
  $("#notch").classList.toggle("busy", data.state !== "idle");
  $("#preview").textContent =
    data.preview || "A little help, right where you are.";
  if (data.kind === "error") notify(data.preview);
  $("#quick-talk").replaceChildren(
    icon(data.state === "idle" ? "mic" : "stop"),
  );
  $("#quick-talk").setAttribute(
    "aria-label",
    data.state === "idle" ? "Tap to talk" : "Stop current task",
  );
  $("#stop").hidden =
    data.state === "idle" && !jobs.some((j) => !terminal.includes(j.status));
  $$(".peek-stop").forEach((b) => (b.hidden = $("#stop").hidden));
  $("#voice-test").disabled = data.state !== "idle";
  $("#hold-talk").disabled = !["idle", "starting", "listening"].includes(
    data.state,
  );
  $("#hold-talk").classList.toggle("recording", data.state === "listening");
  $("#hold-talk>span:first-of-type").textContent =
    data.state === "listening"
      ? "Release to send"
      : data.state === "starting"
        ? "Wait for Listening…"
        : "Hold to talk";
  if (data.state === "idle") setLevel(0);
  if (data.route && data.route !== route && mode === "expanded")
    navigate(data.route);
}
function setLevel(value) {
  $$(".wave i,.hold-wave i").forEach(
    (bar, i) =>
      (bar.style.height = `${Math.max(3, Math.min(19, (value / 100) * 19 * (0.45 + Math.sin(i + 1) * 0.35)))}px`),
  );
}
function jobButton(job, compact = false) {
  const button = el("button", "job-card");
  button.type = "button";
  button.dataset.job = job.id;
  const mark = el("span", "job-mark");
  mark.append(icon(job.status === "completed" ? "check" : "spark"));
  const info = el("div", "job-info");
  info.append(
    el(
      "div",
      "job-title",
      (job.kind === "background" ? "Background · " : "") + job.title,
    ),
    el(
      "small",
      "",
      compact
        ? "Open task"
        : job.steps?.length
          ? `${job.steps.length} activity updates · session only`
          : job.kind === "background"
            ? "Off-desktop research/writing · approval-gated tools"
            : "Queued tasks inspect the selected display when they start.",
    ),
  );
  button.append(
    mark,
    info,
    el(
      "span",
      `job-badge ${job.status}`,
      {
        queued: "Queued",
        running: "Working",
        approval: "Needs you",
        completed: "Done",
        failed: "Needs attention",
        cancelled: "Stopped",
      }[job.status] || job.status,
    ),
  );
  button.onclick = task(async () => {
    selectedJob = job.id;
    setMode(job.kind === "background" ? "background" : "agent");
    await open("chat");
  });
  return button;
}
function renderJobs() {
  $("#task-count").textContent = jobs.length;
  $("#peek-jobs").replaceChildren(
    ...jobs.slice(0, 2).map((j) => jobButton(j, true)),
  );
  if (jobs.length) $("#jobs").replaceChildren(...jobs.map((j) => jobButton(j)));
  else {
    const empty = el("div", "empty-jobs"),
      mark = el("span", "empty-orbit"),
      text = el("div");
    mark.append(icon("check"));
    text.append(
      el("strong", "", "A little room to breathe."),
      el("p", "", "Your tasks will land here. Start one below."),
    );
    empty.append(mark, text);
    $("#jobs").replaceChildren(empty);
  }
  if (route === "chat") renderThread();
}
function renderVisual(force = false) {
  const list = visualAnswers.filter((v) => v.jobId === (selectedJob || null)),
    select = $("#visual-select"),
    current = select.value;
  $("#visual-panel").hidden = !list.length;
  if (!list.length) {
    window.visuals?.clear();
    renderedVisual = null;
    return;
  }
  select.replaceChildren(
    ...list.map((v) => {
      const option = el("option", "", v.spec.title);
      option.value = v.id;
      return option;
    }),
  );
  const visual = list.find((v) => v.id === current) || list.at(-1);
  select.value = visual.id;
  if (renderedVisual === visual.id && !force) return;
  renderedVisual = visual.id;
  $("#visual-title").textContent = visual.spec.title;
  $("#visual-caption").textContent = visual.spec.caption;
  $("#visual-help").hidden = visual.spec.kind !== "scene3d";
  try {
    if (!window.visuals)
      throw Error("Visual renderer not built. Run npm run build:visuals.");
    window.visuals.render($("#visual-canvas"), visual.spec);
  } catch (error) {
    $("#visual-canvas").textContent =
      "Unable to render visual: " +
      error.message +
      ". Use a 2D answer if WebGL is unavailable.";
  }
}
$("#visual-select").onchange = () => renderVisual(true);
$("#visual-desktop").onclick = task(() =>
  call("canvas-present", $("#visual-select").value),
);
function renderCanvasStatus(data) {
  for (const group of $$("[data-canvas-controls]")) {
    group.hidden = !data.id;
    group.querySelector("[data-canvas-title]").textContent = data.title;
    group.querySelector("[data-canvas-status]").textContent =
      data.error ||
      `${data.visible ? (data.interactive ? "Interacting · Escape returns clicks" : "Pass-through · Windows receives clicks") : "Temporarily hidden"} · ${data.audio === "off" ? "audio off" : data.audio}`;
    for (const button of group.querySelectorAll("[data-canvas]")) {
      const action = button.dataset.canvas;
      button.hidden = action === "stop-audio" && data.audio === "off";
      button.disabled =
        (action === "interact" && data.interactive) ||
        (action === "passthrough" && !data.interactive);
    }
  }
}
$$("[data-canvas]").forEach(
  (button) =>
    (button.onclick = task(() =>
      call("canvas-command", button.dataset.canvas),
    )),
);
$("#visual-reset").onclick = () => renderVisual(true);
function renderThread() {
  renderVisual();
  const job = jobs.find((j) => j.id === selectedJob),
    list = selectedJob
      ? messages.filter((m) => m.jobId === selectedJob)
      : messages;
  $("#thread-title").textContent = job
    ? job.title
    : "A conversation with Clicky";
  $("#thread-hint").textContent = job
    ? `${job.kind === "background" ? "Background worker" : "Desktop agent"} · ${job.status} · follow up after it finishes`
    : "Your screen is context. You’re in control.";
  const thread = $("#thread");
  thread.replaceChildren();
  if (!list.length)
    thread.append(
      el(
        "div",
        "chat-empty",
        "A question, an idea, or a little help getting unstuck. Start wherever you are.",
      ),
    );
  for (const message of list) {
    const row = el("div", `message ${message.role}`),
      avatar = el("span", "message-avatar"),
      content = el("div", "message-content"),
      meta = el(
        "div",
        "message-meta",
        message.role === "user" ? "You" : "Clicky",
      );
    if (message.role === "user") avatar.textContent = "Y";
    else avatar.append(icon("spark"));
    meta.append(
      el(
        "small",
        "",
        message.mode === "agent" || message.jobId ? "AGENT" : "TALK",
      ),
    );
    content.append(meta, el("div", "message-text", message.text));
    row.append(avatar, content);
    thread.append(row);
  }
  const steps = $("#task-steps");
  steps.hidden = !job;
  steps.replaceChildren();
  if (job) {
    const heading = el("div", "task-heading");
    heading.append(el("span", "eyebrow", "ACTIVITY, NOT GUESSWORK"));
    if (!terminal.includes(job.status)) {
      const stop = el("button", "", "Stop this task");
      stop.onclick = task(() => call("cancel-task", job.id));
      heading.append(stop);
    }
    steps.append(
      heading,
      ...job.steps.map((s) =>
        el(
          "div",
          `step-row ${s.status}`,
          `${s.name.replaceAll("_", " ")} · ${s.status}`,
        ),
      ),
    );
    if (
      job.result &&
      !list.some((m) => m.role === "assistant" && m.text === job.result)
    )
      steps.append(el("p", "message-text", job.result));
  }
}
function fillSettings(data) {
  config = data;
  if (data.canvasStatus) renderCanvasStatus(data.canvasStatus);
  $("#edge-window-mode").value = data.edgeWindowMode || "minimized";
  $("#voice-provider").value = data.voiceProvider || "windows";
  $("#edge-language").value = data.edgeLanguage || "en-US";
  $("#edge-fallback").checked = data.edgeFallback !== false;
  $("#edge-options").hidden = $("#voice-provider").value !== "edge";
  $("#input-provider").textContent =
    data.voiceProvider === "edge"
      ? "Preferred input: Edge (online)"
      : "Input: Windows (local)";
  if (data.edgeStatus) renderEdgeStatus(data.edgeStatus);
  $("#connect-card").hidden = data.hasKey;
  $("#key-status").textContent = data.hasKey ? "Key saved" : "Not connected";
  $("#model-label").textContent = data.model;
  $("#api-key").value = "";
  $("#api-key").placeholder = data.hasKey
    ? "•••••••• · saved on this PC"
    : "sk-or-v1-…";
  $("#model").value = data.model;
  for (const [id, key] of Object.entries({
    "screen-setting": "screenContext",
    "ask-before": "askBeforeActions",
    speak: "speak",
    captions: "captions",
    buddy: "buddy",
    "notch-enabled": "notch",
    "desktop-visuals": "desktopVisuals",
    "auto-explain-visuals": "autoExplainVisuals",
    "start-windows": "startWithWindows",
  }))
    $(`#${id}`).checked = data[key] !== false;
  $("#start-windows").checked = Boolean(data.startWithWindows);
  $("#rate").value = data.rate;
  $("#rate-value").textContent = data.rate;
  for (const [id, value] of [
    ["speech-language", data.speechLanguage],
    ["voice-select", data.voice],
  ]) {
    const select = $(`#${id}`);
    if (value && ![...select.options].some((o) => o.value === value)) {
      const o = el("option", "", value);
      o.value = value;
      select.append(o);
    }
    select.value = value || "";
  }
  $("#safety-warning").hidden = data.askBeforeActions;
  $("#screen-toggle").setAttribute("aria-pressed", String(data.screenContext));
  $("#screen-toggle span").textContent =
    `Screen context ${data.screenContext ? "on" : "off"}`;
  $("#context-hint").textContent = data.screenContext
    ? "Captured when you send"
    : "Text only · no screenshots";
  $("#talk-shortcut").textContent = data.hotkeys.talk
    .replace("CommandOrControl", "Ctrl")
    .replaceAll("+", " ");
  $("#hotkeys").replaceChildren();
  for (const [name, title] of Object.entries({
    talk: "Hold to talk",
    agent: "Hold for an agent",
    dictate: "Toggle dictation",
    panel: "Open / close notch",
    stop: "Stop everything",
  })) {
    const field = el("div"),
      label = el("label", "", title),
      input = el("input");
    input.id = `hotkey-${name}`;
    input.value = data.hotkeys[name];
    input.maxLength = 80;
    label.htmlFor = input.id;
    field.append(label, input);
    $("#hotkeys").append(field);
  }
}
function showApproval(data) {
  approvalId = data?.id;
  $("#approval-card").hidden = !data;
  if (data) {
    selectedJob = data.jobId || null;
    navigate("chat");
    $("#approval-name").textContent = data.name.replaceAll("_", " ");
    $("#approval-args").textContent = JSON.stringify(data.args, null, 2);
    $("#deny").focus();
  }
}
function renderEdgeStatus(data) {
  if (config) config.edgeBackground = Boolean(data.backgroundAllowed);
  $("#edge-status").textContent =
    (data.connected ? "Connected. " : "Not connected. ") +
    (data.backgroundAllowed
      ? "Background launches enabled. "
      : "Automatic background launches are off. ") +
    (data.detail || "");
  $("#edge-disable").hidden = !data.backgroundAllowed;
}
function appEvent({ type, data }) {
  if (type === "visual") {
    visualAnswers.push(data);
    visualAnswers = visualAnswers.slice(-8);
    if (route === "chat") renderVisual();
  }
  if (type === "tool" && (!data.jobId || data.jobId === selectedJob)) {
    const labels = {
      get_time: "Device clock",
      fetch_url: "Read web page",
      screenshot: "Capture screen",
      draw: "Draw guide",
    };
    $("#tool-status").hidden = false;
    $("#tool-status").dataset.status = data.status;
    $("#tool-status").textContent =
      (labels[data.name] || data.name.replaceAll("_", " ")) +
      " · " +
      data.status;
  }
  if (type === "edge-status") renderEdgeStatus(data);
  if (type === "voice-notice") {
    notify(data);
    $("#voice-transcript").hidden = false;
    $("#voice-transcript").textContent = data;
    $("#mic-result").textContent = data;
  }
  if (type === "state") renderLayout({ ...layout, state: data });
  if (type === "tasks") {
    jobs = data;
    renderJobs();
    $("#stop").hidden =
      layout.state === "idle" &&
      !jobs.some((j) => !terminal.includes(j.status));
    $$(".peek-stop").forEach((b) => (b.hidden = $("#stop").hidden));
  }
  if (type === "message") {
    if (data.role === "user") $("#tool-status").hidden = true;
    messages.push(data);
    messages = messages.slice(-200);
    $("#chat-count").textContent = messages.length;
    if (route === "chat") renderThread();
  }
  if (type === "canvas-status") renderCanvasStatus(data);
  if (type === "error") {
    notify(data);
    $("#mic-result").textContent = data;
  }
  if (type === "settings-open") task(() => open("settings"))();
  if (type === "approval") showApproval(data);
  if (type === "voice-ready") {
    $("#input-provider").textContent =
      data.provider === "edge"
        ? "Listening with Edge (online)"
        : "Listening with Windows (local)";
    const text = `Listening${data.provider ? " · " + data.provider : ""}${data.language ? " · " + data.language : ""}. ${data.held ? "Release to send." : "Speak, then pause to finish."}`;
    $("#voice-transcript").hidden = false;
    $("#voice-transcript").textContent = text;
    $("#mic-result").textContent = text;
  }
  if (type === "voice-partial" || type === "voice-heard") {
    $("#voice-transcript").hidden = false;
    $("#voice-transcript").textContent = data;
    $("#mic-result").textContent = "Heard: " + data;
  }
  if (type === "voice-level") setLevel(data);
  if (type === "voice-cancelled") {
    $("#voice-transcript").hidden = false;
    $("#voice-transcript").textContent = data;
  }
  if (type === "voice-test-result")
    $("#mic-result").textContent = "✓ Microphone test complete. Heard: " + data;
  if (type === "cleared") {
    messages = [];
    jobs = [];
    visualAnswers = [];
    window.visuals?.clear();
    renderedVisual = null;
    $("#visual-panel").hidden = true;
    selectedJob = null;
    $("#chat-count").textContent = "0";
    $("#voice-transcript").hidden = true;
    renderJobs();
    renderThread();
  }
}
$$("[data-route]").forEach(
  (b) => (b.onclick = task(() => open(b.dataset.route))),
);
$("#expand").onclick = task(() => open("home"));
$("#collapse").onclick = task(() => api.expand(false));
$("#open-home").onclick = task(() => open("home"));
$("#peek-settings").onclick = task(() => open("settings"));
$("#connect-settings").onclick = task(() => open("settings"));
$("#notch").onmouseenter = () => {
  clearTimeout(collapseTimer);
  if (layout.mode === "collapsed") task(() => api.peek())();
};
$("#notch").onmouseleave = () => {
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (layout.mode === "peek" && layout.state === "idle")
      task(() => api.expand(false))();
  }, 550);
};
$("#notice").onclick = () => ($("#notice").hidden = true);
$("#new-chat").onclick = $("#new-task").onclick = task(async () => {
  selectedJob = null;
  setMode("talk");
  $("#prompt").value = "";
  await open("chat");
  $("#prompt").focus();
});
$("#all-chat").onclick = () => {
  selectedJob = null;
  setMode("talk");
  renderThread();
};
$$("[data-starter]").forEach(
  (b) =>
    (b.onclick = task(async () => {
      selectedJob = null;
      setMode(b.dataset.starter === "agent" ? "agent" : "talk");
      $("#prompt").value =
        b.dataset.starter === "guide"
          ? "Walk me through the next step in the app on my screen."
          : "";
      await open("chat");
      $("#prompt").focus();
    })),
);
$$("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      selectedJob = null;
      setMode(b.dataset.mode);
      renderThread();
    }),
);
$("#composer").onsubmit = task(async (e) => {
  e.preventDefault();
  const text = $("#prompt").value.trim();
  if (!text) return;
  const id = await call("ask", text, mode, selectedJob || undefined);
  $("#prompt").value = "";
  if (id) {
    selectedJob = id;
    setMode(
      jobs.find((j) => j.id === id)?.kind === "background"
        ? "background"
        : "agent",
    );
  }
  await open("chat");
  renderThread();
});
$("#prompt").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
};
$("#quick-talk").onclick = task(() =>
  call(layout.state === "idle" ? "listen" : "stop", mode),
);
$("#stop").onclick = $("#settings-stop").onclick = task(() => call("stop"));
$$("[data-action=stop]").forEach((b) => (b.onclick = task(() => call("stop"))));
$("#dictate").onclick = task(() => call("dictate"));
const holdButton = $("#hold-talk");
function beginHold(owner) {
  if (holdOwner !== null) return;
  holdOwner = owner;
  task(() => call("hold-start", mode))();
}
function endHold(owner, cancel = false) {
  if (holdOwner !== owner) return;
  holdOwner = null;
  task(() => call("hold-end", cancel))();
}
holdButton.onpointerdown = (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  holdButton.setPointerCapture?.(e.pointerId);
  beginHold(e.pointerId);
};
holdButton.onpointerup = (e) => endHold(e.pointerId);
holdButton.onpointercancel = (e) => endHold(e.pointerId, true);
holdButton.onlostpointercapture = (e) => endHold(e.pointerId, true);
holdButton.onkeydown = (e) => {
  if ([" ", "Enter"].includes(e.key) && !e.repeat) {
    e.preventDefault();
    beginHold("key");
  }
};
holdButton.onkeyup = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    endHold("key");
  }
};
window.addEventListener("blur", () => {
  if (holdOwner !== null) endHold(holdOwner, true);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (holdOwner !== null) endHold(holdOwner, true);
    task(() => call("stop"))();
  }
});
$("#clear-chat").onclick = task(() => call("clear"));
$("#allow").onclick = task(() => call("approval", approvalId, true));
$("#deny").onclick = task(() => call("approval", approvalId, false));
$("#get-key").onclick = task(() => call("open-link", "key"));
$("#privacy-link").onclick = task(() => call("open-link", "privacy"));
$("#github-link").onclick = task(() => call("open-link", "github"));
$("#delete-data").onclick = task(() => call("delete-data"));
$("#rate").oninput = () => ($("#rate-value").textContent = $("#rate").value);
$("#ask-before").onchange = () =>
  ($("#safety-warning").hidden = $("#ask-before").checked);
$("#test-key").onclick = task(async () => {
  try {
    $("#connection-result").textContent = "Connecting…";
    $("#test-key").disabled = true;
    $("#connection-result").textContent = await call("test-key");
  } finally {
    $("#test-key").disabled = false;
  }
});
$("#voice-provider").onchange = () =>
  ($("#edge-options").hidden = $("#voice-provider").value !== "edge");
$("#edge-background").onclick = task(async () =>
  renderEdgeStatus(await call("edge-background")),
);
$("#edge-setup").onclick = task(async () =>
  renderEdgeStatus(await call("edge-setup")),
);
$("#edge-close").onclick = task(async () =>
  renderEdgeStatus(await call("edge-close")),
);
$("#edge-disable").onclick = task(async () => {
  const saved = await call("save-settings", {
    ...config,
    edgeBackground: false,
  });
  config.edgeBackground = saved.edgeBackground;
  renderEdgeStatus(await call("edge-status"));
});
$("#voice-test").onclick = task(() => call("voice-test"));
$$("[data-audio]").forEach(
  (b) =>
    (b.onclick = task(() => call("windows-audio-settings", b.dataset.audio))),
);
$("#find-languages").onclick = task(async () => {
  const report = await call("speech-diagnostics");
  const select = $("#speech-language");
  select.replaceChildren();
  const auto = el("option", "", "Automatic · installed language");
  auto.value = "";
  select.append(auto);
  for (const item of report.languages) {
    const option = el("option", "", `${item.name} (${item.id})`);
    option.value = item.id;
    select.append(option);
  }
  select.value = config.speechLanguage || "";
  $("#mic-result").textContent = report.languages.length
    ? "Choose an installed language, save, then test the microphone."
    : "No recognition engine installed. Add a Windows Speech language pack; speaking voices alone are not sufficient.";
});
$("#find-voices").onclick = task(async () => {
  const voices = await call("voices");
  const select = $("#voice-select");
  select.replaceChildren();
  for (const name of ["", ...voices]) {
    const option = el("option", "", name || "Windows default");
    option.value = name;
    select.append(option);
  }
  select.value = config.voice;
});
$("#settings-form").onsubmit = task(async (e) => {
  e.preventDefault();
  if (saving) return;
  saving = true;
  try {
    const next = {
      ...config,
      model: $("#model").value.trim(),
      voice: $("#voice-select").value,
      speechLanguage: $("#speech-language").value,
      voiceProvider: $("#voice-provider").value,
      edgeWindowMode: $("#edge-window-mode").value,
      edgeLanguage: $("#edge-language").value.trim(),
      edgeFallback: $("#edge-fallback").checked,
      rate: Number($("#rate").value),
      hotkeys: {},
    };
    for (const [id, key] of Object.entries({
      "screen-setting": "screenContext",
      "ask-before": "askBeforeActions",
      speak: "speak",
      captions: "captions",
      buddy: "buddy",
      "notch-enabled": "notch",
      "desktop-visuals": "desktopVisuals",
      "auto-explain-visuals": "autoExplainVisuals",
      "start-windows": "startWithWindows",
    }))
      next[key] = $(`#${id}`).checked;
    for (const name of ["talk", "agent", "dictate", "panel", "stop"])
      next.hotkeys[name] = $(`#hotkey-${name}`).value.trim();
    const saved = await call(
      "save-settings",
      next,
      $("#api-key").value.trim() || undefined,
    );
    fillSettings(saved);
    $("#save-result").textContent = "✓ Saved on this PC";
  } finally {
    saving = false;
  }
});
$("#screen-toggle").onclick = task(async () => {
  const saved = await call("save-settings", {
    ...config,
    screenContext: !config.screenContext,
  });
  fillSettings(saved);
});
api.onEvent(renderLayout);
api.onAppEvent(appEvent);
task(async () => {
  const data = await call("get-settings");
  fillSettings(data);
  jobs = data.tasks || [];
  visualAnswers = data.visuals || [];
  messages = data.messages || [];
  $("#chat-count").textContent = messages.length;
  renderJobs();
  renderThread();
  renderLayout(await api.get());
  if (data.approval) showApproval(data.approval);
  if (data.loadError) notify(data.loadError);
})();
