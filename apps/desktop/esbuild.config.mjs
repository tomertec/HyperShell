import { build } from "esbuild";

const banner = `
import { fileURLToPath as __esbuild_fileURLToPath } from "node:url";
import { dirname as __esbuild_dirname } from "node:path";
import { createRequire as __esbuild_createRequire } from "node:module";
const __filename = __esbuild_fileURLToPath(import.meta.url);
const __dirname = __esbuild_dirname(__filename);
const require = __esbuild_createRequire(import.meta.url);
`;

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  loader: {
    ".sql": "text",
  },
  external: [
    "electron",
    "better-sqlite3",
    "node-pty",
    "serialport",
    "@serialport/bindings-cpp",
  ],
};

await Promise.all([
  build({
    ...common,
    format: "esm",
    banner: { js: banner },
    entryPoints: ["src/main/main.ts"],
    outfile: "dist/main/main.js",
  }),
  build({
    ...common,
    format: "esm",
    banner: { js: banner },
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload/index.js",
  }),
  build({
    ...common,
    format: "cjs",
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload/index.cjs",
  }),
]);
