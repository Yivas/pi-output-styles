# Changelog

All notable changes to `pi-output-styles` are documented here.

## Unreleased

Release decision pending. The `v0.1.0` section below is a candidate only and has not been published.

## v0.1.0 (candidate — not published)

This candidate contains the implemented output-style extension from the initial development fronts.

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
- The npm name `pi-output-styles` is occupied by an unrelated third-party package (`LoneExile/pi-output-styles`, latest `0.3.4`). This project has no npm publication; the npm channel remains unresolved and this candidate must not be installed from that name.

### Security status

- Runtime dependency audit: no vulnerabilities reported by `npm audit --omit=dev`.
- Development-only dependency alerts remain open: one critical Vitest alert (`GHSA-5xrq-8626-4rwp` / `CVE-2026-47429`) and two moderate GitHub alerts for Vitest and `@vitest/mocker` (`GHSA-82fw-gwwq-j7x9` / `CVE-2026-84373`). `npm audit` reports one critical and one moderate vulnerability because the repeated dependency alert is aggregated. These dependencies were not changed in this preparation.
