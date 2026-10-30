# Windows acceptance checklist

These require an actual Windows desktop. Do not mark them complete based on unit tests alone.

## Install & lifecycle
- [ ] On clean Windows 10 x64 and Windows 11 x64, extract artifact ZIP and run Setup as a non-admin user.
- [ ] Check Start menu and desktop shortcuts, automatic first launch, first-run Settings, and uninstall.
- [ ] Test portable executable without Node.js installed. Document shared AppData storage.
- [ ] Second launch opens the existing panel. Close hides it; tray can reopen and Quit exits all helpers.
- [ ] Enable/disable startup and verify after a Windows sign-in.

## AI & screen context
- [ ] Save key/model, restart and confirm key retained but never readable in the UI/settings file.
- [ ] Test invalid key, exhausted credit, offline network, text-only model and a valid vision/tool model.
- [ ] Request screen explanation and verify actual contents of selected monitor, not the app panel.
- [ ] Disable screen context: no screenshots taken, including if model asks for the screenshot tool.
- [ ] Test screen selection and clicking with a secondary monitor at negative coordinates, 100%/150%/200% scaling. Verify marked coordinates visually before approving clicks.
- [ ] Disconnect a monitor during a task: stop with an actionable error, not capture/click another screen.
- [ ] Verify annotations don't intercept mouse, disappear after 16 seconds or Stop, and buddy can be disabled.

## Voice & dictation
- [ ] With Windows speech pack installed, press Talk hotkey in another app; microphone starts, speech transcribes, answer plays aloud.
- [ ] Silent microphone, unavailable microphone and missing speech pack produce errors and return to idle.
- [ ] Select another installed voice and rate; test speech; Stop interrupts listening/synthesis.
- [ ] Dictate English and non-ASCII text into Notepad; toggle off and confirm no trailing input.
- [ ] Switch focus during dictation; confirm documented active-window behavior, no clipboard modification.

## Safety
- [ ] In Talk mode, request a click/command: only guidance/drawing is allowed.
- [ ] In Agent mode, verify each click/type/keystroke asks; command/file/web tools always ask even with desktop approvals off.
- [ ] Review exact arguments, Allow once, verify target focus, then fresh screenshot confirms action.
- [ ] Deny and wait out a two-minute approval: neither executes or retries.
- [ ] Ctrl+Shift+X while awaiting approval, during network request, during long PowerShell operation and speech. No subsequent tool executes.
- [ ] An existing file overwrite explicitly asks and shows full path/content. Use disposable files only.
- [ ] Stop does not claim to undo changes; detached processes limitation is documented.
- [ ] Hotkey conflict or invalid hotkey produces a visible error; old hotkeys restored after rejected change.
- [ ] Delete local data confirms first, removes saved key/settings, disables startup, clears storage and quits.

## Release
- [ ] Record Windows versions, model ID, microphone, speech language, display layout and results in the PR.
- [ ] Verify checksums and build provenance; sign executable for broader public distribution.

## Notch and voice input regression (1.2.0)
- [ ] Primary display shows a compact top-center notch. Hover/click expands; collapse shrinks the actual input-blocking window. No transparent area blocks other apps.
- [ ] Use all notch controls, check task/listening/approval status and transcript preview, and stop while the full panel is hidden. Full approvals are reviewed only in Chat.
- [ ] Dictate into Notepad via notch without focus leaving Notepad. Confirm no extra clipboard activity.
- [ ] Notch is absent from captured screenshots; an approved agent click at the top-center reaches the underlying app, not notch controls.
- [ ] Toggle notch off, then run tasks: it stays hidden. Change primary display/top taskbar/scale; notch repositions within the work area.
- [ ] With no API key, Find languages and Test microphone work locally without screen capture, typing or network calls. Compare input language to installed recognizers, not output voices.
- [ ] Select a non-default installed recognizer, save, then confirm Listening shows the correct language. A missing/removed recognizer gives a specific error.
- [ ] Disable desktop microphone permission or unplug/change default input, then Test microphone. Error is actionable and the UI returns to idle.
- [ ] Speak non-ASCII words with a compatible language, pause, verify the exact transcript and one AI submission only after microphone closure.
- [ ] Cancel, then quickly restart a voice turn; stale transcripts/exit events cannot submit the prior request. A failed startup or silent turn cannot leave the app indefinitely in Starting/Listening.

