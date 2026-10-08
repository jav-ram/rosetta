// A Node worker thread that serves the parser, for tests. It uses the real worker loop
// (dist/worker-core.js) with a loader that reads the files from disk.
import { readFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { instantiate, serve } from "../../dist/worker-core.js";

const loader = async (wasmUrl, wasmExecUrl) => {
  await import(wasmExecUrl);
  return instantiate(readFileSync(fileURLToPath(wasmUrl)));
};
serve(parentPort, loader);
