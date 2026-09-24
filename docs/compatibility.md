# Compatibility

The compatibility statements in this document are limited to the Pi installation and checks listed below. They are not a promise of compatibility with other Pi versions.

## Checked baseline

- Pi package: local dependency `@earendil-works/pi-coding-agent` `0.87.0` (the API probe pins `PI_PACKAGE_DIR` to this dependency so an unrelated global Pi installation cannot change the observed version)
- Node.js: the local Node.js `v24.9.0` installation used for the checks
- Package status: `pi-response-styles` `0.5.2` published on GitHub Releases as `v0.5.2` and on npm as `pi-response-styles@0.5.2`; compatibility verified against Pi `0.87.0` only; `waitingTurnReminder` blocked (FAIL-CLOSED); cross-plugin force delivery through `pi.events` covered by local integration tests

## Observed extension API

The local Pi types, documentation, and a no-network extension runner probe verified:

- `before_agent_start`: receives the chained `systemPrompt` and accepts a returned `systemPrompt`.
- `registerCommand`: registers `/output-style` and works with non-UI contexts.
- `ctx.getSystemPrompt()`: exposes the current system prompt in an extension context.
- `session_start`: is available for reporting startup persistence errors through the UI.
- Later `before_agent_start` handlers can still replace the prompt. This extension does not claim priority over other extensions.
- `pi.events`: the shared event bus (`Shared event bus for extension communication` at `dist/core/extensions/types.d.ts:1157-1158`; `emit(channel: string, data: unknown): void` and `on(channel: string, handler: (data: unknown) => void): () => void` at `dist/core/event-bus.d.ts:1-4`; documented at `docs/extensions.md:1832-1838`) delivers the live `ForcedStyleController` to other extensions.

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

## Style menu and status indicator

Version `0.4.0` adds two TUI surfaces, covered by the local suite (`test/ui/style-menu.test.ts`, `test/ui/status-indicator.test.ts`, `test/commands.test.ts`, `test/integration/extension.test.ts`), which renders the component with a test theme at 40, 79, 80, and 120 columns, and by render captures taken through Pi's own theme and overlay path at 79 and 80 columns:

- Opening `/output-style` with no arguments in a TUI session (`ctx.mode === "tui"`) shows an overlay menu: a navigable list (active marker and origin) beside a detail panel with the description, the style metadata line (`turn reminder`, `keep-coding`, `waiting reminder: unavailable (Pi)` when Pi cannot deliver it, `from <path>` for custom styles), and the wrapped instruction body. Enter applies and persists the selection through the same path as `/output-style <id>`; Esc cancels without changes. With the explicit `list` argument, and in RPC, JSON, and print modes, the command keeps the plain-text listing without dialogs.
- The body scrolls with `PgUp`/`PgDn`/`Home`/`End` in every mode and with the mouse wheel. The wheel reaches the menu only in Pi's fullscreen TUI mode (`tuiMode: "fullscreen"`); in the default regular mode Pi keeps the wheel for its scrollback, so the footer keys are the portable scroll path.
- Below 80 render columns the detail panel collapses and the active row carries its description inline; the collapsed layout has no room for the status line.
- While another plugin forces a style the menu shows `Forced by <plugin> — selection overridden` with every row muted and Enter disabled until the force is released. Load warnings are reported at session start, and a persisted selection that no longer exists falls back to `default` in both the menu marker and the indicator.
- Borders, optional banner, list, detail, and footer share one row budget, so the status line never renders past the rows the overlay paints; terminals shorter than about 8 rows can clip the menu.
- The status bar shows `style: <name>` for the effective style under the extension-owned key `pi-output-styles`: muted for `default`, accent otherwise. It is painted in TUI mode at session start, after a direct selection, and after the menu's Enter. Colors come from the theme current at write time; a theme change does not repaint an already-written entry.

## Built-in style catalog