## Notch-centered workspace and hold-to-talk (1.3.0)
- [ ] Verify Home, complete Settings, Chat, queued task cards, follow-ups and exact-argument approvals work entirely inside the notch. Reload the renderer during approval; it must recover the same pending ID/arguments, not auto-approve.
- [ ] Hover opens only a quick peek without taking focus; explicit navigation enables typing. Collapse changes native bounds to 232×40, peek to 432×300, expanded to 640×760 (clamped to work area).
- [ ] Test global Talk/Agent hold shortcuts, including pauses longer than a phrase while holding. Only release submits. Test release of each modifier/key, quick taps, repeated keys, release before mic readiness, lock/sleep and stopped key helper.
- [ ] Hold the on-screen mic with mouse, touch and keyboard. Release outside the button, cancel pointer capture or blur the window: cancel/no duplicate submissions. Use a supported installed language and test non-ASCII partial/final transcripts.
- [ ] Compare waveform to actual microphone input; silence must not show a fabricated animated signal. No API request happens from partial transcripts.
- [ ] Queue two desktop tasks: one runs while the other waits. Cancel the queued task; stop the current task during a command, approval and speech. Global Stop must cancel queued work too. Follow-ups reuse only that task's text context.
- [ ] With the workspace collapsed, confirm task progress remains in the peek, captions remain on the correct display, and numbered teaching cards are readable and click-through. Toggle captions off.
- [ ] Confirm no-notch fallback remains usable; quit old app before trying a new portable build. Installer upgrade retains encrypted key/settings.


## Optional actual-Edge input (1.4.0) — manual acceptance, NOT verified by CI

- [ ] With Windows provider/default preferences, no Edge window or online speech launches. Existing Windows input, dictation, output speech and held shortcuts still work.
- [ ] Choose Edge in Settings; open visible setup with no AI key. Confirm dedicated profile, stable `127.0.0.1:21843`, permission prompt, real transcript and no AI request. Deny permission: actionable error, microphone off, no enabled background button.
- [ ] A successful visible test alone does not enable automatic minimized launch; explicit checkbox + button is required. Reopening setup restores a minimized helper. No personal Edge window is minimized/closed, even with another profile whose directory has an `edge-voice-profile-other` suffix.
- [ ] Save Edge/language/fallback; confirm source and status. Test `en-US` and desired language separately (e.g. `bn-BD`, if service supports it). Windows output voice is independent. No Windows recognizer is required for Edge-only input.
- [ ] Quit/relaunch; after approved consent, voice gesture launches dedicated Edge minimized. Keep Windows/Edge microphone indicators. Do not claim invisible/headless or always-on reliability. Re-test after lock/sleep, Edge update and permission reset.
- [ ] Hold Talk/Agent through pauses; release sends exactly one turn; early release/cancel sends none. Stop during startup, recognition, finalization and dictation makes microphone indicator stop; no late AI requests or typed chunks. Helper Stop and window close release the turn.
- [ ] Break internet/revoke site permission/close or suspend helper: if fallback enabled before release, show repeat notice, transition Starting → Listening with Windows source and no duplicate request. Missing Windows recognizer or synchronous launch failure returns idle with error. Disabled fallback fails cleanly. No fallback after released hold or already typed dictation.
- [ ] Close helper/disable minimized launches and verify documented difference. Restart/quit closes only dedicated helper. Port conflict fails with setup advice. A new helper connection aborts the old recording. No indefinite Starting state.
- [ ] Delete local data removes dedicated profile/remembered permission plus key/settings. Locked profile reports retry without claiming everything was deleted. Personal Edge profile stays untouched. Remote Microsoft/OpenRouter records are not deleted.

CI tests protocol/authentication, DOM consent, source/settings, cancellation and fallback with mocks; it compiles the Edge-window controller without manipulating a real window. It does **not** verify installed Edge Web Speech service behavior, remembered permissions, actual audio quality, Microsoft retention, minimized recognition, or physical microphone disposal.


## Dark UI, clock/tool protocol & experimental hidden Edge (1.5.0)

- [ ] Dark notch/panel/helper, readable text and 704×800 maximum logical expanded size. Check 100/125/150/200% DPI, 1366×768 and smaller work areas. No horizontal overflow; Settings and long chat scroll; composer/Send and Allow/Deny stay reachable with long arguments/notices. Check Windows high-contrast settings separately.
- [ ] Ask “what time it is in Dubai?” and compare with the Windows clock converted to Asia/Dubai (UTC+4). It should show the actual local date/time and clock source, without an AI request or screenshot. Check midnight rollover, UTC, a daylight-saving zone and an ambiguous city (must not guess).
- [ ] With a compatible OpenRouter model, ask a nontrivial clock/timezone question and inspect `get_time` activity. Test a batch containing screenshot plus another tool: model receives every matching tool response before user images. This requires a real model key; mocked tests do not prove hosted model behavior.
- [ ] In Talk, a public HTTPS read must ask for approval and report failure honestly. Desktop commands/clicks remain Agent-only. Check insufficient credits, unsupported model/provider, text-only model with screen context, malformed tool response and Stop during a tool/approval.
- [ ] After visible Edge test/background consent, save Hidden window mode and click Move helper to background. Dedicated Edge window leaves desktop/taskbar; OS microphone indicators remain. Verify actual speech, release-once, dictation, Stop and quit while hidden. No claim of live acceptance until checked on this machine.
- [ ] Open visible Edge setup restores a hidden helper. Minimize/hide/restore/close never control personal Edge windows. Quit and Delete data also close the hidden helper. Verify after lock/sleep, browser update and permission reset. If recognition fails when hidden, restore and select Minimized or Windows input; no invisible/headless guarantee.
- [ ] Before background consent, choosing Hidden alone cannot enable background permission. Existing 1.4 preferences migrate to Minimized, not silently to Hidden. Launch may briefly show a browser window before the authenticated helper connects.

