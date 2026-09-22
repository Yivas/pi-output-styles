# Security Policy

## Supported versions

No package or release has been published. Security reports are accepted for the current repository commits; the only verified Pi compatibility baseline is `0.87.0`.

| Version or line | Support status |
| --- | --- |
| Current repository commits (unreleased) | Security reports accepted; compatibility checked against Pi `0.87.0` only |
| Published releases | None |

## Scope and product boundaries

`pi-output-styles` is an implemented Pi extension that selects and applies response-style instructions. It includes built-in styles, the `/output-style` command, system-prompt injection, selection persistence, turn-start reminders, `keep-coding-instructions`, custom user and project styles, and a process-local forced-style API. Custom styles take precedence in the order built-in, user, then project.

The extension does not change the model, provider, reasoning, or permissions. It does not integrate other plugins or subagents, and it does not add telemetry or functional network access. The waiting-turn reminder is fail-closed because Pi `0.87.0` exposes no verified waiting-only hook. Cross-plugin force interoperability has not been run; forced styles are process-local.

Style contents are treated as untrusted input. The extension injects them as instructions that can influence responses; it does not execute them as code or treat them as a security boundary. Do not put credentials, tokens, private prompts, or other secrets in a style file.

The following are outside the product's security model:

- Protecting a user from the effects of instructions they chose to place in a style file.
- Guaranteeing priority over other instructions or isolation from other extensions.
- Protecting secrets that a user stores in a style file or supplies through their own project configuration.

## Reporting a vulnerability

Report security issues through the repository's GitHub security channel:

<https://github.com/yivas/pi-output-styles>

Do not disclose sensitive vulnerability details in a public issue. Use the repository's [private security advisory channel](https://github.com/yivas/pi-output-styles/security/advisories/new) instead.

A useful report should include:

- The version or commit tested. No release is published, so identify the repository commit.
- The environment, including the Pi version, operating system, and relevant runtime details.
- A minimal, sanitized reproduction.
- The security impact and affected behavior.
- A workaround, if one is known.

Remove or redact credentials, tokens, private prompts, personal or repository identifiers, real configuration, and logs before sending a report. Do not attach secrets or unredacted user or project content.

## After a report

The maintainers will review the report, request additional sanitized information if needed, and investigate the reported behavior. Follow-up actions may include preparing a fix, documenting a mitigation, or publishing additional details after the issue can be discussed safely.

This project does not promise a response time, a CVE, a reward, or a private embargo. Do not assume that a report will receive any of those outcomes.
