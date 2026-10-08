// Bundles the TypeScript client and worker into plain ES modules in dist/, so they can be loaded
// by a browser (or a Node worker thread) without a build tool:
//   dist/index.js        the client (createParser, instantiate)
//   dist/worker.js       the Web Worker entry
//   dist/worker-core.js  the worker's message loop, for tests with other kinds of workers
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: ["index", "worker", "worker-core"].map((n) => join(root, "src", `${n}.ts`)),
  outdir: join(root, "dist"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "warning",
});
console.log("bundled dist/index.js, dist/worker.js, dist/worker-core.js");
