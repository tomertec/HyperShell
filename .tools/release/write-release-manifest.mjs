import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function listFilesRecursively(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(rootDir, entryPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push(path.relative(rootDir, entryPath));
  }

  return files;
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const artifactsDir = path.resolve(process.cwd(), args["artifacts-dir"] ?? "release");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..", "..");
const rootPackageJsonPath = path.join(workspaceRoot, "package.json");

const { version } = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"));

mkdirSync(artifactsDir, { recursive: true });

const artifactFiles = listFilesRecursively(artifactsDir)
  .filter((relativePath) => {
    return !["SHA256SUMS.txt", "release-manifest.json"].includes(relativePath);
  })
  .sort((left, right) => left.localeCompare(right));

const artifacts = artifactFiles.map((relativePath) => {
  const absolutePath = path.join(artifactsDir, relativePath);
  return {
    file: relativePath,
    sizeBytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath)
  };
});

const checksumsContent = artifacts
  .map((artifact) => `${artifact.sha256}  ${artifact.file}`)
  .join("\n");

writeFileSync(
  path.join(artifactsDir, "SHA256SUMS.txt"),
  checksumsContent.length > 0 ? `${checksumsContent}\n` : "",
  "utf8"
);

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  artifacts
};

writeFileSync(
  path.join(artifactsDir, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(
  `Wrote release-manifest.json and SHA256SUMS.txt in ${artifactsDir} (${artifacts.length} artifacts)`
);