Local browser smoke checked 1280×1000, 720×700 and 390×600 with no JS errors/horizontal overflow, but is not Windows DPI, Edge voice or desktop-action verification.


## Research, documents, visuals and background workers (1.6.0)

- [ ] With a live compatible model/key, request research. Search query approval is shown; each source fetch asks separately; results cite URLs and retrieval context. Test blocked search/CAPTCHA/403, redirects, dynamic pages and denial. Failures must not be described as verified research.
- [ ] Request PDF, DOCX, Markdown and text in Documents. Inspect exact path/content approval, actual file contents and formatting in a viewer. Existing export paths must fail without overwriting. Cancel during generation; verify no later file commit where preventable. PDF rendering is also checked by actual Electron CI using a `%PDF` signature, without Office.
- [ ] Request a chart, a node diagram and a 3D primitive scene. Orbit/zoom/pan/reset and visual selector work inside the notch; caption remains readable; WebGL failure is actionable. No model scripts/URLs/assets run. Check driver/DPI/small-screen behavior. Browser smoke uses real local Three.js/WebGL, not a still image.
- [ ] Start two Background research/writing jobs and queue a third. Cards/histories/results stay separate. Continue Talk/voice or use another app; background workers never capture the screen, click/type, open a browser or run shell commands. They still consume model credits and wait on approvals. A model requesting forbidden tools must be refused.
- [ ] Concurrent foreground/background approval requests produce one correctly job-bound approval at a time. Cancel one worker while its approval is queued/visible; no other job is denied or executed accidentally. Global Stop and Quit cancel all; late callbacks cannot mark cancelled work complete. Normal dictation ending must not stop unrelated background jobs.
- [ ] Follow-ups stay in the original worker mode. Clear requires running jobs to settle. Quit/restart does not resume tasks. Check 15-minute timeout, model/network failures, shared-file conflicts and manual cancellation. Already approved file changes are not undone.

Automated coverage uses fixture search pages, real DOCX ZIP structure/content, mock PDF conversion plus actual Electron PDF smoke on Windows, bounded visual validation, real browser WebGL, mode allowlists, approval serialization and cancellation. It does not prove live search availability, hosted model research/tool quality, Microsoft speech behavior or physical Windows desktop operation.

## Desktop graphics / follow-ups (1.7.0)

Automated unit/UI tests cover validated meshes/transforms/2D geometry, patch immutability/references/budgets, mesh-free context, Talk update routing, canvas window lifecycle, nonfocusable defaults, explicit interaction, nested suspend restoration, disconnect, abortable narration/tours, motion state and settings. Browser smoke exercises actual local Three.js/WebGL orbit, teaching steps, alpha 2D pixels, Escape and 1000/640/320-pixel layouts. Windows CI startup smoke additionally creates the real transparent sandboxed canvas, invokes its restricted IPC, verifies transparent 2D pixels, focusability changes and hide/restore, updates the same window and checks background visual/patch isolation. This does not test physical click dispatch, GPU drivers, speech audio or live model quality.

- [ ] Install 1.7; confirm existing Windows/Edge hold/release voice and dictation still work, with microphone indicators intact.
- [ ] With Chat closed, use voice to request a diagram/custom mesh. Canvas appears on selected display without focus theft. Desktop clicks/typing work underneath the entire transparent canvas (including blank space and cards).
- [ ] Open notch peek, select Interact. Orbit/zoom/pan work, keyboard Escape returns clicks; Return clicks and Dismiss work from both notch and fallback panel. New listening/question and native desktop actions cannot accidentally type/click the canvas. Test actual input at canvas-covered screen coordinates.
- [ ] Voice follow-ups reuse the active geometry/IDs, retain unchanged mesh parts and update colors/transforms/parts. Invalid meshes/patches fail without executing code or replacing the last good scene. A scene is illustrative, not a guaranteed accurate aircraft/connector model.
- [ ] Generate teaching steps and rotating/pulsing parts. Read step and guided tour use Windows voice; highlights/visibility advance after speech completes. Test Stop audio, Stop, new listening/question, replacement, close and GPU failure mid-speech: no overlapping answer/guide speech or stuck input. Manual tour remains available; automatic foreground explanations in 1.7.1 follow the settings below. Play motion pauses, and reduced-motion disables animation.
- [ ] With scene/interaction open, screenshot/native input hides it and restores only pass-through; nested operations do not restore prematurely. Disconnect selected display, change scaling/work area and sleep/resume. Try 100/125/150/200% DPI, negative coordinates, 1366×768 and GPU-disabled/remote-desktop sessions. Verify no offscreen critical controls.
- [ ] Two background jobs create/patch their own archived visuals while a foreground scene is visible. They do not replace it, read its IDs or focus a window. Deliberate Show on desktop opens the selected archive. Disable Desktop visual answers: no new desktop canvas; archive remains accessible. Clear/delete/quit removes session graphics/audio.

