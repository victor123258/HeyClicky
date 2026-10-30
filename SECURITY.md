# Security notes

This is an experimental local desktop agent, not a sandbox. Keep desktop approvals enabled. Never provide secrets or permit commands you do not understand. Arbitrary approved PowerShell has your Windows user's permissions and can bypass all application-level boundaries. Prompt-injection defenses are best effort; screenshots, files and websites can contain adversarial instructions.

Main-process IPC is limited to the local fallback panel and notch workspace, and their main frames. The notch has an explicit action allowlist; the overlay has no command bridge. Expanded-notch approvals expose complete arguments, default focus to Deny, and use the same main-process ID/timeout validation as the fallback panel. Renderers have Node integration disabled, context isolation and sandboxing enabled, no generic IPC bridge, and a restrictive CSP. They render model text with textContent, not HTML. The model cannot select an arbitrary network API endpoint. No credentials belong in Git, logs, test fixtures or renderer storage.

The key is stored through Electron safeStorage (Windows DPAPI). Failure to encrypt does not fall back to plaintext. Approval is one action only, bound to a random ID, and expires on cancel or timeout. Read-only data access can expose secrets and always requires approval. All commands require approval regardless of the desktop approval preference.

Report security problems privately to the repository owner through GitHub's security reporting facility if enabled; otherwise ask the owner for a private contact without posting exploit details or credentials publicly. Review SECURITY.md, README.md and the Windows checklist before distributing this unsigned application.

Desktop tasks are serialized, not parallel. Histories are text-only and isolated per task; no task queue is persisted to disk. The voice-key helper polls only configured shortcut combinations. Partial speech is local and does not create a request before explicit release. Focusable text UI exists only in the deliberately expanded notch; hover peek stays non-activating.
