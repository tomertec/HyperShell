import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const WORKSPACE_PACKAGE_PATHS = [
  "package.json",
  "apps/desktop/package.json",
  "apps/ui/package.json",
  "packages/db/package.json",
  "packages/session-core/package.json",
  "packages/shared/package.json"
];

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
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function isSemverLike(version) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function updateWorkspaceVersions(version, dryRun) {
  for (const packagePath of WORKSPACE_PACKAGE_PATHS) {
    const absolutePath = path.resolve(process.cwd(), packagePath);
    const packageJson = JSON.parse(readFileSync(absolutePath, "utf8"));

    if (packageJson.version === version) {
      console.log(`No version change needed for ${packagePath}`);
      continue;
    }

    packageJson.version = version;

    if (!dryRun) {
      writeFileSync(
        absolutePath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
        "utf8"
      );
    }

    console.log(
      `${dryRun ? "Would update" : "Updated"} ${packagePath} to ${version}`
    );
  }
}

function promoteChangelog(version, dryRun) {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");

  if (!changelog.includes("## [Unreleased]")) {
    throw new Error("CHANGELOG.md is missing the '## [Unreleased]' section.");
  }

  if (changelog.includes(`## [${version}]`)) {
    console.log(`CHANGELOG.md already contains a section for ${version}, skipping.`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated = changelog.replace(
    "## [Unreleased]",
    `## [Unreleased]\n\n## [${version}] - ${today}`
  );

  if (!dryRun) {
    writeFileSync(changelogPath, updated, "utf8");
  }

  console.log(
    `${dryRun ? "Would promote" : "Promoted"} [Unreleased] → [${version}] - ${today} in CHANGELOG.md`
  );
}

const args = parseArgs(process.argv.slice(2));
const version = typeof args.version === "string" ? args.version : "";
const dryRun = Boolean(args["dry-run"]);

if (!version) {
  throw new Error("Missing required argument --version <x.y.z>");
}

if (!isSemverLike(version)) {
  throw new Error(`Invalid version '${version}'. Expected semver-like format.`);
}

updateWorkspaceVersions(version, dryRun);
promoteChangelog(version, dryRun);

console.log(
  `${dryRun ? "Dry run complete." : "Release prep complete."} Next: curate CHANGELOG.md and run packaging flows.`
);
