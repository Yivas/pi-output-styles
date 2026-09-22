# pi-output-styles

Switchable response styles for Pi, with planned built-in and user- or project-defined instructions for coding-agent work.

**Status:** not implemented yet — v1 planned. Planning is complete, but implementation has not started. No version has been published.

**Navigation:** [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [License](LICENSE) · [Future releases](https://github.com/yivas/pi-output-styles/releases)

## Problem and scope

Pi does not currently provide an integrated way to select and persist a response style while keeping project instructions separate. `pi-output-styles` is planned as a Pi plugin that will manage style instructions stored in files, provide a selection command, persist the selected style, and apply it to the system prompt.

The plugin decides which style instructions to apply. It does not change the model, provider, reasoning, or permissions. It will not integrate other plugins or subagents. The project will not add telemetry or functional network access.

## Planned v1 capabilities

The following capabilities are planned for v1 and are not available in the current scaffold:

- Built-in response styles, including `default`, `Proactive`, `Concise`, `Explanatory`, and `Learning`.
- Custom styles defined by the user or by a project.
- A command for listing and switching styles during a session.
- Persistence of the selected style across sessions.
- Injection of the active style into Pi's system prompt.
- Per-turn reminders when the verified Pi extension API supports them.

Style text will be written independently for this project. It will not include literal prompts from other products.

## Status and compatibility

The repository is a scaffold only. The current status is **planning complete, implementation not started**. There is no executable software, published package, or released version to install.

The implementation will support the Pi version verified at implementation time. No Pi version is supported yet because implementation and compatibility testing have not started.

## Security and privacy

See [SECURITY.md](SECURITY.md) for the reporting process and the product's security boundaries.

The planned plugin will not collect telemetry or open network connections. User and project styles are text instructions, not executable code. Treat their contents as untrusted input: they can influence responses, but they are not a security boundary and must not contain secrets.

## Documentation, support, and contribution

This README and [SECURITY.md](SECURITY.md) are the available documentation for the scaffold. [CONTRIBUTING.md](CONTRIBUTING.md) will describe the contribution workflow when the community files are completed.

This is open source collaborative software under the MIT License. Issues and pull requests are welcome through the repository's public channels. For questions or non-security problems, use the project's [issue tracker](https://github.com/yivas/pi-output-styles/issues). Security reports must follow [SECURITY.md](SECURITY.md).

Copyright (c) 2026 Yivas. See [LICENSE](LICENSE) for the full license text.
