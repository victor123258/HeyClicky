const { spawnSync } = require("node:child_process");
const path = require("node:path");
if (process.platform !== "win32")
  throw Error("Native helper checks require Windows.");
try {
  for (const [name, request] of [
    ["input.ps1", { action: "probe" }],
    ["speak.ps1", { action: "voices" }],
    ["listen.ps1", null],
    ["hold-speech.ps1", null],
    ["keys.ps1", { probe: true }],
    ["edge-window.ps1", { action: "probe" }],
  ]) {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(__dirname, name),
        ...(name === "listen.ps1"
          ? ["-Mode", "probe"]
          : name === "hold-speech.ps1"
            ? ["-Probe"]
            : []),
      ],
      {
        input: request ? JSON.stringify(request) : "",
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      },
    );
    if (result.error || result.status !== 0)
      throw Error(
        `${name}: ${result.error?.message || ""}\n${result.stdout}\n${result.stderr}`,
      );
    if (
      ["input.ps1", "edge-window.ps1"].includes(name) &&
      result.stdout.trim() !== "OK"
    )
      throw Error("Input helper probe returned an unexpected response.");
    if (name === "speak.ps1") {
      const voices = JSON.parse(result.stdout);
      if (!Array.isArray(voices))
        throw Error("Voice enumeration did not return an array.");
    }
    if (name === "listen.ps1") {
      const report = JSON.parse(result.stdout);
      if (!Array.isArray(report.languages))
        throw Error(
          "Speech recognition probe returned an invalid language list.",
        );
    }
    if (
      ["keys.ps1", "hold-speech.ps1"].includes(name) &&
      JSON.parse(result.stdout).type !== "ready"
    )
      throw Error("Native hold-to-talk probe failed.");
    console.log(`${name}: passed`);
    if (name === "edge-window.ps1") {
      // Exercise the real verified-close protocol with a fresh, nonexistent
      // profile path. This cannot match a user's normal/dedicated Edge profile.
      const profile = path.join(
        require("node:os").tmpdir(),
        require("node:crypto").randomUUID(),
        "edge-voice-profile",
      );
      const closed = spawnSync(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(__dirname, name),
        ],
        {
          input: JSON.stringify({ action: "close", profile }),
          encoding: "utf8",
          windowsHide: true,
          timeout: 15000,
        },
      );
      if (closed.error || closed.status !== 0)
        throw Error(
          `Verified-close probe failed: ${closed.error?.message || closed.stderr}`,
        );
      const report = JSON.parse(closed.stdout);
      if (
        report.action !== "close" ||
        report.verified !== true ||
        report.remainingWindows !== 0 ||
        report.closedWindows !== 0
      )
        throw Error("Edge helper returned an unverified close response.");
      console.log("Edge absent-profile closure verification: passed");
    }
  }
} catch (error) {
  console.error(error.message);
  const message = error.message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.log(`::error title=Native helper probe::${message}`);
  process.exitCode = 1;
}
