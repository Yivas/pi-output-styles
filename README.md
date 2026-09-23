# pi-output-styles

Switchable response styles for Pi, implemented as a Pi extension. It provides built-in and user- or project-defined instructions for coding-agent work.

**Status:** release `v0.2.0`. Compatibility has been verified against Pi 0.87.0 only.

**Navigation:** [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [License](LICENSE) · [Releases](https://github.com/yivas/pi-output-styles/releases)

## Problem and scope

Pi does not provide an integrated way to select and persist a response style while keeping project instructions separate. `pi-output-styles` provides built-in style instructions defined in the extension and loads custom style instructions from user and project Markdown files. It provides a selection command, persists the selected style, and applies it to the system prompt through Pi's extension API.

The extension decides which style instructions to apply. It does not change the model, provider, reasoning, or permissions. It does not integrate other plugins or subagents, and it does not add telemetry or functional network access.

## Implemented capabilities

The repository currently includes:

- Five built-in styles: `default`, `Proactive`, `Concise`, `Explanatory`, and `Learning`.
- The `/output-style` command for listing styles, showing status, and selecting a style.
- Injection of the active style into Pi's chained system prompt.
- Persistence of the selected style in the extension-owned `<agentDir>/pi-output-styles.selection.json` file.
- Turn-start reminders and the `keep-coding-instructions` behavior.
- Custom styles from the user and project directories, with precedence `built-in < user < project`.
- A process-local API for temporarily forcing a style. Cross-plugin force interoperability has not been run and is not provided as a claim.

The waiting-turn reminder is fail-closed: Pi 0.87.0 does not expose a verified hook for waiting-only background work, so the extension does not emulate one with polling, timers, or other substitutes.

## Status and compatibility

The extension is executable and covered by the repository's local checks. The verified compatibility baseline is Pi `0.87.0`; other Pi versions have not been run. Installation of `pi-response-styles@0.2.0` from the npm registry has been verified.

## Installation

The npm package `pi-response-styles` is published as `0.2.0`, its first npm version; the repository and product keep the name `pi-output-styles`. The current release is `v0.2.0` on GitHub and npm.

## Security and privacy

See [SECURITY.md](SECURITY.md) for the reporting process and the product's security boundaries.

The extension does not collect telemetry or open network connections. User and project styles are text instructions, not executable code. Treat their contents as untrusted input: they can influence responses, but they are not a security boundary and must not contain secrets.

## Documentation, support, and contribution

The implementation details and verified compatibility limits are documented in [docs/compatibility.md](docs/compatibility.md). Issues and pull requests are welcome through the repository's public channels. For questions or non-security problems, use the project's [issue tracker](https://github.com/yivas/pi-output-styles/issues). Security reports must follow [SECURITY.md](SECURITY.md).

This is open source collaborative software under the MIT License.

Copyright (c) 2026 Yivas. See [LICENSE](LICENSE) for the full license text.
