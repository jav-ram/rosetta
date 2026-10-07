#!/usr/bin/env node
// Creates Go module tags for every Go package (a directory with go.mod) from its package.json version.
// Go requires subdirectory modules to be tagged with the directory path: packages/parser/v1.4.0.
// Usage: node scripts/release.mjs [--dry-run] [--push]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dryRun = process.argv.includes("--dry-run");
const push = process.argv.includes("--push");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

export function goTags(packagesDir = join(root, "packages")) {
  return readdirSync(packagesDir)
    .filter((d) => existsSync(join(packagesDir, d, "go.mod")) && existsSync(join(packagesDir, d, "package.json")))
    .map((d) => `packages/${d}/v${JSON.parse(readFileSync(join(packagesDir, d, "package.json"), "utf8")).version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const existing = new Set(git("tag", "--list").split("\n"));
  for (const tag of goTags()) {
    if (existing.has(tag)) { console.log(`exists  ${tag}`); continue; }
    console.log(`${dryRun ? "would tag" : "tag"}  ${tag}`);
    if (!dryRun) {
      git("tag", tag);
      if (push) git("push", "origin", tag);
    }
  }
}