Version `0.5.0` adds five built-in styles — `Reviewer`, `Diagrams first`, `STE`, `Caveman`, and `ELI5` — raising the catalog to ten, including `default`. Each new style declares `keepCodingInstructions: true` and its own `turnReminder`, emitted through the verified `turn_start` hook; none declares a `waitingTurnReminder`, which stays reserved for `Proactive` and blocked (FAIL-CLOSED) on Pi `0.87.0`. Selection, persistence, injection, and the menu are unchanged: the new identifiers resolve through the same registry and appear in `/output-style`, the menu, and the status indicator.

Coverage comes from the local suite: parity assertions per style in `test/styles/builtin-parity.test.ts`, exact catalog lists in `test/styles/registry.test.ts` and `test/styles/merge.test.ts`, reminder emission and the silent group in `test/reminders-turn.test.ts`, and the menu bound-arrows count in `test/ui/style-menu.test.ts`. The full suite runs 160 passed, 1 skipped; instruction texts are original wording, with third-party attributions in the README credits.

## Registry installation

`pi-response-styles@0.2.0` was installed from the npm registry on 2026-09-23 with `npm install pi-response-styles@0.2.0` in a temporary directory outside the repositories, and the installed artifact was verified:

- Integrity: `dist.shasum` `dc628ca872524343ba818f88c00e5bb9e62dc52e` and `dist.integrity` `sha512-gZso5dbFh16WGusH5VZUUqn7cB/Iu08QPo26EhVi+cxZPMMesg8t/F0LwKfzk+L3iU1pdfBxcc/BlvK3Fwh4ig==`, matching the values frozen at publication.
- Content: 22 files — `package.json`, `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/compatibility.md`, and the 15 TypeScript files under `src/`. A search of the installed files found no `test/`, `planning/`, or `.github/` entries, secrets, or personal paths.
- Entry contract: the installed manifest declares `pi.extensions: ["./src/extension.ts"]`, and that file exists in the artifact. The manifest declares no `main` and no `exports`: the package is consumed through Pi's extension loader, which loads the declared entry with its own TypeScript loader and supplies `@earendil-works/pi-coding-agent` — the entry's only external runtime import (`getAgentDir`) — as a virtual module. A bare `import("pi-response-styles")` from plain Node.js is not a supported entry point and fails with `ERR_MODULE_NOT_FOUND`.
- Loading evidence: effective loading is covered by the local test suite against the real Pi `ExtensionRunner`, from source (`test/integration/`). The suite exercises repository source, not the installed tarball.

## Not covered

- Pi versions other than `0.87.0`: not-run.
- User and project custom style discovery: covered by local fixture and integration tests for the approved user/project directories, precedence, malformed files, and fallback behavior.
- Plugin-forced temporary styles: the programmatic `ForcedStyleController` factory is covered by local tests, and cross-plugin force delivery runs over Pi's shared event bus: the extension emits the live controller on `pi-response-styles:style-controller` at load and re-emits it whenever another extension emits `pi-response-styles:style-controller-request`, so any load order works. `test/integration/style-controller-interop.test.ts` exercises delivery, forcing, and release through Pi's real loader and event bus in both load orders. The bus payload is untyped (`data: unknown`), so a receiver must verify the shape it gets, and no third-party plugin itself has been tested: that remains not-run.
- `waitingTurnReminder`: blocked (FAIL-CLOSED); no public background-only waiting event exists in Pi `0.87.0`.
- `turnReminder` hook registration and notification dispatch: available and implemented through `registerStyleReminders`; emission is covered by unit and ExtensionRunner probes without a provider.
- `keep-coding-instructions`: available for the extension-owned coding block; Pi-native, project, and opaque third-party instructions cannot be selectively removed.
- Provider requests and network access: not-run and intentionally absent from the tests.
- Style menu and status indicator in an interactive session: component renders were captured through Pi's real theme and overlay path at 79 and 80 columns, while renders at 40 and 120 columns come from the local suite's test theme; an interactive human pass over the live menu has not been run.
- Cross-process contention: checked with a separate local Node process waiting on the selection lock; the lock uses the filesystem's atomic directory creation primitive.
