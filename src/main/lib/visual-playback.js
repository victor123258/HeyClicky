// Local, exact commands only. Never route source/screen text through this parser.
function visualVoiceCommand(text) {
  if (typeof text !== "string") return null;
  const t = text
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, "");
  const commands = {
    "focus selected part": "focus",
    "explain this component": "explain-part",
    "next step": "next",
    "previous step": "previous",
    "repeat step": "repeat",
    "read this step": "repeat",
    "pause explanation": "stop-audio",
    "stop explanation": "stop-audio",
    "continue explanation": "tour",
    "play explanation": "tour",
    "dismiss visual": "dismiss",
    "close visual": "dismiss",
    "reset visual view": "reset",
    "pause visual motion": "pause-motion",
    "play visual motion": "play-motion",
  };
  return Object.hasOwn(commands, t) ? commands[t] : null;
}
async function runVisualVoiceCommand(canvas, command, speak) {
  if (command === "focus" || command === "explain-part")
    return canvas.command(command, {
      visualId: canvas.current?.id,
      id: canvas.selectedId,
    });
  if (command === "next" || command === "previous") {
    const step = canvas.step + (command === "next" ? 1 : -1);
    await canvas.command("step", step);
    if (speak) await canvas.command("narrate");
  } else if (command === "repeat") await canvas.command("narrate");
  else if (command === "pause-motion" || command === "play-motion")
    await canvas.command("animate", command === "play-motion");
  else await canvas.command(command);
}
function hasFreshVisualGuide(canvas, beforeId, settings, expectedId) {
  const v = canvas.current;
  return Boolean(
    (expectedId === undefined || v?.id === expectedId) &&
    settings.speak &&
    settings.autoExplainVisuals &&
    v &&
    v.id !== beforeId &&
    v.explanationFresh !== false &&
    v.spec.steps?.some((s) => s.narration.trim()),
  );
}
// Called only by foreground answer handling; background workers never get this path.
async function speakVisualAnswer({
  canvas,
  beforeId,
  expectedId,
  settings,
  answer,
  signal,
  speak,
}) {
  signal.throwIfAborted();
  if (!settings.speak) return "silent";
  const visual = canvas.current;
  if (hasFreshVisualGuide(canvas, beforeId, settings, expectedId)) {
    await canvas.explain(visual.id, signal);
    return "guided";
  }
  if (answer) await speak(answer, signal);
  return "answer";
}
module.exports = {
  hasFreshVisualGuide,
  visualVoiceCommand,
  runVisualVoiceCommand,
  speakVisualAnswer,
};
