// Stages the ghostty-host build output where electron-builder can actually
// find it, and fails loudly when it cannot.
//
// electron-builder.yml used to name the source directly as
// `from: "${env.GHOSTTY_HOST_DIST}"`. That silently packaged nothing whenever
// the variable held an absolute path: app-builder-lib resolves a `from`
// against the project directory *before* it expands the macro, so
// `path.resolve(appsDesktop, "${env.GHOSTTY_HOST_DIST}")` produces
// `apps\desktop\${env.GHOSTTY_HOST_DIST}` and expansion then yields
// `apps\desktop\C:\...\zig-out\bin`. A `from` that does not exist is a
// warning, not an error, so the build succeeded and shipped an app whose
// terminal could never start. Copying into a fixed relative directory first
// sidesteps the resolution order entirely.
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// Must stay in step with electron-builder.yml's extraResources `from`.
const stagingDir = path.join(desktopRoot, "build", "ghostty-host");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const source = process.env.GHOSTTY_HOST_DIST;
if (!source) {
  fail(
    "GHOSTTY_HOST_DIST is not set. Point it at the ghostty-host build output " +
      "(ghostty-host.exe + mesa/) before packaging."
  );
}

if (!existsSync(source) || !statSync(source).isDirectory()) {
  fail(`GHOSTTY_HOST_DIST=${source} is not a directory`);
}

if (!existsSync(path.join(source, "ghostty-host.exe"))) {
  fail(`GHOSTTY_HOST_DIST=${source} does not contain ghostty-host.exe`);
}

// Pointing the variable at the staging directory itself passes every check
// above and then wipes the source out from under the copy, shipping nothing.
if (path.resolve(source) === stagingDir) {
  fail(
    `GHOSTTY_HOST_DIST=${source} is the staging directory itself; point it at the ` +
      "ghostty-host build output instead."
  );
}

// Only what the host needs at runtime. A zig build output also holds debug
// symbols and the standalone ghostty/embed-harness executables, which together
// added ~199 MB to the installer — nearly doubling it — for files the app never
// opens.
const RUNTIME_FILES = ["ghostty-host.exe", "ghostty-vt.dll"];
const RUNTIME_DIRS = ["mesa"];

// A stale staging directory would quietly ship an old host alongside a new
// build, so it is replaced rather than merged into.
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

const staged = [];
for (const name of RUNTIME_FILES) {
  const from = path.join(source, name);
  if (!existsSync(from)) {
    continue;
  }
  cpSync(from, path.join(stagingDir, name));
  staged.push(name);
}
for (const name of RUNTIME_DIRS) {
  const from = path.join(source, name);
  if (!existsSync(from) || !statSync(from).isDirectory()) {
    continue;
  }
  cpSync(from, path.join(stagingDir, name), { recursive: true });
  staged.push(`${name}/`);
}

console.log(`Staged ghostty host from ${source} to ${stagingDir}: ${staged.join(", ")}`);
