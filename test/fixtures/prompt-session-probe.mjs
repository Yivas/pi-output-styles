import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const packageDirectory = resolve(process.env.PI_PACKAGE_DIR ?? "node_modules/@earendil-works/pi-coding-agent");
const require = createRequire(join(packageDirectory, "package.json"));
const load = (path) => import(pathToFileURL(path).href);
const pi = await load(join(packageDirectory, "dist/index.js"));
const aiDirectory = require.resolve.paths("@earendil-works/pi-ai")
  .map((path) => join(path, "@earendil-works/pi-ai"))
  .find((path) => existsSync(join(path, "dist/index.js")));
assert.ok(aiDirectory);
const aiPath = join(aiDirectory, "dist/index.js");
const ai = await load(aiPath);
const { getModel } = await load(join(dirname(aiPath), "compat.js"));
const { stream } = await load(join(dirname(aiPath), "api/anthropic-messages.js"));
const { buildSystemPrompt, buildSystemPromptSections, diffSystemPromptSections } =
  await load(join(packageDirectory, "dist/core/system-prompt.js"));
globalThis.fetch = async () => { throw new Error("Network is forbidden in this probe"); };
const directory = await mkdtemp(join(tmpdir(), "pi-output-styles-session-"));
let session;

try {
  const promptModule = pathToFileURL(resolve("src/prompt.ts")).href;
  const registryModule = pathToFileURL(resolve("src/styles/registry.ts")).href;
  const extensionPath = join(directory, "style-probe.ts");
  await writeFile(extensionPath, `import { registerSystemPromptHook } from ${JSON.stringify(promptModule)};
import { createBuiltinRegistry } from ${JSON.stringify(registryModule)};
export default function (pi) {
  let selected = "concise";
  const builtins = createBuiltinRegistry();
  const noCoding = { ...builtins.resolve("concise"), id: "no-coding", name: "No Coding", keepCodingInstructions: false };
  const registry = { list: () => [...builtins.list(), noCoding],
    resolve: (id) => id === "no-coding" ? noCoding : builtins.resolve(id) };
  pi.registerCommand("probe-style", { handler: async (args) => {
    selected = args;
    pi.events.emit("probe-style-selected", registry.resolve(selected));
  } });
  pi.on("before_agent_start", (event) => {
    if (event.prompt === "force-before-identical") return { systemPrompt: event.systemPrompt };
    if (event.prompt === "force-before-empty") return { systemPrompt: "" };
  });
  registerSystemPromptHook(pi, registry, () => selected);
  pi.on("before_agent_start", (event, ctx) => {
    if (event.systemPrompt !== ctx.getSystemPrompt()) throw new Error("Stale prompt getter");
    if (event.prompt === "force-after") return { systemPrompt: event.systemPrompt };
  });
}
`);
  let selectedStyle;
  const eventBus = pi.createEventBus();
  eventBus.on("probe-style-selected", (style) => { selectedStyle = style; });
  const loaded = await pi.discoverAndLoadExtensions([extensionPath], directory, directory, eventBus);
  assert.deepEqual(loaded.errors, []);
  const resourceLoader = {
    getExtensions: () => loaded,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources() {},
    async reload() {},
  };
  const modelRuntime = await pi.ModelRuntime.create({
    credentials: new ai.InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(directory, "models-store.json"),
    refreshOnCreate: false,
  });
  await modelRuntime.setRuntimeApiKey("anthropic", "synthetic-test-key");
  const model = getModel("anthropic", "claude-opus-4-8");
  assert.ok(model?.compat?.supportsMidConvoToolChanges);
  const sessionOptions = {
    cwd: directory,
    agentDir: directory,
    modelRuntime,
    model,
    thinkingLevel: "off",
    resourceLoader,
    tools: ["read", "bash"],
    settingsManager: pi.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
  };
  ({ session } = await pi.createAgentSession({ ...sessionOptions, sessionManager: pi.SessionManager.inMemory(directory) }));
  const bindings = { onError: (error) => { throw new Error(JSON.stringify(error)); } };
  await session.bindExtensions(bindings);
  const baseOptions = { cwd: directory, customPrompt: "Native instructions", sections: { unrelated: "Preserved section" } };
  const runHook = async (prompt) => {
    const runner = session.extensionRunner;
    const result = runner.emitBeforeAgentStart.length === 2
      ? await runner.emitBeforeAgentStart({ messageType: "user", prompt }, baseOptions)
      : await runner.emitBeforeAgentStart(prompt, undefined, baseOptions);
    return result.systemPromptOptions;
  };
  const normal = await runHook("normal");
  assert.equal(normal.forceSystemPrompt, undefined);
  assert.deepEqual(baseOptions.sections, { unrelated: "Preserved section" }, "Runner must copy options for each run");
  for (const prompt of ["force-before-identical", "force-before-empty", "force-after"]) {
    const forced = await runHook(prompt);
    assert.notEqual(forced.forceSystemPrompt, undefined);
    assert.equal(forced.forceSystemPrompt.split("## Output style: Concise").length - 1, 1);
    assert.equal(forced.forceSystemPrompt.split("## Coding instructions").length - 1, 1);
    if (prompt !== "force-before-empty") assert.ok(forced.forceSystemPrompt.includes("Preserved section"));
  }
  assert.equal((await runHook("normal")).forceSystemPrompt, undefined);
  const selectStyle = async (style) => {
    const runner = session.extensionRunner;
    await runner.getCommand("probe-style").handler(style, runner.createCommandContext());
  };
  await selectStyle("no-coding");
  const withoutCoding = await runHook("normal");
  assert.equal(withoutCoding.sections.pi_output_styles_coding, undefined);
  assert.ok(buildSystemPrompt(withoutCoding).includes("## Output style: No Coding"));
  const removedCoding = diffSystemPromptSections(buildSystemPromptSections(normal), buildSystemPromptSections(withoutCoding));
  assert.equal(removedCoding.pi_output_styles_coding, null);
  await selectStyle("default");
  const defaultOptions = await runHook("normal");
  assert.deepEqual(defaultOptions.sections, baseOptions.sections);
  const removedStyle = diffSystemPromptSections(buildSystemPromptSections(withoutCoding), buildSystemPromptSections(defaultOptions));
  assert.equal(removedStyle.pi_output_styles_style, null);
  for (const id of ["explanatory", "learning"]) {
    await selectStyle(id);
    const rendered = buildSystemPrompt(await runHook("normal"));
    assert.ok(rendered.includes(`## Output style: ${selectedStyle.name}\n\n${selectedStyle.instructions}`));
    assert.ok(rendered.includes(normal.sections.pi_output_styles_coding));
  }
  await selectStyle("concise");
  const reordered = buildSystemPrompt(await runHook("normal"));
  assert.ok(reordered.indexOf("## Coding instructions") < reordered.indexOf("## Output style: Concise"));
  session.setActiveToolsByName(["read"]);
  const payloads = [];
  session.agent.streamFunction = async (requestModel, context) => {
    let captured;
    const capture = stream(requestModel, context, {
      apiKey: "synthetic-test-key",
      onPayload(payload) {
        captured = globalThis.structuredClone(payload);
        throw new Error("Captured before network access");
      },
    });
    for await (const event of capture) {
      assert.notEqual(event.type, "done", "The transport must stop before sending");
    }
    assert.ok(captured, "Anthropic serialization must reach onPayload");
    payloads.push(captured);
    const response = {
      role: "assistant", api: model.api, provider: model.provider, model: model.id,
      content: [{ type: "text", text: "ok" }], stopReason: "stop", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    };
    const result = ai.createAssistantMessageEventStream();
    result.push({ type: "done", reason: "stop", message: response });
    result.end(response);
    return result;
  };
  await session.prompt("First synthetic request");
  session.setActiveToolsByName(["read", "bash"]);
  await session.prompt("Second synthetic request");
  assert.equal(payloads.length, 2);
  const [before, after] = payloads;
  assert.deepEqual(after.tools.slice(0, before.tools.length), before.tools,
    "Leading tools must not be rewritten after tool activation");
  assert.ok(after.tools.slice(before.tools.length).every((tool) => tool.defer_loading === true),
    "New declarations may only extend the deferred tail");
  assert.deepEqual(after.system, before.system, "Leading system must remain byte-equivalent");
  const conversationText = (messages) => JSON.stringify(messages,
    (key, value) => key === "cache_control" ? undefined : value);
  assert.equal(conversationText(after.messages.slice(0, before.messages.length)), conversationText(before.messages),
    "Previous conversation must remain a prefix (cache markers may move)");
  assert.ok(JSON.stringify(after.messages).includes("bash"), "The newly enabled tool must reach the request delta");
  const serialized = JSON.stringify(after);
  assert.equal(serialized.split("## Output style: Concise").length - 1, 1);
  assert.equal(serialized.split("## Coding instructions").length - 1, 1);
  const encodedStyle = JSON.stringify(selectedStyle.instructions).slice(1, -1);
  const encodedCoding = JSON.stringify(normal.sections.pi_output_styles_coding).slice(1, -1);
  assert.equal(serialized.split(encodedStyle).length - 1, 1, "Complete style body must reach the provider once");
  assert.equal(serialized.split(encodedCoding).length - 1, 1, "Complete coding block must reach the provider once");
  await selectStyle("no-coding");
  await session.prompt("Remove the owned coding section");
  assert.equal(session.messages.filter((message) => message.role === "system").at(-1).sections.pi_output_styles_coding, null);
  assert.equal(ai.getCurrentSystemMessage(session.messages).sections.pi_output_styles_coding, undefined);
  assert.deepEqual(payloads.at(-1).system, before.system);
  await selectStyle("default");
  await session.prompt("Remove the style section");
  assert.equal(session.messages.filter((message) => message.role === "system").at(-1).sections.pi_output_styles_style, null);
  assert.equal(ai.getCurrentSystemMessage(session.messages).sections.pi_output_styles_style, undefined);
  assert.deepEqual(payloads.at(-1).system, before.system);
  await selectStyle("concise");
  const legacyManager = pi.SessionManager.inMemory(directory);
  const originalHead = session.messages.find((message) => message.role === "system");
  legacyManager.appendMessage({ ...originalHead,
    sections: Object.fromEntries(Object.entries(originalHead.sections).filter(([name]) => !name.startsWith("pi_output_styles_"))) });
  legacyManager.appendMessage(session.messages.find((message) => message.role === "user"));
  legacyManager.appendMessage(session.messages.find((message) => message.role === "assistant"));
  const streamFunction = session.agent.streamFunction;
  session.dispose();
  ({ session } = await pi.createAgentSession({ ...sessionOptions, sessionManager: legacyManager }));
  await session.bindExtensions(bindings);
  session.agent.streamFunction = streamFunction;
  await session.prompt("Resume synthetic legacy session");
  const resumed = payloads.at(-1);
  assert.equal(JSON.stringify(resumed).split("## Output style: Concise").length - 1, 1);
  session.setActiveToolsByName(["read", "bash"]);
  await session.prompt("Add tool after legacy migration");
  assert.deepEqual(payloads.at(-1).system, resumed.system);
  assert.deepEqual(payloads.at(-1).tools.slice(0, resumed.tools.length), resumed.tools);
  process.stdout.write(`${JSON.stringify({ version: require("./package.json").version,
    toolsBefore: before.tools.map((tool) => tool.name), toolsAfter: after.tools.map((tool) => tool.name),
    prefixPreserved: true, styleOccurrences: 1, runnerContracts: true, legacyResumed: true, networkRequests: 0 })}\n`);
} finally {
  session?.dispose();
  await rm(directory, { recursive: true, force: true });
}
