#!/usr/bin/env node
// Keeps the book-writing skill (skills/rosetta-book-writing) self-contained: it carries its own copy of the parser and the spec,
// so it can be installed away from this repository. Run it after the parser or the spec changes.
//
//   node scripts/sync-skill.mjs            builds the parser, copies it and the spec into the skill, writes vendor/VERSION
//   node scripts/sync-skill.mjs --no-build copies what is already built
//   node scripts/sync-skill.mjs --package  also zips the skill to skills/dist/rosetta-book-writing.skill (needs `zip`)

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/rosetta-book-writing");
const args = process.argv.slice(2);
const run = (cmd, argv, options = {}) => {
  const r = spawnSync(cmd, argv, { cwd: root, encoding: "utf8", stdio: options.quiet ? "pipe" : "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} failed${r.stderr ? `: ${r.stderr}` : ""}`);
  return r.stdout ?? "";
};

if (!args.includes("--no-build")) run("pnpm", ["--filter", "@rosetta/parser-wasm", "run", "build:wasm"], {});

const dist = join(root, "packages/parser-wasm/dist");
const vendor = join(skill, "scripts/vendor");
mkdirSync(vendor, { recursive: true });
copyFileSync(join(dist, "rosetta.wasm"), join(vendor, "rosetta.wasm"));
copyFileSync(join(dist, "wasm_exec.js"), join(vendor, "wasm_exec.js"));
copyFileSync(join(root, "packages/spec/ROSETTA_SPEC.md"), join(skill, "references/spec.md"));

const version = (p) => JSON.parse(readFileSync(join(root, p), "utf8")).version;
const commit = run("git", ["rev-parse", "--short", "HEAD"], { quiet: true }).trim();
const dirty = run("git", ["status", "--porcelain", "--", "packages/parser", "packages/parser-wasm", "packages/contracts", "packages/spec"], { quiet: true }).trim() ? " (with uncommitted changes)" : "";
writeFileSync(
  join(vendor, "VERSION"),
  `Rosetta parser and spec, as vendored into this skill.\n` +
    `spec:     @rosetta/spec ${version("packages/spec/package.json")} (Rosetta Markdown 0.1)\n` +
    `parser:   @rosetta/parser ${version("packages/parser/package.json")}, @rosetta/parser-wasm ${version("packages/parser-wasm/package.json")}\n` +
    `contracts (component definitions): @rosetta/contracts ${version("packages/contracts/package.json")}\n` +
    `from commit ${commit}${dirty}\n`,
);
console.log(`Skill updated from commit ${commit}${dirty}.`);

if (args.includes("--package")) {
  const out = join(root, "skills/dist");
  mkdirSync(out, { recursive: true });
  const file = join(out, "rosetta-book-writing.skill");
  spawnSync("rm", ["-f", file]);
  const r = spawnSync("zip", ["-qr", file, "rosetta-book-writing", "-x", "*.DS_Store"], { cwd: join(root, "skills"), stdio: "inherit" });
  if (r.status !== 0) throw new Error("zip failed (is `zip` installed?)");
  console.log(`Packaged ${file}`);
}
