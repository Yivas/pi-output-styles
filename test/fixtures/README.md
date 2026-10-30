# Test fixtures

Fixtures in this directory are synthetic, local-only inputs for integration probes. They must not contain credentials, private prompts, real project configuration, or network endpoints.

`prompt-event.ts` constructs the normalized event and getter using the pinned Pi dependency's renderer. `prompt-session-probe.mjs` exercises the real loader, runner, session, and Anthropic serializer. Its key is a synthetic placeholder in an in-memory store; payload capture aborts before sending, and `fetch` is disabled. The probe cleans its temporary files on exit. `PI_PACKAGE_DIR` selects an already installed Pi package for the same checks without replacing repository dependencies.
