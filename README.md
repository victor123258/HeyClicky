# HeyClicky Community v1

**A voice-first AI desktop buddy for Windows 10/11.** Talk about your screen, get on-screen guidance, dictate into other apps, and work with an approval-based desktop agent—all from a compact notch workspace.

An independent, open-source project inspired by [HeyClicky](https://www.heyclicky.com/). **Not the official HeyClicky app, not affiliated with its service, and not a full replacement for it.** No official accounts, private APIs or proprietary engine are used. Bring your own OpenRouter API key; model usage is billed by OpenRouter.

![HeyClicky Community notch workspace](docs/notch-workspace.png)

## Download and install

1. Open the [Windows installer builds for main](https://github.com/victor123258/HeyClicky/actions/workflows/windows.yml?query=branch%3Amain).
2. Select the latest **successful** `main` run and download **HeyClicky-Windows-x64** from its Artifacts section. GitHub sign-in is required; extract the ZIP.
3. Run `HeyClicky-Setup-<version>.exe` for a one-click, per-user installation with shortcuts. Alternatively, run `HeyClicky-Portable-<version>.exe` without installing.
4. Open **Settings**, add your own [OpenRouter API key](https://openrouter.ai/settings/keys), select a model, save, and test the connection. With screen context enabled, the model needs **image and function-tool support**. A successful text connection test does not prove either capability.

**Requirements:** x64 Windows 10/11, internet access, and Windows PowerShell 5.1. Voice input also needs a microphone and either an installed Windows speech-recognition language pack or Microsoft Edge. Node.js is **not** required to run the app.

> **Distribution notes:** installers are unsigned, so Windows SmartScreen or organizational policies may warn or block them. Do not disable security protections. Automatic updates are not configured. Build artifacts expire after 30 days and can be rebuilt using the workflow. The portable app still stores preferences in your Windows user-data folder; it is not fully self-contained.

## What v1 includes

| Feature | What you can do |
| --- | --- |
| **Notch workspace** | Open Home, Chat, Settings, task activity and approvals in a collapsed, peek or expanded top-of-screen workspace. A standalone panel is available when the notch is disabled. |
| **Screen-aware Talk** | Ask by voice or text, include a screenshot when enabled, get spoken Windows voice output, and request visual explanations. |
| **Voice input and dictation** | Use local Windows recognition or optional Edge online recognition. Hold to speak and release to submit, or dictate into the focused application. |
| **On-screen guidance** | Show transparent arrows, boxes, circles, pointers, numbered explanation cards and optional answer captions. |
| **Interactive 2D/3D** | Create diagrams, charts and bounded 3D models with curved tubes, extrusions, lathed shapes, reusable assemblies, hierarchical parts and hinge pivots. |
| **Component interaction** | Explicitly enable Interact, select a part, focus the camera or ask “explain this component.” Follow-up edits preserve compatible scene state. |
| **Guided explanations** | Narrate teaching steps with highlights and animated part poses. Pause, continue or navigate steps through the toolbar or supported voice commands. |
| **Desktop agent** | Request clicks, typing, keyboard shortcuts, commands and file operations, with exact-argument approvals by default. Desktop-control tasks run one at a time. |
| **Background work** | Run up to two isolated research/writing jobs without giving them screenshots, desktop input, shell execution or control of the foreground canvas. |
| **Research and documents** | Search the web, fetch bounded HTTPS text, and create basic PDF, DOCX, Markdown or text documents after approval. |
| **Adaptive sizing** | Fit the notch and panel to the available work area. Choose Small, Medium or Large for the cursor companion; its icon and status label avoid monitor edges and taskbars. |

Generated visuals remain **validated data**, never unrestricted AI-generated JavaScript, Python, shaders or plugins. They are explanatory illustrations—not CAD, physical simulation or verified hardware instructions. See the [native modeling guide](docs/NATIVE-MODELING.md).

## Get started with voice

### Windows recognition

1. In **Settings → Voice & listening**, choose Windows input.
2. Use **Find languages** and select an installed recognition language. A text-to-speech voice is not a recognition engine; install a Windows **Speech** language pack if necessary.
3. Save and use **Test microphone**. This checks recognition locally without submitting an AI request.
4. Hold Talk, wait for **Listening**, speak, then release to send. Releasing before readiness or pressing Stop discards the turn.

### Optional Microsoft Edge input

1. Stop active voice/tasks, choose **Microsoft Edge**, and enter a supported input language such as `en-US`.
2. Click **Open visible Edge setup**. The app uses a dedicated `edge-voice-profile`, not your normal browsing profile.
3. In that visible helper, allow microphone access, complete a successful recognition test, and read the background-use disclosure.
4. If wanted, choose **Enable background use & hide window**. For an already configured helper, **Hide Edge helper** saves Hidden mode. Minimized remains an optional compatibility fallback.
5. Use **Open visible Edge setup** whenever permissions or another visible gesture are needed. Close helper and Quit verify dedicated window closure where possible and report failures instead of assuming success.

**Edge recognition is experimental, not headless.** Edge remains running while providing recognition; a launch window may appear briefly. Browser updates, policies, network problems or suspension can interrupt it. Windows microphone indicators are not hidden, and normal Edge windows are not targeted. When enabled, fallback asks you to repeat using Windows recognition; released turns and already delivered dictation are not replayed.

Edge audio may be sent to Microsoft's online speech service, including during tests or subsequently cancelled turns. There is no separate speech API key, but no unlimited/free-service guarantee. Windows speech remains the default input provider.

## Everyday controls

Default shortcuts can be changed in Settings.

| Shortcut | Action |
| --- | --- |
| **Ctrl+Shift+Space** | Hold Talk; wait for Listening, speak, then release to submit. |
| **Ctrl+Shift+A** | Hold to speak an Agent task, then release to queue it. |
| **Ctrl+Shift+D** | Start or stop dictation into the currently focused application. |
| **Ctrl+Shift+H** | Open or collapse the notch workspace. |
| **Ctrl+Shift+X** | Stop listening, speaking, requests, pending approvals and agent work. |
| **Escape** | Stop work when the workspace is focused; return the interactive canvas to pass-through when it is focused. Not a global shortcut. |

- **Talk** explains, draws and uses approved research/document tools; it cannot click, type or execute commands. **Agent** enables desktop actions.
- The small microphone icon also supports tap-and-pause input. There is no wake word or continuous hosted real-time voice stream.
- For dictation, focus the destination app **before** starting. Text goes to whichever window is currently focused; avoid changing to sensitive fields. Spoken punctuation commands are not implemented.
- The desktop canvas is **click-through by default**. Enable **Interact** deliberately to orbit/select parts, and use Escape or pass-through when finished.
- Closing the workspace keeps the tray app running. Use **Quit** in the tray to exit.

Try: “Explain this screen,” “What time is it in Dubai?” or “Create a generic connector with a hinged latch and curved cable, then show it opening.” For real hardware, identify the exact model and consult manufacturer documentation.

## Approvals and safety

- Keep desktop approvals enabled. Review the **exact tool arguments**, target app, commands, paths and file contents before allowing an action.
- Commands, file reads/writes, browser links, web searches, HTTPS fetches and document creation always require approval, even when desktop click/type approvals are disabled.
- Denial stops the task. Pending approvals expire after two minutes. Screen capture and annotations are part of a screen-context request rather than separately approved actions; turn **Screen context** off to disable screenshot tools.
- Stop cancels pending work, but **cannot undo completed actions or retract data already sent**. A detached program/service launched by an approved command may outlive its parent.
- The agent runs with your Windows user's permissions. It is not an OS sandbox, does not use Windows UI Automation, and may misread screenshots or encounter prompt injection. Prompts are not a security boundary. Avoid secrets and review every action.
- Saving settings rolls hotkeys back if persistence fails. Optional post-save Windows failures show **Saved with warnings** instead of silently making active and saved hotkeys disagree.

Read [SECURITY.md](SECURITY.md) before granting desktop access.

## Privacy and local data

Requests go directly to OpenRouter and your selected model provider. They can include recent conversation text, an enabled screenshot and approved tool results. File reads and command output may therefore leave your PC. Review [OpenRouter's privacy settings](https://openrouter.ai/settings/privacy) and your provider's retention terms. No app-owned AI backend or telemetry is configured.

- Settings and the API key are stored in the Windows user-data folder, normally `%APPDATA%\heyclicky-community`. The key uses Windows user-bound encryption with no plaintext fallback.
- Conversation/task activity is session-only. Screenshots stay in process memory and are not intentionally written to disk or retained in follow-up history. OS paging/crash handling and remote retention are outside this guarantee.
- Windows recognition keeps audio local; submitted text can then go to the model. Edge recognition may send audio to Microsoft before submission. The Edge helper never receives your OpenRouter key, screen or conversation.
- **Delete local data** attempts verified helper closure, removes its profile/remembered permissions, deletes saved settings/key and clears app storage before quitting. Unverified closure preserves the profile for recovery. Queued settings writes are blocked during deletion and Quit.
- Deletion does not remove agent-created files, provider records or the installed application. Uninstall through Windows Settings.

## Known limitations

- No official HeyClicky accounts, plans, private services or guaranteed visual/feature parity.
- No signed installer, automatic updater, macOS build or persistent conversation memory.
- No native Gmail/Notion/Google Sheets OAuth integrations; desktop automation is not equivalent to a connector. Never supply passwords, tokens or browser session cookies to the agent.
- No Blender integration, imported GLB/CAD assets, external textures or arbitrary generated executable graphics code.
- Search is best effort; HTTPS fetch reads bounded text, does not execute website JavaScript and does not follow redirects. Document formatting is basic.
- Voice languages, hotkey availability, elevated/secure windows, GPU support and organizational policies can limit functionality. Model quality, latency and cost depend on your chosen provider.

Automated checks do not prove real Edge microphone behavior, native click-through, mixed-monitor DPI behavior or live-model accuracy. Use the [Windows acceptance checklist](docs/WINDOWS-TESTING.md) on a real device before broader distribution.

## Development

Use Node.js 22 and Git. Native desktop features and packaging require Windows.

```powershell
git clone --branch main https://github.com/victor123258/HeyClicky.git
cd HeyClicky
npm ci
npm run check
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-smoke.ps1
npm start
# Build installer and portable executables into dist\:
npm run dist -- --publish never
```

For a clearly labelled **UI-only browser preview** on other platforms:

```sh
npm ci
npm run preview
# Open http://localhost:3000
```

The preview makes no AI calls, records no microphone input and has no desktop access. Do not enter real keys there. Build numbers are maintained in [`package.json`](package.json); **v1** is the consolidated major-version guide, not a reset of application versions or Git history.

### Project map

| Location | Purpose |
| --- | --- |
| `src/main/` | Electron lifecycle, voice providers, approvals and native desktop coordination |
| `src/main/lib/` | Agent/tools, model client, validation, encrypted settings and job logic |
| `src/preload/` | Narrow, context-isolated renderer bridges |
| `src/renderer/` | Notch, fallback panel, transparent overlays and local graphics renderer |
| `src/edge-voice/` | Visible Edge permission/test/background-consent helper |
| `scripts/` | Builds, native Windows helpers and smoke checks |
| `test/` | Agent safety, settings, voice, tools, modeling and UI regression tests |
| `.github/workflows/` | Windows validation and downloadable executable builds |

## License

[MIT](LICENSE). Independent community project, not affiliated with official HeyClicky.
