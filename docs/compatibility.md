# Compatibility

The compatibility statements in this document are limited to the Pi installation and checks listed below. They are not a promise of compatibility with other Pi versions.

## Checked baseline

- Pi package: `@earendil-works/pi-coding-agent` `0.87.0`
- Node.js: the local Node.js `v24.9.0` installation used for the checks
- Package status: not published; installation from a registry was not-run

## Observed extension API

The local Pi types, documentation, and a no-network extension runner probe verified:

- `before_agent_start`: receives the chained `systemPrompt` and accepts a returned `systemPrompt`.
- `registerCommand`: registers `/output-style` and works with non-UI contexts.
- `ctx.getSystemPrompt()`: exposes the current system prompt in an extension context.
- `session_start`: is available for reporting startup persistence errors through the UI.
- Later `before_agent_start` handlers can still replace the prompt. This extension does not claim priority over other extensions.

The probe also observed `turn_start`, `turn_end`, and `agent_settled`. A dedicated hook for waiting only on background work was not present. Turn reminders and operational `keep-coding-instructions` semantics are **not-run** in this package; they belong to a later front.

## Persistence

Pi `0.87.0` does not expose a public generic writer for extension-owned settings namespaces. The extension therefore stores the selected identifier in:

```text
<agentDir>/pi-output-styles.selection.json
```

The file is outside the `output-styles/` Markdown discovery directory. Writes use a temporary JSON file followed by rename and are serialized by both a process-local queue and a filesystem lock. Missing, unreadable, malformed, or unknown selections fall back to `default` and report an error. Persistence was checked with a new store and a new extension instance using temporary local directories.

Writes acquire an exclusive lock directory beside the selection file, so separate Pi processes serialize the temporary-file rename. A stale lock older than 30 seconds is removed before retrying. The package does not write Pi's `settings.json` and does not use `appendEntry` as a substitute for durable selection storage.

## Not covered

- Pi versions other than `0.87.0`: not-run.
- Registry installation and npm publication: not-run.
- User and project custom style discovery: not-run; planned for a later front.
- Plugin-forced temporary styles: not-run.
- Per-turn reminders and operational `keep-coding-instructions`: not-run.
- Provider requests and network access: not-run and intentionally absent from the tests.
- Cross-process contention: checked with a separate local Node process waiting on the selection lock; the lock uses the filesystem's atomic directory creation primitive.
