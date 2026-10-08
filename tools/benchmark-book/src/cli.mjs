#!/usr/bin/env node
// Usage: node src/cli.mjs [--out <dir>]   writes book-100/ and book-300/ into <dir> (default: out/).
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, generateBook, writeBook } from "./generate.mjs";

const args = process.argv.slice(2);
const flag = args.indexOf("--out");
const out = resolve(flag >= 0 ? args[flag + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "out"));

for (const pages of [100, 300]) {
  const { files, stats } = generateBook({ pages });
  const problems = checkProject(files);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const dir = join(out, `book-${pages}`);
  rmSync(dir, { recursive: true, force: true });
  writeBook(dir, files);
  console.log(`${dir}: ${stats.chapters} chapters, ~${stats.estimatedPages} pages (estimate), ${stats.illustrations} illustrations`);
}
