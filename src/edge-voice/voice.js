// Runs only in the real Edge helper origin. Never receives an AI API key.
(() => {
  const $ = (s) => document.querySelector(s);
  const supplied = location.hash.slice(1);
  if (supplied) {
    sessionStorage.setItem("voice-capability", supplied);
    history.replaceState(null, "", location.pathname);
  }
  const token = sessionStorage.getItem("voice-capability");
  let connected = false,
    current = null,
    recognition = null,
    testPassed = false,
    streamController;
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const provider = Boolean(Recognition) && /Edg\//.test(navigator.userAgent);
  const status = (text) => ($("#status").textContent = text);
  // Preserve ready / dictation chunk / final ordering across loopback requests.
  let eventQueue = Promise.resolve();
  function post(event) {
    const task = eventQueue.then(async () => {
      const response = await fetch("/event", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
      if (!response.ok)
        throw Error(
          "The desktop app rejected this helper event. Reopen Edge setup from the app.",
        );
    });
    eventQueue = task.catch(() => {});
    return task;
  }

  function stopLocal(cancel = true) {
    const previous = recognition;
    recognition = null;
    if (current) current.cancelled = cancel;
    current = null;
    if (previous) {
      previous.onend = null;
      previous.onresult = null;
      previous.onerror = null;
      try {
        previous.abort();
      } catch {}
    }
    $("#stop").hidden = true;
    document.body.classList.remove("recording");
    status("Microphone is off.");
  }
  async function reportError(session, error) {
    if (current !== session) return;
    stopLocal();
    status(
      `Edge speech failed: ${error}. Recheck microphone permission, language and internet connection.`,
    );
    if (!session.local)
      try {
        await post({ type: "error", id: session.id, error });
      } catch {
        disconnect();
      }
  }
  function begin(command, local = false) {
    stopLocal();
    if (!provider) {
      if (!local)
        post({
          type: "error",
          id: command.id,
          error: "SpeechRecognition is unavailable in this Edge build",
        }).catch(disconnect);
      status(
        "Speech recognition is unavailable. Use a current Microsoft Edge build, or Windows speech.",
      );
      return;
    }
    const session = (current = {
      ...command,
      local,
      finals: new Map(),
      interim: "",
      finishing: false,
      cancelled: false,
    });
    const rec = (recognition = new Recognition());
    rec.lang = command.language || "en-US";
    rec.interimResults = true;
    rec.continuous = Boolean(command.held) || command.mode === "dictate";
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      if (current !== session) return;
      document.body.classList.add("recording");
      $("#stop").hidden = false;
      status(
        local
          ? "Listening for a local test…"
          : command.held
            ? "Listening. Release in HeyClicky to send."
            : "Listening. Speak, then pause.",
      );
      if (!local) post({ type: "ready", id: command.id }).catch(disconnect);
    };
    rec.onresult = (event) => {
      if (current !== session) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i],
          text = result[0]?.transcript || "";
        if (result.isFinal) {
          const fresh = !session.finals.has(i);
          session.finals.set(i, text);
          if (command.mode === "dictate" && fresh && !local)
            post({ type: "text", id: command.id, text }).catch(disconnect);
        }
      }
      for (let i = 0; i < event.results.length; i++)
        if (!event.results[i].isFinal)
          interim += event.results[i][0]?.transcript || "";
      const text = [...session.finals.values(), interim]
        .filter(Boolean)
        .join(" ")
        .slice(0, 12000);
      $("#transcript").textContent = text;
      if (!local)
        post({ type: "partial", id: command.id, text }).catch(disconnect);
    };
    rec.onerror = (event) => {
      if (current === session)
        reportError(session, event.error || "recognition error");
    };
    rec.onend = () => {
      if (current !== session) return;
      const text = [...session.finals.values()].join(" ").trim();
      recognition = null;
      current = null;
      $("#stop").hidden = true;
      document.body.classList.remove("recording");
      status("Microphone is off.");
      if (session.cancelled) return;
      if (local) {
        if (text) {
          testPassed = true;
          $("#background").disabled = !$("#consent").checked;
          status("Local Edge test succeeded. No AI request was made.");
          post({ type: "test-success" }).catch(disconnect);
        } else status("No completed speech heard. Try again.");
        return;
      }
      if (command.held && !session.finishing) {
        post({
          type: "error",
          id: command.id,
          error: "recognition ended before release",
        }).catch(disconnect);
        return;
      }
      if (command.mode === "dictate") {
        post({ type: "ended", id: command.id }).catch(disconnect);
        return;
      }
      post({ type: "final", id: command.id, text }).catch(disconnect);
    };
    try {
      rec.start();
    } catch (error) {
      reportError(session, error.name || "start rejected");
    }
  }
  function handle(command) {
    if (command.type === "hello") {
      $("#connection").textContent =
        "Connected to HeyClicky on this PC. " +
        (command.backgroundAllowed
          ? "Background use was previously enabled."
          : "Complete the visible test before enabling background use.");
      return;
    }
    if (command.type === "start") {
      begin(command);
      return;
    }
    if (command.type === "finish" && current?.id === command.id) {
      current.finishing = true;
      status("Finishing transcription…");
      try {
        recognition?.stop();
      } catch {
        reportError(current, "could not finalize");
      }
      return;
    }
    if (command.type === "cancel") {
      const id = command.id;
      if (!id || id === current?.id) stopLocal();
      if (id) post({ type: "stopped", id }).catch(disconnect);
      return;
    }
    if (command.type === "shutdown") {
      stopLocal();
      disconnect();
    }
  }
  function disconnect() {
    connected = false;
    stopLocal();
    streamController?.abort();
    $("#connection").textContent =
      "Disconnected. Open Edge setup from the desktop app to reconnect. No microphone is active.";
  }
  async function connect() {
    if (!token) {
      $("#connection").textContent =
        "Open this helper from HeyClicky Settings. It needs a private local connection token.";
      return;
    }
    streamController = new AbortController();
    try {
      const response = await fetch("/stream", {
        headers: { Authorization: `Bearer ${token}` },
        signal: streamController.signal,
      });
      if (!response.ok) throw Error("Not authorized");
      connected = true;
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "";
      while (connected) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let index;
        while ((index = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 1);
          if (line) handle(JSON.parse(line));
        }
      }
    } catch {
    } finally {
      disconnect();
    }
  }
  $("#test").onclick = async () => {
    if (!connected) {
      status("Not connected. Reopen setup from HeyClicky.");
      return;
    }
    if (current && !current.local) {
      status("Stop the active voice turn in HeyClicky before testing.");
      return;
    }
    try {
      // Explicit visible user gesture. Never auto-grant or bypass permission.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((track) => track.stop());
      if (!connected || (current && !current.local)) {
        status("Another voice turn started. Stop it before testing.");
        return;
      }
      begin(
        {
          id: "local-test",
          mode: "test",
          held: false,
          language: $("#language").value.trim(),
        },
        true,
      );
    } catch (error) {
      status(
        `Microphone permission/setup failed: ${error.name}. Check Edge site permissions and Windows desktop microphone access.`,
      );
    }
  };
  $("#stop").onclick = () => {
    const active = current;
    stopLocal();
    if (active && !active.local)
      post({
        type: "cancelled",
        id: active.id,
      }).catch(disconnect);
  };
  $("#consent").onchange = () =>
    ($("#background").disabled = !testPassed || !$("#consent").checked);
  $("#background").onclick = async () => {
    if (!testPassed || !$("#consent").checked) return;
    try {
      await post({ type: "background-approved" });
      $("#background-status").textContent =
        "Background use enabled. Edge may still need a visible gesture after updates or suspension.";
    } catch (error) {
      $("#background-status").textContent = error.message;
    }
  };
  setInterval(() => {
    if (connected) post({ type: "heartbeat" }).catch(disconnect);
  }, 3000);
  window.addEventListener("pagehide", () => {
    stopLocal();
    streamController?.abort();
  });
  connect();
})();
