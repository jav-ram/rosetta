// Builds dist/rosetta.wasm with standard Go, plus the matching wasm_exec.js and build-info.json.
// (TinyGo is not used: see "What was found trying TinyGo" in docs/benchmarks.md.)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(dist, "rosetta.wasm");
mkdirSync(dist, { recursive: true });

execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", out, "."], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GOOS: "js", GOARCH: "wasm" },
});
const goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
copyFileSync(join(goroot, "lib", "wasm", "wasm_exec.js"), join(dist, "wasm_exec.js"));

const bytes = statSync(out).size;
const gzipBytes = gzipSync(readFileSync(out)).length;
const version = execFileSync("go", ["version"], { encoding: "utf8" }).trim();
writeFileSync(join(dist, "build-info.json"), JSON.stringify({ compiler: "go", version, bytes, gzipBytes }, null, 2) + "\n");
console.log(`go: ${(bytes / 1048576).toFixed(2)} MB (${(gzipBytes / 1048576).toFixed(2)} MB gzipped) -> dist/rosetta.wasm`);
