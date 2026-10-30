# Notch-centered redesign (1.3.0)

## Reference and scope

The official Windows page describes a notch holding chat, agents and settings, rather than a launcher for a separate app: https://www.heyclicky.com/for-windows . The Windows changelog describes holding a shortcut to talk: https://www.heyclicky.com/changelog?p=windows . The Mac changelog additionally describes a compact hover peek, full Home, task cards and captions; these are design references, not proof of pixel-identical Windows behavior: https://www.heyclicky.com/changelog?p=mac .

The September Agent Finder review predates the Windows launch and is not used as a current platform feature specification. The supplied YouTube link's page/chapters were readable, but video frames were not reliably inspected. This is an original, independent UI based on documented interaction principles, not copied proprietary artwork or a claim of exact visual parity.

## Implemented architecture

- A single primary `Notch` BrowserWindow owns Home, conversation, task details, complete Settings and complete exact-argument approvals. A legacy panel remains available when the notch preference is disabled.
- Three native bounds: 232×40 idle, 432×300 peek, 640×760 expanded, clamped to primary display work area. Only explicit expansion enables window focus. The expanded workspace stays open until collapsed; only hover peek retreats on mouse exit. Reduced motion disables decorative transitions.
- Hold input has separate key-down/start and key-up/finish semantics. The keyboard helper polls only configured Talk/Agent combinations and reports release. The async Windows recognizer emits actual audio levels, hypotheses and final segments. Only explicit finish, successful recognition and clean helper closure create an AI request. Release before readiness, short taps, lost pointer capture, window blur and Stop cancel rather than submit. All captures have startup/turn/finalization deadlines.
- Agent cards have real session lifecycle data, bounded observed tool activity, independent text histories, results and follow-up requests. Desktop control is deliberately serialized; queues are visible and can be cancelled. This is not concurrent background automation. Queued work captures its selected display at execution time, not at enqueue time.
- Captions and numbered explanation cards use existing click-through overlays. Captions are bounded excerpts with a timeout, not word-timed subtitles. Native UI is hidden during screen capture and automation input.
- All remote text uses textContent. The notch preload has a named action allowlist; main IPC checks the known renderer and main frame. Full arguments and Deny/Allow live in the notch, with a random approval ID and timeout. No compact or voice-based auto-approval path exists.

## Explicitly outside this change

Interactive 3D, photo search cards, routines, native service connectors, a Chrome extension, persistent cross-day memory, signed updates, and parallel desktop agents are not implemented. The main improvements are the actual notch architecture, interaction design, local voice lifecycle, session task UX, and readable teaching presentation.

## Verification

Node tests cover task lifecycle/context isolation, shortcut parsing, stale helper cancellation, explicit voice finalization, partial-vs-final separation, real level forwarding, all three notch sizes/focus rules, integrated renderer navigation/settings/tasks, safe message rendering and browser-only sample labeling. Windows CI compiles the C# input, async speech and key polling helpers without opening a microphone, launches Electron with isolated data, verifies integrated Settings/Chat IPC and native expansion/collapse, then builds both executables. A browser smoke test checks the rendered flow with no JavaScript errors. Physical microphone, key release timing, permissions, desktop focus, DPI and monitor tests remain in WINDOWS-TESTING.md.
