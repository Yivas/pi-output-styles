# Changelog

All notable changes to `pi-output-styles` are documented here.

## Unreleased

### Changed

- The `/output-style` menu overlay now opens anchored at the bottom above the input line (`bottom-center` with a one-row margin), like the rest of Pi's TUI panels, instead of centered mid-screen. The layout, keyboard, states, scrolling and the status indicator are unchanged.

## [0.5.0] - 2026-09-24

### Added

- Five new built-in styles, selectable with `/output-style` and applied like the existing ones: `Reviewer` (a critical code-review lens on any code you read or write), `Diagrams first` (mermaid-first structure and flow explanations), `STE` (ASD-STE100 Simplified Technical English with an action-first reply shape), `Caveman` (ultra-terse telegraphic replies that keep technical tokens exact), and `ELI5` (plain words for a tired reader, capped at two options per decision). Each ships with its own turn reminder; the waiting reminder stays fail-closed on Pi 0.87.0.

## [0.4.0] - 2026-09-24

### Added

- `/output-style` with no arguments now opens an interactive menu in TUI sessions: a navigable style list (active marker and origin) beside a live detail panel with the description, the style's real metadata (`turn reminder`, `keep-coding`, `waiting reminder: unavailable (Pi)` when Pi cannot deliver it, and `from <path>` for custom styles), and the instruction body with real scrolling. The menu fits the terminal height — borders, banner, list, detail and footer share one row budget, so the status line stays on screen — and the body scrolls with the mouse wheel and with `PgUp`/`PgDn`/`Home`/`End`, listed in the menu footer next to `↑↓ · Enter · Esc`. Enter applies and persists the selection; Esc cancels.
- A `style: <name>` indicator in the status bar follows the effective style: muted for `default`, accent otherwise, painted at session start and after every selection change.

### Changed

- The menu surfaces the live forced, warning, and fallback states: while another plugin forces a style it shows `Forced by <plugin> — selection overridden` with every row muted and Enter disabled until the force is released, load warnings keep reporting at session start, and a persisted selection that no longer exists falls back to `default` in both the menu marker and the indicator.
- The responsive layout collapses the detail panel below 80 columns, moving the active row's description inline. Only the no-argument TUI route changed: `/output-style <id>` and `/output-style status` keep their previous behavior, and RPC, JSON and print modes keep the plain-text listing without dialogs.

### Compatibility

- Verified against Pi `0.87.0`.
- Other Pi versions have not been run.

### Known limitations

- Mouse-wheel scrolling follows Pi's input routing: the wheel reaches the menu in Pi's fullscreen TUI mode (`tuiMode: "fullscreen"`); in the default regular mode the terminal keeps the wheel for its scrollback, so the footer keys are the portable scroll path.
- Terminals shorter than about 8 rows can clip the menu.
- The `Proactive` `waitingTurnReminder` is declared but never emitted: Pi `0.87.0` exposes no public waiting-only hook, so it fails closed with no polling, timer, or prompt substitute. Implementing it requires a new version of Pi.

## [0.3.0] - 2026-09-23

### Added

- Cross-plugin force delivery: another extension receives the live `ForcedStyleController` through Pi's shared event bus on `pi-response-styles:style-controller` after emitting `pi-response-styles:style-controller-request`; integration tests cover both extension load orders and release.

### Changed

- The npm package ships `CHANGELOG.md`: the tarball allowlist includes it, so `pi-response-styles@0.3.0` carries the release history (`pi-response-styles@0.2.0` predates this change).

### Fixed

- The compatibility document and the README status now record what has actually been verified: the npm registry installation of `0.2.0` and the cross-plugin force delivery over `pi.events`, replacing the previous `not-run` statements for both.

### Compatibility

- Verified against Pi `0.87.0`.
- Other Pi versions have not been run.

### Known limitations

- The `Proactive` `waitingTurnReminder` is declared but never emitted: Pi `0.87.0` exposes no public waiting-only hook, so it fails closed with no polling, timer, or prompt substitute. Implementing it requires a new version of Pi.
- No third-party plugin itself has been tested against the event bus; the bus payload is untyped, so a receiver must verify the shape it gets.

## [0.2.0] - 2026-09-23

### Added

- Turn-start style reminders: `Proactive` and `Concise` emit one notification at the start of each turn; `default`, `Explanatory`, and `Learning` stay silent.

### Changed

- All five built-in style texts were rewritten from scratch in English with the depth of the approved output-style specification: `Proactive` gains an active-style section with six numbered rules, `Concise` six numbered rules plus a final precedence clause, `Explanatory` an educational frame with an in-conversation insight block of 2-3 key points, and `Learning` a human-contribution protocol with 2-10/20+ line thresholds, `TODO(human)` markers, a three-field request block, three worked examples, and an insight closing.
- `default` is now pure: empty instructions and `keepCodingInstructions: false`, so selecting it leaves Pi's system prompt untouched instead of appending the base coding block (previously every built-in appended it).

### Fixed

- Version and channel claims now match the verified registries: the release lives on GitHub as `v0.2.0` and on npm as `pi-response-styles@0.2.0`, its first npm version (compatibility document, README, contributing guide, and the issue and pull request templates).

### Security

- Closed the development-only advisories `GHSA-5xrq-8626-4rwp` and `GHSA-82fw-gwwq-j7x9` by raising `vitest` from `3.2.4` to `4.1.11` and declaring `vite-node` `6.0.0` explicitly; `npm audit` reports no vulnerabilities for runtime and development dependencies. `@earendil-works/pi-coding-agent` remains pinned at `0.87.0`.

### Compatibility

- Verified against Pi `0.87.0`.
- Other Pi versions have not been run.

### Known limitations

- The `Proactive` `waitingTurnReminder` is declared but never emitted: Pi `0.87.0` exposes no waiting-only hook, so it fails closed with no polling, timer, or prompt substitute.
- Cross-plugin force interoperability has not been run and is not provided as a claim.

## [0.1.0] - 2026-09-23

This release contains the implemented output-style extension from the initial development fronts.

### Added

- Five built-in styles: `default`, `Proactive`, `Concise`, `Explanatory`, and `Learning`.
- The `/output-style` command for listing, inspecting, and selecting styles.
- Active-style injection into Pi's chained system prompt.
- Atomic, lock-protected persistence in the extension-owned `<agentDir>/pi-output-styles.selection.json` file.
- Turn-start reminders and `keep-coding-instructions` composition.
- User and project custom styles with the precedence `built-in < user < project`.
- A process-local API for temporarily forcing a style.

### Compatibility

- Verified against Pi `0.87.0`.
- Other Pi versions have not been run.

### Known limitations

- The waiting-turn reminder is fail-closed because Pi `0.87.0` does not expose a verified waiting-only hook. The extension does not emulate one with polling, timers, or another substitute.
- Cross-plugin force interoperability has not been run and is not provided as a claim.
- The npm package for this release is `pi-response-styles`. The npm name `pi-output-styles` is occupied by an unrelated third-party package (`LoneExile/pi-output-styles`, latest `0.3.4`); install this project only from `pi-response-styles`.

### Security status

- Runtime dependency audit: no vulnerabilities reported by `npm audit --omit=dev`.
- Development-only dependency alerts remain open: one critical Vitest alert (`GHSA-5xrq-8626-4rwp` / `CVE-2026-47429`) and two moderate GitHub alerts for Vitest and `@vitest/mocker` (`GHSA-82fw-gwwq-j7x9` / `CVE-2026-84373`). `npm audit` reports one critical and one moderate vulnerability because the repeated dependency alert is aggregated. These dependencies were not changed in this preparation.
