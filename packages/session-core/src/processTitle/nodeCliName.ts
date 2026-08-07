import { readFileSync } from "node:fs";
import { win32 } from "node:path";

export interface NodeCliNameDeps {
  readFile(path: string): string;
}

export type NodeCliNameResolver = (
  processName: string,
  commandLine?: string
) => string | null;

interface PackageManifest {
  name: string;
  bin: string | Record<string, string>;
}

const NODE_SCRIPT_EXTENSION = /\.(?:c|m)?js$/i;

function tokenize(commandLine: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(commandLine)) !== null) {
    tokens.push(match[1] ?? match[2]);
  }

  return tokens;
}

function findEntryScript(commandLine: string): string | null {
  const tokens = tokenize(commandLine);

  for (const token of tokens.slice(1)) {
    if (win32.isAbsolute(token) && NODE_SCRIPT_EXTENSION.test(token)) {
      return win32.normalize(token);
    }
  }

  return null;
}

function parseManifest(value: string): PackageManifest | null {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as { name?: unknown; bin?: unknown };
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    return null;
  }

  if (typeof candidate.bin === "string") {
    return { name: candidate.name, bin: candidate.bin };
  }

  if (!candidate.bin || typeof candidate.bin !== "object" || Array.isArray(candidate.bin)) {
    return null;
  }

  const entries = Object.entries(candidate.bin);
  if (entries.some(([, target]) => typeof target !== "string")) {
    return null;
  }

  return {
    name: candidate.name,
    bin: Object.fromEntries(entries) as Record<string, string>
  };
}

function samePath(left: string, right: string): boolean {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
}

function unscopedPackageName(name: string): string | null {
  const part = name.split("/").at(-1);
  return part && part.length > 0 ? part : null;
}

function findBinName(
  manifest: PackageManifest,
  manifestDirectory: string,
  entryScript: string
): string | null {
  if (typeof manifest.bin === "string") {
    return samePath(win32.resolve(manifestDirectory, manifest.bin), entryScript)
      ? unscopedPackageName(manifest.name)
      : null;
  }

  for (const [name, target] of Object.entries(manifest.bin)) {
    if (name.length > 0 && samePath(win32.resolve(manifestDirectory, target), entryScript)) {
      return name;
    }
  }

  return null;
}

export function createNodeCliNameResolver(
  deps: NodeCliNameDeps = {
    readFile: (path) => readFileSync(path, "utf8")
  }
): NodeCliNameResolver {
  const cache = new Map<string, string | null>();

  return (processName, commandLine) => {
    if (processName.replace(/\.exe$/i, "").toLowerCase() !== "node" || !commandLine) {
      return null;
    }

    const entryScript = findEntryScript(commandLine);
    if (!entryScript) {
      return null;
    }

    const cacheKey = entryScript.toLowerCase();
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) ?? null;
    }

    let directory = win32.dirname(entryScript);
    let result: string | null = null;

    while (true) {
      try {
        const manifest = parseManifest(deps.readFile(win32.join(directory, "package.json")));
        if (manifest) {
          result = findBinName(manifest, directory, entryScript);
          if (result) {
            break;
          }
        }
      } catch {
        // Missing, inaccessible, and invalid manifests all degrade to the runtime name.
      }

      const parent = win32.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }

    cache.set(cacheKey, result);
    return result;
  };
}
