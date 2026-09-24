`pi-output-styles` is open source collaborative software. The repository contains an executable extension, published as release `v0.6.2` on GitHub and as the npm package `pi-response-styles` version `0.6.2`. The verified Pi compatibility baseline is `0.87.0`; other Pi versions have not been run.

## What we accept

We welcome:

- Bug reports about verified behavior in the current implementation.
- Feature and design proposals.
- Documentation improvements.
- Pull requests for changes that fit the project scope.

For every contribution, use the channel that matches the work:

- [Report a bug](.github/ISSUE_TEMPLATE/bug-report.yml).
- [Propose a feature](.github/ISSUE_TEMPLATE/feature-request.yml), including documentation proposals that need discussion before implementation.
- Open a pull request for a focused documentation or code change that is ready for review.

## Before you contribute

- Search existing issues before opening a new one.
- Keep reports and changes limited to this project's scope: selecting and applying response-style instructions in Pi. The extension does not change the model, provider, reasoning, or permissions.
- Pi `0.87.0` is the only compatibility baseline verified by the repository checks. Do not assume or report compatibility with other Pi versions without testing it.
- Describe the smallest useful reproduction when software is involved. Include the expected and observed behavior, the tested version or commit, and the host environment.
- Remove credentials, tokens, private prompts, personal or repository identifiers, private configuration, and logs before submitting anything. Do not attach unredacted user or project content.

Do not use the general issue or pull request workflow for vulnerability reports. Follow [SECURITY.md](SECURITY.md) and use its private reporting channel instead.

## Pull requests

Pull requests are reviewed before they are merged. A useful pull request should:

1. Explain the change and why it belongs in the project.
2. Keep the scope focused and describe compatibility implications.
3. List the checks that were run. If no checks apply because the change is documentation-only, explain that clearly.
4. Update affected documentation and templates when their claims or links change.
5. Use a branch with a descriptive name and commits with descriptive messages. Do not add AI-generated metadata, agent tags, or co-author lines to commits.

See the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) for the information to include. There is no promise of acceptance or a review timeline.

## Community standards

By participating in issues, pull requests, discussions, or other project spaces, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