Physical Windows speech/Edge/GPU/focus and live OpenRouter quality/speed are manual acceptance items, not implied by passing CI.

## Second video audit (1.7.1)

- [ ] With Speak answers + Automatic visual explanations on, ask by voice for a new multi-step diagram/3D lesson. No chat or Play button required. Highlights, captions and part poses advance with narration. No duplicate final-summary speech. Disable either setting: no automatic guide; manual Read step remains available. A color-only edit must not replay the old tutorial.
- [ ] During a guide hold Talk and ask a follow-up. Narration stops before mic starts. Release before Listening, then press Stop in another attempt: no delayed microphone launch, accidental follow-up or lost cancellation. Background jobs must remain unaffected. Test native Windows and actual Edge separately.
- [ ] Say exact next/previous/repeat step, pause/continue explanation, dismiss visual and reset visual view commands. No model/network/screenshot call for these controls; edge-of-list errors must not execute unrelated actions. Continue begins the current step again, not an audio timestamp seek.
- [ ] Generate a connector/mechanism with sequential poses (translate/rotate/scale). Confirm earlier moves persist, backwards steps undo later moves, speech and minimum transition duration both finish before advancing, Pause/Stop cancels waiting, and reduced motion skips tweening. Validate hardware claims against exact model/revision documentation, never this generic example alone.
- [ ] Orbit, zoom and pan, then request an edit or choose another step: preserve camera. Reset and a newly generated scene reframe. New parts outside the old view may require Reset; this intentionally avoids unexpected camera jumps.
- [ ] Optional real-browser smoke: install `playwright-core` without changing production dependencies, start `npm run preview`, then `CHROMIUM_PATH=/path/to/chrome node scripts/graphics-smoke.cjs`. The connector sample is not a live-model response or a verified Pi model.

See [VIDEO-GAP-AUDIT.md](VIDEO-GAP-AUDIT.md) for source/evidence limits and remaining non-parity claims.

## Native modeling and component selection (1.8.0)

- [ ] Install 1.8; verify previously working Windows and optional Edge voice, hold/release/Stop, dictation, approvals and background isolation before testing new graphics.
- [ ] Generate rounded, extruded, lathed and curved-tube geometry. Ask for two reused connector assemblies and per-step hinge rotations. Children follow their parent; the hinge pivot stays fixed in world space. Reverse steps reconstruct earlier poses. Invalid profiles/cycles/expansion/transform budgets reject without replacing the last good scene.
- [ ] Enable Interact, click visible parts and choose groups/leaves from the part list. A drag/pan must not select, Escape/pass-through must disable picking, blank-click clears selection, hidden parts cannot be selected. Test touch/pen separately. Long untrusted descriptions/labels remain plain text and scroll safely; selected/highlighted callouts take priority when crowded.
- [ ] Focus part animates camera to current world bounds and manual orbit interrupts focus; reduced motion applies immediately. Selection/camera survive normal edits; transforms/colors tween. Reset/new scene reframes; hiding/deleting/new scene/dismissal clears stale selection.
- [ ] Explain this component returns click-through, asks about the exact selected ID, and uses the configured model/key/screenshot/speech settings. Voice commands “explain this component” / “focus selected part” work after selection. Missing key/no selection/stale scene/busy task/hidden ID must not trigger a different request or operate another desktop app. Verify with live model: generated descriptions are not authoritative hardware facts.
- [ ] Check transparent rendering, label contrast/leader lines and controls on real applications, 100–200% DPI, remote desktop/GPU-disabled configurations and secondary monitors. No automatic capture of the canvas itself or interception of native input. Repeated focus/patch/close cycles must not leak GPU contexts or leave hidden input windows.

Optional real-browser `scripts/graphics-smoke.cjs` now also covers actual curved/extruded shapes, fixed hinge pivot/inherited child motion, reuse independence, mouse picking, focus, camera preservation, color transition, label layout and pass-through. Windows startup smoke checks stale selection IPC rejection without requiring 3D GPU support. Physical device/live-model acceptance is still manual.
