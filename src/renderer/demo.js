// Browser-only design preview. No desktop automation, speech or AI is simulated as real.
if (!window.clicky) {
  let listener = () => {},
    timer;
  const defaults = {
    model: "openai/gpt-4.1-mini",
    voice: "",
    speechLanguage: "",
    notch: true,
    rate: 0,
    askBeforeActions: true,
    buddy: true,
    screenContext: true,
    speak: true,
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
  let config = { ...defaults };
  window.clicky = {
    demo: true,
    onEvent: (fn) => (listener = fn),
    call: async (name, ...args) => {
      const event = (type, data) => listener({ type, data });
      if (name === "get-settings") return { ok: true, data: config };
      if (name === "save-settings" || name === "patch-settings") {
        if (args[1])
          return {
            ok: false,
            error:
              "Do not enter a real API key in the browser preview. Use the Windows app.",
          };
        config = { ...config, ...args[0] };
        return { ok: true, data: config };
      }
      if (name === "ask") {
        event("message", { role: "user", text: args[0], mode: args[1] });
        event("state", "thinking");
        timer = setTimeout(() => {
          event("message", {
            role: "assistant",
            text: "This is the browser UI preview. In the Windows app, I can use your selected model to explain your screen, draw a guide, or request approval for a desktop action. Download the installer from the GitHub Actions build to get started.",
          });
          event("state", "idle");
        }, 600);
        return { ok: true };
      }
      if (name === "stop") {
        clearTimeout(timer);
        event("state", "idle");
        return { ok: true };
      }
      if (name === "clear") {
        clearTimeout(timer);
        event("state", "idle");
        event("cleared");
        return { ok: true };
      }
      if (name === "voices") return { ok: true, data: [] };
      if (name === "open-link") {
        const links = {
          github: "https://github.com/victor123258/HeyClicky",
          key: "https://openrouter.ai/settings/keys",
          privacy: "https://openrouter.ai/settings/privacy",
        };
        if (links[args[0]]) window.open(links[args[0]], "_blank", "noopener");
        return { ok: true };
      }
      return {
        ok: false,
        error:
          "Available in the Windows desktop app only. This browser preview does not access your desktop or microphone.",
      };
    },
  };
}
