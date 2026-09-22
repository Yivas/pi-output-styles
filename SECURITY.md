# Security Policy

## Supported versions

No version has been published. The repository is scaffold only, so there is no supported release line yet.

| Version or line | Support status |
| --- | --- |
| None published | No supported release; scaffold only |

## Scope and product boundaries

`pi-output-styles` is planned as a Pi plugin that selects and applies response-style instructions. It does not change the model, provider, reasoning, or permissions. It does not integrate other plugins or subagents, and it will not add telemetry or functional network access.

Style contents are treated as untrusted input. The planned plugin will inject them as instructions that can influence responses; it will not execute them as code or treat them as a security boundary. Do not put credentials, tokens, private prompts, or other secrets in a style file.

The following are outside the product's security model:

- Protecting a user from the effects of instructions they chose to place in a style file.
- Guaranteeing priority over other instructions or isolation from other extensions.
- Protecting secrets that a user stores in a style file or supplies through their own project configuration.

## Reporting a vulnerability

Report security issues through the repository's GitHub security channel:

<https://github.com/yivas/pi-output-styles>

This repository URL is the current project channel. Do not disclose sensitive vulnerability details in a public issue. Use the repository's private security reporting option when it is available.

A useful report should include:

- The version or commit tested. If none is published, state that the report concerns the scaffold or a local commit.
- The environment, including the Pi version, operating system, and relevant runtime details.
- A minimal, sanitized reproduction.
- The security impact and affected behavior.
- A workaround, if one is known.

Remove or redact credentials, tokens, private prompts, personal or repository identifiers, real configuration, and logs before sending a report. Do not attach secrets or unredacted user or project content.

## After a report

The maintainers will review the report, request additional sanitized information if needed, and investigate the reported behavior. Follow-up actions may include preparing a fix, documenting a mitigation, or publishing additional details after the issue can be discussed safely.

This project does not promise a response time, a CVE, a reward, or a private embargo. Do not assume that a report will receive any of those outcomes.
