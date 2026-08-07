import { win32 } from "node:path";

import { describe, expect, it } from "vitest";

import { createNodeCliNameResolver } from "./nodeCliName";

function createFixture(manifests: Record<string, unknown | string>) {
  const files = new Map(
    Object.entries(manifests).map(([path, manifest]) => [
      win32.normalize(path).toLowerCase(),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest)
    ])
  );
  const reads: string[] = [];

  return {
    reads,
    resolve: createNodeCliNameResolver({
      readFile(path) {
        const normalized = win32.normalize(path).toLowerCase();
        reads.push(normalized);
        const content = files.get(normalized);
        if (content === undefined) {
          throw new Error("ENOENT");
        }
        return content;
      }
    })
  };
}

describe("createNodeCliNameResolver", () => {
  it("resolves exact npm bin names for Pi and Claude", () => {
    const { resolve } = createFixture({
      "C:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\package.json": {
        name: "@earendil-works/pi-coding-agent",
        bin: { pi: "dist/cli.js" }
      },
      "C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\package.json": {
        name: "@anthropic-ai/claude-code",
        bin: { claude: "cli.js" }
      }
    });

    expect(
      resolve(
        "node.exe",
        '"C:\\nvm4w\\nodejs\\node.exe" "C:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js"'
      )
    ).toBe("pi");
    expect(
      resolve(
        "node",
        'node "C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"'
      )
    ).toBe("claude");
  });

  it("uses the unscoped package name for string-form bin metadata", () => {
    const { resolve } = createFixture({
      "C:\\tools\\node_modules\\@scope\\runner\\package.json": {
        name: "@scope/runner",
        bin: "dist/run.mjs"
      }
    });

    expect(resolve("NODE.EXE", "node C:\\tools\\node_modules\\@scope\\runner\\dist\\run.mjs"))
      .toBe("runner");
  });

  it("ignores native processes and Node commands without an entry script", () => {
    const { resolve, reads } = createFixture({});

    expect(resolve("git.exe", "git status")).toBeNull();
    expect(resolve("node.exe", "node --inspect")).toBeNull();
    expect(resolve("node.exe")).toBeNull();
    expect(reads).toHaveLength(0);
  });

  it("rejects a package whose bin target does not match the running script", () => {
    const { resolve } = createFixture({
      "C:\\tools\\node_modules\\wrong-target\\package.json": {
        name: "wrong-target",
        bin: { wrong: "other.js" }
      }
    });

    expect(resolve("node.exe", "node C:\\tools\\node_modules\\wrong-target\\cli.js"))
      .toBeNull();
  });

  it("ignores invalid package manifests", () => {
    const { resolve } = createFixture({
      "C:\\tools\\node_modules\\broken\\package.json": "{not-json"
    });

    expect(resolve("node.exe", "node C:\\tools\\node_modules\\broken\\cli.cjs"))
      .toBeNull();
  });

  it("caches successful and unsuccessful script resolutions", () => {
    const success = createFixture({
      "C:\\tools\\node_modules\\runner\\package.json": {
        name: "runner",
        bin: { run: "cli.js" }
      }
    });
    const successCommand = "node C:\\tools\\node_modules\\runner\\cli.js";

    expect(success.resolve("node.exe", successCommand)).toBe("run");
    const successfulReadCount = success.reads.length;
    expect(success.resolve("node.exe", successCommand)).toBe("run");
    expect(success.reads).toHaveLength(successfulReadCount);

    const missing = createFixture({});
    const missingCommand = "node C:\\tools\\missing\\cli.js";
    expect(missing.resolve("node.exe", missingCommand)).toBeNull();
    const missingReadCount = missing.reads.length;
    expect(missing.resolve("node.exe", missingCommand)).toBeNull();
    expect(missing.reads).toHaveLength(missingReadCount);
  });
});
