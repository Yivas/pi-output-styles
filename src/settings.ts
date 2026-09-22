import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createBuiltinRegistry } from "./styles/registry.js";

export interface SelectionStore {
  read(): Promise<string | undefined>;
  write(styleId: string): Promise<void>;
}

export interface SelectionStoreOptions {
  validStyleIds?: readonly string[] | ReadonlySet<string> | ((styleId: string) => boolean);
  onError?: (error: Error) => void;
}

// Approved design deviation: Pi exposes no public writer for custom settings namespaces, so the
// extension-owned JSON file is kept outside settings.json and the Markdown style discovery folder.
const selectionFileName = "pi-output-styles.selection.json";
const selectionLockSuffix = ".lock";
const lockRetryDelayMs = 10;
const staleLockAgeMs = 30_000;
const writeQueues = new Map<string, Promise<void>>();

export function createSelectionStore(
  agentDirectoryOrOptions: string | SelectionStoreOptions = getAgentDir(),
  options: SelectionStoreOptions = {},
): SelectionStore {
  const agentDirectory = typeof agentDirectoryOrOptions === "string"
    ? agentDirectoryOrOptions
    : getAgentDir();
  const storeOptions = typeof agentDirectoryOrOptions === "string"
    ? options
    : agentDirectoryOrOptions;
  const selectionPath = join(agentDirectory, selectionFileName);
  const defaultStyleIds = createBuiltinRegistry().list().map((style) => style.id);
  const isValidStyleId = createStyleIdValidator(storeOptions.validStyleIds ?? defaultStyleIds);
  const reportError = storeOptions.onError ?? ((error: Error) => console.error(`[pi-output-styles] ${error.message}`));

  return {
    async read(): Promise<string | undefined> {
      let text: string;
      try {
        text = await readFile(selectionPath, "utf8");
      } catch (error) {
        if (isMissingFile(error)) {
          return undefined;
        }
        const readError = toSelectionError(`Could not read selection file ${selectionPath}`, error);
        reportError(readError);
        return undefined;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        const parseError = toSelectionError(`Could not parse selection file ${selectionPath}`, error);
        reportError(parseError);
        return undefined;
      }

      const styleId = readStyleId(parsed);
      if (!styleId) {
        const formatError = new Error(`Selection file ${selectionPath} must contain a string selectedStyle`);
        reportError(formatError);
        return undefined;
      }
      if (!isValidStyleId(styleId)) {
        const unknownStyleError = new Error(`Selection file ${selectionPath} contains unknown output style: ${styleId}`);
        reportError(unknownStyleError);
        return undefined;
      }
      return styleId;
    },

    write(styleId: string): Promise<void> {
      if (!isValidStyleId(styleId)) {
        const unknownStyleError = new Error(`Cannot persist unknown output style: ${styleId}`);
        reportError(unknownStyleError);
        return Promise.reject(unknownStyleError);
      }

      const previousWrite = writeQueues.get(selectionPath) ?? Promise.resolve();
      const currentWrite = previousWrite.catch(() => undefined).then(async () => {
        await mkdir(agentDirectory, { recursive: true });
        await withSelectionLock(`${selectionPath}${selectionLockSuffix}`, async () => {
          const temporaryPath = `${selectionPath}.${process.pid}.${randomUUID()}.tmp`;
          try {
            const contents = `${JSON.stringify({ selectedStyle: styleId }, null, 2)}\n`;
            await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
            await rename(temporaryPath, selectionPath);
          } catch (error) {
            await rm(temporaryPath, { force: true }).catch(() => undefined);
            const writeError = toSelectionError(`Could not write selection file ${selectionPath}`, error);
            reportError(writeError);
            throw writeError;
          }
        });
      });
      writeQueues.set(selectionPath, currentWrite);
      void currentWrite.then(
        () => removeWriteQueue(selectionPath, currentWrite),
        () => removeWriteQueue(selectionPath, currentWrite),
      );
      return currentWrite;
    },
  };
}

function createStyleIdValidator(
  validStyleIds: SelectionStoreOptions["validStyleIds"],
): (styleId: string) => boolean {
  if (!validStyleIds) {
    return () => true;
  }
  if (typeof validStyleIds === "function") {
    return validStyleIds;
  }
  return (styleId) => validStyleIds instanceof Set
    ? validStyleIds.has(styleId)
    : Array.from(validStyleIds).includes(styleId);
}

function readStyleId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const selectedStyle = (value as Record<string, unknown>).selectedStyle;
  return typeof selectedStyle === "string" && selectedStyle.length > 0 ? selectedStyle : undefined;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function toSelectionError(message: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${message}: ${detail}`, { cause });
}

function removeWriteQueue(path: string, write: Promise<void>): void {
  if (writeQueues.get(path) === write) {
    writeQueues.delete(path);
  }
}

async function withSelectionLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  await acquireSelectionLock(lockPath);
  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function acquireSelectionLock(lockPath: string): Promise<void> {
  while (true) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }

      try {
        const lockAge = Date.now() - (await stat(lockPath)).mtimeMs;
        if (lockAge > staleLockAgeMs) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (!isMissingFile(statError)) {
          throw statError;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, lockRetryDelayMs));
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
