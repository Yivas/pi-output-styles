# Compatibility

The compatibility statements in this document are limited to the Pi installation and checks listed below. They are not a promise of compatibility with other Pi versions.

## Checked baseline

- Pi package: local dependency `@earendil-works/pi-coding-agent` `0.87.0` (the API probe pins `PI_PACKAGE_DIR` to this dependency so an unrelated global Pi installation cannot change the observed version)
- Node.js: the local Node.js `v24.9.0` installation used for the checks
- Package status: `pi-response-styles` `0.1.0` published on npm and GitHub Releases; compatibility verified against Pi `0.87.0` only; `waitingTurnReminder` blocked (FAIL-CLOSED); cross-plugin force interoperability not-run

## Observed extension API

The local Pi types, documentation, and a no-network extension runner probe verified:

- `before_agent_start`: receives the chained `systemPrompt` and accepts a returned `systemPrompt`.
- `registerCommand`: registers `/output-style` and works with non-UI contexts.
- `ctx.getSystemPrompt()`: exposes the current system prompt in an extension context.
- `session_start`: is available for reporting startup persistence errors through the UI.
- Later `before_agent_start` handlers can still replace the prompt. This extension does not claim priority over other extensions.

The probe also observed callback registration and dispatch for `turn_start`, `turn_end`, and `agent_settled` through the local `ExtensionRunner`, without a provider request or network access. A dedicated hook for waiting only on background work was not present. The `turnReminder` adapter emits through `turn_start` without adding the reminder to the system prompt. The extension composes its own coding block before the style instructions and never rewrites the chained native or project prompt.

## Turn and waiting-hook audit

The audit used the installed package's public documentation, declaration files, runner declaration, and the local no-network probes in `test/integration/pi-api.test.ts` and `test/integration/reminders-api.test.ts`.

| Capability | Status | Public contract and evidence |
| --- | --- | --- |
| `turnReminder` | **available** | `ExtensionAPI.on("turn_start", handler: ExtensionHandler<TurnStartEvent>): () => void` at `dist/core/extensions/types.d.ts:1004`; `TurnStartEvent` exposes `turnIndex` and `timestamp` at `dist/core/extensions/types.d.ts:643-647`; the lifecycle and callback contract are documented at `docs/extensions.md:626-633`. The probe registers the callback and observes `turn_start:1` through `ExtensionRunner.emit` without a provider. |
| Turn-end observation | **available** | `ExtensionAPI.on("turn_end", handler: ExtensionHandler<TurnEndEvent, TurnEndEventResult>): () => void` at `dist/core/extensions/types.d.ts:1005`; `TurnEndEvent` requires boundary state plus `turnIndex`, message, tool results, and entry IDs at `dist/core/extensions/types.d.ts:648-655`. The runner declaration excludes this actionable boundary from generic `emit` and exposes `emitBoundary` at `dist/core/extensions/runner.d.ts:20-23, 158-160`; the probe observes `turn_end:1` through that method. |
| Final settled notification | **available** | `ExtensionAPI.on("agent_settled", handler: ExtensionHandler<AgentSettledEvent>): () => void` at `dist/core/extensions/types.d.ts:1001`; the event has no payload at `dist/core/extensions/types.d.ts:624-626`, and the documentation defines it as final and notification-only at `docs/extensions.md:575-606`. The probe observes `agent_settled` through `ExtensionRunner.emit`. This is not a background-only signal. |
| `waitingTurnReminder` | **blocked (FAIL-CLOSED)** | The complete public `ExtensionEvent` union at `dist/core/extensions/types.d.ts:879` and the lifecycle list at `docs/extensions.md:275-317` contain no event whose contract means that background work remains but no executable work remains. `agent_settled` is too broad because it only means the agent will not continue automatically. No timer, polling, tool wrapper, prompt regex, or provider hook is used as a substitute. |
| `keep-coding-instructions` | **available (extension-owned block only)** | `before_agent_start` receives the chained prompt and returns the composed prompt. `true` keeps the extension-owned coding block; `false` omits that block while preserving native, project, and earlier extension text. The transport integration test verifies both prompt variants and counts each style body once. |
| Style prompt precedence | **degraded** | Pi permits later `before_agent_start` handlers to replace the prompt. This extension preserves the prompt it receives but cannot claim priority over other extensions. |

`ExtensionRunner.emit` dispatches generic notification events, while `turn_end` is intentionally dispatched through `emitBoundary`; this distinction is confirmed by `dist/core/extensions/runner.d.ts:20-23, 158-160`, the implementation at `dist/core/extensions/runner.js:662-704`, and `docs/extensions.md:657-661`. The probes capture `ctx.ui.notify` output and do not invoke a provider, credentials, network, or telemetry.

## Persistence

Pi `0.87.0` does not expose a public generic writer for extension-owned settings namespaces. The extension therefore stores the selected identifier in:

```text
<agentDir>/pi-output-styles.selection.json
```

The file is outside the `output-styles/` Markdown discovery directory. Writes use a temporary JSON file followed by rename and are serialized by both a process-local queue and a filesystem lock. Missing, unreadable, malformed, or unknown selections fall back to `default` and report an error. Persistence was checked with a new store and a new extension instance using temporary local directories.

Writes acquire an exclusive lock directory beside the selection file, so separate Pi processes serialize the temporary-file rename. Each lock records an owner token; a stale lock older than 30 seconds may be reclaimed, and a previous owner can only release the lock if its token still matches. The package does not write Pi's `settings.json` and does not use `appendEntry` as a substitute for durable selection storage.

## Not covered

- Pi versions other than `0.87.0`: not-run.
- Registry installation: not-run.
- User and project custom style discovery: covered by local fixture and integration tests for the approved user/project directories, precedence, malformed files, and fallback behavior.
- Plugin-forced temporary styles: the programmatic `ForcedStyleController` factory is covered by local tests. The controller is process-local; Pi does not expose an approved inter-extension mechanism for handing it to a separate plugin, so cross-plugin force delivery is not implemented and remains not-run.
- `waitingTurnReminder`: blocked (FAIL-CLOSED); no public background-only waiting event exists in Pi `0.87.0`.
- `turnReminder` hook registration and notification dispatch: available and implemented through `registerStyleReminders`; emission is covered by unit and ExtensionRunner probes without a provider.
- `keep-coding-instructions`: available for the extension-owned coding block; Pi-native, project, and opaque third-party instructions cannot be selectively removed.
- Provider requests and network access: not-run and intentionally absent from the tests.
- Cross-process contention: checked with a separate local Node process waiting on the selection lock; the lock uses the filesystem's atomic directory creation primitive.
