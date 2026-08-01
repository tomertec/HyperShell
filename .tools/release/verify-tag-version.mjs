// Guards the release workflows: a `v*` tag must agree with the versions actually
// committed at that ref, otherwise the tag, installer filename, latest.yml
// `version`, and the in-app version all disagree and auto-update breaks.
//
// Usage:
//   node .tools/release/verify-tag-version.mjs --ref-name v0.2.6
//   node .tools/release/verify-tag-version.mjs            # versions-match check only
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

function readVersion(packagePath) {
  const absolutePath = path.resolve(process.cwd(), packagePath);
  const packageJson = JSON.parse(readFileSync(absolutePath, "utf8"));
  return packageJson.version;
}

const args = parseArgs(process.argv.slice(2));
const refName =
  typeof args["ref-name"] === "string"
    ? args["ref-name"]
    : process.env.GITHUB_REF_NAME ?? "";

const errors = [];
const rootVersion = readVersion("package.json");

// 1. Every workspace package must carry the same version. release:prepare keeps
//    them in lockstep, but a hand-edited bump can easily miss one.
for (const packagePath of WORKSPACE_PACKAGE_PATHS) {
  const version = readVersion(packagePath);

  if (version !== rootVersion) {
    errors.push(
      `${packagePath} is at ${version} but package.json is at ${rootVersion}.`
    );
  }
}

// 2. A tag ref must be exactly `v` + that version. workflow_dispatch runs and
//    non-tag refs skip this check — they publish nothing tag-named.
const isTagRef = refName.startsWith("v");

if (isTagRef) {
  const expectedTag = `v${rootVersion}`;

  if (refName !== expectedTag) {
    errors.push(
      `Tag ${refName} does not match the committed version. Expected ${expectedTag}. ` +
        `Delete the tag, run 'pnpm release:prepare --version <x.y.z>', commit, then re-tag.`
    );
  }
} else if (refName) {
  console.log(`Ref '${refName}' is not a v* tag; skipping tag/version match.`);
} else {
  console.log("No ref name supplied; skipping tag/version match.");
}

if (errors.length > 0) {
  console.error("Release version verification failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

// 3. Exercise the release-preparation tool in dry-run mode so a broken CHANGELOG
//    (missing [Unreleased], no section for this version) fails here rather than
//    after a full package-and-publish run.
execFileSync(
  process.execPath,
  [
    path.resolve(process.cwd(), ".tools/release/prepare-version-and-changelog.mjs"),
    "--version",
    rootVersion,
    "--dry-run"
  ],
  { stdio: "inherit" }
);

console.log(
  `Version verification passed: all workspaces at ${rootVersion}${
    isTagRef ? `, tag ${refName} matches` : ""
  }.`
);
