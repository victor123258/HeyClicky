// Browser design preview only: no real keys, microphones, screens, files, or AI.
if (!(window.notch && typeof window.notch.get === "function")) {
  document.body.classList.add("browser-preview");
  document
    .querySelectorAll(".browser-heading,.browser-controls")
    .forEach((el) => (el.hidden = false));
  let onLayout = () => {},
    onApp = () => {},
    layout = { state: "idle", mode: "expanded", route: "home" },
    timer,
    held = false;
  let jobs = [],
    messages = [];
  let config = {
    model: "openai/gpt-4.1-mini",
    voice: "",
    speechLanguage: "",
    voiceProvider: "windows",
    edgeLanguage: "en-US",
    edgeFallback: true,
    edgeBackground: false,
    edgeWindowMode: "hidden",
    rate: 0,
    notch: true,
    desktopVisuals: true,
    autoExplainVisuals: true,
    captions: true,
    speak: true,
    buddy: true,
    screenContext: true,
    askBeforeActions: true,
    startWithWindows: false,
    hasKey: false,
    hotkeys: {
      talk: "CommandOrControl+Shift+Space",
      agent: "CommandOrControl+Shift+A",
      dictate: "CommandOrControl+Shift+D",
      panel: "CommandOrControl+Shift+H",
      stop: "CommandOrControl+Shift+X",
    },
  };
  const event = (type, data) => onApp({ type, data });
  const setState = (state) => {
    layout = { ...layout, state };
    onLayout(layout);
    event("state", state);
  };
  window.notchDemo = {
    get: async () => layout,
    onEvent: (fn) => (onLayout = fn),
    onAppEvent: (fn) => (onApp = fn),
    open: async (route) => {
      layout = { ...layout, mode: "expanded", route };
      onLayout(layout);
    },
    peek: async () => {
      if (layout.mode === "collapsed") {
        layout = { ...layout, mode: "peek" };
        onLayout(layout);
      }
    },
    expand: async (value) => {
      layout = { ...layout, mode: value ? "expanded" : "collapsed" };
      onLayout(layout);
    },
    call: async (name, ...args) => {
      if (name === "get-settings")
        return {
          ok: true,
          data: { ...config, messages, tasks: jobs, state: layout.state },
        };
      if (name === "save-settings" || name === "patch-settings") {
        if (args[1])
          return {
            ok: false,
            error:
              "Do not enter a real key in this browser preview. Use the Windows app.",
          };
        config = { ...config, ...args[0] };
        return { ok: true, data: config };
      }
      if (
        ["edge-setup", "edge-close", "edge-status", "edge-background"].includes(
          name,
        )
      ) {
        const data = {
          connected: false,
          backgroundAllowed: false,
          detail:
            "Design preview only. The Windows app opens real Edge; this preview does not access a microphone.",
        };
        event("edge-status", data);
        return { ok: true, data };
      }
      if (name === "canvas-present" || name === "canvas-command")
        return {
          ok: false,
          error:
            "Desktop canvas controls require the Windows app. Open /canvas.html for the standalone visual preview.",
        };
      if (name === "ask") {
        const id = ["agent", "background"].includes(args[1])
          ? `demo-${Date.now()}`
          : null;
        const message = {
          id: String(Date.now()),
          role: "user",
          text: args[0],
          jobId: id,
          mode: args[1],
        };
        messages.push(message);
        event("message", message);
        if (id) {
          jobs.unshift({
            id,
            title: args[0],
            kind: args[1] === "background" ? "background" : "desktop",
            status: "running",
            steps: [],
            result: "",
          });
          event("tasks", jobs);
        }
        setState("thinking");
        timer = setTimeout(() => {
          const reply = {
            id: String(Date.now()),
            role: "assistant",
            text: "This is a UI preview, not a live AI response. In the Windows app, your selected model can help with your screen, draw a guide, or work through a task with your approval.",
            jobId: id,
          };
          messages.push(reply);
          event("message", reply);
          if (id) {
            jobs[0].status = "completed";
            jobs[0].result = reply.text;
            event("tasks", jobs);
          }
          setState("idle");
        }, 500);
        return { ok: true, data: id };
      }
      if (name === "hold-start") {
        held = true;
        setState("listening");
        event("voice-ready", { held: true, language: "UI preview" });
        return { ok: true };
      }
      if (name === "hold-end") {
        if (held) {
          held = false;
          setState("idle");
          event("voice-cancelled", "UI preview only. No audio was recorded.");
        }
        return { ok: true };
      }
      if (name === "stop") {
        clearTimeout(timer);
        held = false;
        setState("idle");
        return { ok: true };
      }
      if (name === "clear") {
        clearTimeout(timer);
        messages = [];
        jobs = [];
        setState("idle");
        event("cleared");
        return { ok: true };
      }
      if (name === "cancel-task") {
        const job = jobs.find((j) => j.id === args[0]);
        if (job) job.status = "cancelled";
        event("tasks", jobs);
        return { ok: true };
      }
      if (name === "tasks") return { ok: true, data: jobs };
      if (name === "open-link") {
        const links = {
          key: "https://openrouter.ai/settings/keys",
          privacy: "https://openrouter.ai/settings/privacy",
          github: "https://github.com/victor123258/HeyClicky",
        };
        if (links[args[0]]) window.open(links[args[0]], "_blank", "noopener");
        return { ok: true };
      }
      return {
        ok: false,
        error:
          "Available in the Windows desktop app. This preview has no microphone, desktop, or AI access.",
      };
    },
  };
  document.querySelectorAll("[data-preview]").forEach(
    (button) =>
      (button.onclick = () => {
        layout = { ...layout, mode: button.dataset.preview };
        onLayout(layout);
      }),
  );
  document.querySelector("#demo-tasks").onclick = () => {
    jobs = [
      {
        id: "sample-one",
        title: "Explain a spreadsheet formula",
        status: "completed",
        steps: [],
        result: "Sample task card — no work was performed.",
      },
      {
        id: "sample-two",
        title: "Organize project notes",
        status: "queued",
        steps: [],
        result: "Sample task card — no work was performed.",
      },
    ];
    event("tasks", jobs);
    event(
      "error",
      "Sample cards are for design preview only. No tasks are running.",
    );
  };
  function previewVisual(spec) {
    layout = { ...layout, mode: "expanded", route: "chat" };
    onLayout(layout);
    event("visual", { id: "preview-" + Date.now(), jobId: null, spec });
    event("error", "Visual preview only — no AI request or desktop action.");
  }
  document.querySelector("#demo-visual").onclick = () =>
    previewVisual({
      kind: "scene3d",
      title: "Interactive 3D — shapes in space",
      caption:
        "Drag to rotate and zoom. This is a local illustrative scene, not generated evidence or a physics simulation.",
      objects: [
        {
          type: "box",
          label: "Cube",
          color: "#baa4ef",
          x: -2,
          y: 1,
          z: 0,
          size: 2,
        },
        {
          type: "sphere",
          label: "Sphere",
          color: "#a3dbb8",
          x: 2,
          y: 1,
          z: 0,
          size: 2,
        },
        {
          type: "cone",
          label: "Cone",
          color: "#f0c28b",
          x: 0,
          y: 1,
          z: -3,
          size: 2,
        },
      ],
    });
  document.querySelector("#demo-chart").onclick = () =>
    previewVisual({
      kind: "chart",
      title: "Illustrative 2D chart",
      caption: "Sample values only. Real research charts must cite sources.",
      items: [
        { label: "Research", value: 8 },
        { label: "Write", value: 6 },
        { label: "Review", value: 4 },
      ],
    });
}
