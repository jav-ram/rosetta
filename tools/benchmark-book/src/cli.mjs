#!/usr/bin/env node
// Usage: node src/cli.mjs [--out <dir>] [--rosetta] [--raster]
//   writes book-100/ and book-300/ into <dir> (default: out/). With --rosetta, also book-100.rosetta and book-300.rosetta: the same books
//   as real .rosetta files, which Rosetta can import. With --raster the illustrations in those files are PNGs of an A4 page at 300 dpi
//   (3.7 MB each: book-100-raster.rosetta is about 180 MB, book-300-raster.rosetta about 530 MB) instead of small placeholder SVGs.
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, generateBook, writeBook } from "./generate.mjs";
import { toRosettaFile } from "./rosetta.mjs";

const args = process.argv.slice(2);
const flag = args.indexOf("--out");
const out = resolve(flag >= 0 ? args[flag + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "out"));

for (const pages of [100, 300]) {
  const { files, manifest, stats } = generateBook({ pages });
  const problems = checkProject(files);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const dir = join(out, `book-${pages}`);
  rmSync(dir, { recursive: true, force: true });
  writeBook(dir, files);
  if (args.includes("--rosetta")) {
    const file = join(out, `book-${pages}.rosetta`);
    writeFileSync(file, toRosettaFile({ files, manifest }));
    console.log(`${file}`);
    if (args.includes("--raster")) {
      const rasterFile = join(out, `book-${pages}-raster.rosetta`);
      writeFileSync(rasterFile, toRosettaFile({ files, manifest }, { raster: true }));
      console.log(`${rasterFile}`);
    }
  }
  console.log(`${dir}: ${stats.chapters} chapters, ~${stats.estimatedPages} pages (estimate), ${stats.illustrations} illustrations`);
}
