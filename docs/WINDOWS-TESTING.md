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
