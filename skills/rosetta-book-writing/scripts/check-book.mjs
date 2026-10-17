#!/usr/bin/env node
// Checks an unpacked Rosetta book (a folder with manifest.json, chapters/, assets/) with the real Rosetta parser.
//
//   node check-book.mjs <book-folder> [--chapter NN] [--json]
//
// Needs only Node 18 or newer. The Rosetta parser it uses is in vendor/ next to this file (see vendor/VERSION), so the skill works
// on its own, away from the Rosetta repository.
//
// It reports, per chapter, the parser's warnings with line numbers; images and art that point at nothing; assets nothing uses;
// chapters and files that do not match the manifest; and rough sizes (words, estimated pages). It does not lay pages out: the real
// page count, overflowing components, spreads that do not face each other and low-resolution images are shown by the Rosetta app's preview.
// Exit code: 0 when nothing needs attention, 1 when there are warnings or problems, 2 when it could not run.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, "vendor");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const folder = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--chapter");
const asJson = flag("--json");
const only = option("--chapter");

const stop = (message) => {
  console.error(message);
  process.exit(2);
};
if (!folder) stop("Usage: node check-book.mjs <book-folder> [--chapter NN] [--json]");
const root = resolve(folder);
if (!existsSync(join(root, "manifest.json"))) stop(`${root} has no manifest.json. It should be the unpacked .rosetta file (manifest.json, chapters/, assets/).`);
if (!existsSync(join(vendor, "rosetta.wasm")) || !existsSync(join(vendor, "wasm_exec.js"))) stop(`The parser is missing: ${vendor} should hold rosetta.wasm and wasm_exec.js. Copy the whole skill folder, not only SKILL.md.`);

// The parser is a Go program compiled to WebAssembly. wasm_exec.js (Go's own runtime glue) defines `Go`; the program then defines
// `globalThis.rosetta.parse(markdown)`, which returns JSON: { html, ast, warnings }.
await import(pathToFileURL(join(vendor, "wasm_exec.js")).href);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(join(vendor, "rosetta.wasm")), go.importObject);
void go.run(instance);
const api = globalThis.rosetta;
if (!api) stop("The parser did not start (the WebAssembly module did not define rosetta.parse).");
const parser = {
  parse(markdown) {
    const out = JSON.parse(api.parse(markdown));
    if (out.error !== undefined) throw new Error(out.error);
    return out;
  },
};

const problems = []; // things that are wrong in the book's files or references
const notes = []; // things to look at
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

// -- The manifest and the files ---------------------------------------------------------------------------------------
let manifest;
try {
  manifest = read(join(root, "manifest.json"));
} catch (e) {
  stop(`manifest.json cannot be read: ${e.message}`);
}
const chapters = manifest.chapters ?? [];
// What Rosetta's import checks before it accepts a file: a manifest that is valid, and a file for every chapter and every asset.
for (const key of ["rosettaVersion", "title", "chapters"]) if (manifest[key] === undefined) problems.push(`manifest.json: "${key}" is missing, so Rosetta will refuse the file`);
if (!Array.isArray(chapters)) problems.push("manifest.json: chapters must be a list");
const ids = new Set();
(Array.isArray(chapters) ? chapters : []).forEach((c, i) => {
  if (!c.id || !c.title) problems.push(`manifest.json: chapter ${i + 1} needs an id and a title`);
  else if (ids.has(c.id)) problems.push(`manifest.json: two chapters have the id "${c.id}"`);
  ids.add(c.id);
});
const files = existsSync(join(root, "chapters")) ? readdirSync(join(root, "chapters")).filter((f) => f.endsWith(".md")) : [];
const byNumber = new Map();
for (const f of files) {
  const n = /^(\d+)-/.exec(f)?.[1];
  if (n === undefined) problems.push(`chapters/${f}: the file name does not start with the chapter's number (01-, 02-, ...), so Rosetta will not find it`);
  else (byNumber.get(Number(n)) ?? byNumber.set(Number(n), []).get(Number(n))).push(f);
}
for (const [n, list] of byNumber) {
  if (list.length > 1) problems.push(`chapters/: ${list.join(" and ")} both have the number ${n}`);
  if (n > chapters.length) problems.push(`chapters/${list[0]}: there is no chapter ${n} in manifest.json (it lists ${chapters.length})`);
}

// -- Assets ----------------------------------------------------------------------------------------------------------
let assets = [];
const assetsFile = join(root, "assets/assets.json");
if (existsSync(assetsFile)) {
  try {
    assets = read(assetsFile);
  } catch (e) {
    problems.push(`assets/assets.json cannot be read: ${e.message}`);
  }
}
// The file of an asset is assets/originals/<id>.<extension>, the extension following from its type. Rosetta looks for exactly that name.
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "application/pdf": "pdf", "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf" };
const seenIds = new Set();
for (const a of assets) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(a.id ?? "")) problems.push(`assets/assets.json: "${a.name ?? a.id}" has an id that Rosetta cannot use (letters, digits, - and _ only, up to 64)`);
  if (seenIds.has(a.id)) problems.push(`assets/assets.json: the id ${a.id} is listed twice`);
  seenIds.add(a.id);
  if (!a.mediaType || typeof a.size !== "number") problems.push(`assets/assets.json: "${a.name ?? a.id}" needs a mediaType and a size`);
}
if (manifest.cover?.image && !assets.some((a) => a.id === manifest.cover.image.id)) problems.push(`manifest.json: the cover image ${manifest.cover.image.id} is not among the assets`);
const originals = existsSync(join(root, "assets/originals")) ? readdirSync(join(root, "assets/originals")) : [];
for (const a of assets) {
  const expected = `${a.id}.${EXTENSIONS[a.mediaType] ?? "bin"}`;
  if (originals.includes(expected)) continue;
  const other = originals.find((f) => f.startsWith(`${a.id}.`));
  problems.push(other ? `assets/originals/${other} should be named ${expected} (its type is ${a.mediaType}), or Rosetta will not find it` : `assets/assets.json lists "${a.name ?? a.id}" (${a.id}) but assets/originals/${expected} is missing`);
}

const used = new Set();
const find = (src) => {
  let wanted = src.trim().replace(/^assets\//, "");
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    /* use it as written */
  }
  return assets.find((a) => a.id === wanted) ?? assets.find((a) => a.name === wanted);
};
const external = (src) => /^(https?:|data:|blob:)/i.test(src.trim());

// -- Chapters ----------------------------------------------------------------------------------------------------------
const report = [];
const walk = (node, visit, parent = null) => {
  visit(node, parent);
  for (const child of node.children ?? []) walk(child, visit, node);
};
const textOf = (node) => (node.type === "text" || node.type === "code" ? (node.value ?? "") : (node.children ?? []).map(textOf).join(""));

chapters.forEach((chapter, index) => {
  const number = index + 1;
  if (only !== undefined && Number(only) !== number) return;
  const label = `${String(number).padStart(2, "0")} ${chapter.title}`;
  const file = byNumber.get(number)?.[0];
  const entry = { number, title: chapter.title, file: file ? `chapters/${file}` : null, warnings: [], references: [], words: 0, headings: [], components: {} };
  report.push(entry);
  if (!file) {
    problems.push(`Chapter ${label}: no file chapters/${String(number).padStart(2, "0")}-….md (Rosetta refuses a file with a chapter missing; an empty file is fine)`);
    return;
  }
  const source = readFileSync(join(root, "chapters", file), "utf8");
  const result = parser.parse(source);
  entry.warnings = result.warnings.map((w) => ({ line: w.range?.start?.line ?? 0, column: w.range?.start?.column ?? 0, severity: w.severity, code: w.code, message: w.message }));
  let h1 = 0;
  const directives = [];
  walk(result.ast, (node) => {
    if (node.type === "heading") {
      entry.headings.push({ level: node.depth, text: textOf(node) });
      if (node.depth === 1) h1 += 1;
    }
    if (node.type === "directive") {
      entry.components[node.name] = (entry.components[node.name] ?? 0) + 1;
      directives.push(node);
      const reference = node.name === "figure" ? node.attributes?.src : node.name === "page" ? node.attributes?.art : undefined;
      if (reference) entry.references.push({ kind: node.name, src: reference });
    }
    if (node.type === "image" && node.url) entry.references.push({ kind: "image", src: node.url });
    if (node.type === "text" && node.value) entry.words += node.value.split(/\s+/).filter(Boolean).length;
  });
  if (h1 === 0) notes.push(`Chapter ${label}: no # heading. The first heading is the chapter's title on the page and in the running header.`);
  if (h1 > 1) notes.push(`Chapter ${label}: ${h1} # headings. Each is a title that spans the page; normally a chapter has one.`);
  for (const r of entry.references) {
    if (external(r.src)) continue;
    const asset = find(r.src);
    if (!asset) problems.push(`Chapter ${label}: ${r.kind} "${r.src}" is not an image of the project (no asset has that name or id)`);
    else {
      used.add(asset.id);
      if (assets.filter((a) => a.name === asset.name).length > 1 && r.src !== asset.id) notes.push(`Chapter ${label}: two assets are named "${asset.name}"; "${r.src}" means the first one added. Use the id to pick one.`);
    }
  }
  directives.forEach((d, i) => {
    const next = directives[i + 1];
    if (d.name === "page" && d.attributes?.template === "art-full" && next?.name === "page" && next.attributes?.template === "art-full" && d.attributes?.side !== "left")
      notes.push(`Chapter ${label}: two full-page art pages in a row (art "${d.attributes.art}", then "${next.attributes.art}"). If they are a spread, the first needs side="left" unless the preview shows they already face each other.`);
  });
});

if (only === undefined) {
  for (const a of assets) {
    if (!used.has(a.id) && manifest.cover?.image?.id !== a.id) notes.push(`Image "${a.name ?? a.id}" is not used by any chapter`);
  }
}

// -- Output ----------------------------------------------------------------------------------------------------------
const warningCount = report.reduce((n, c) => n + c.warnings.length, 0);
const pagesOf = (words) => Math.max(1, Math.round(words / 450 * 10) / 10);
if (asJson) {
  console.log(JSON.stringify({ title: manifest.title, chapters: report, problems, notes }, null, 2));
} else {
  console.log(`${manifest.title}: ${chapters.length} chapters, ${assets.length} images\n`);
  for (const c of report) {
    const parts = Object.entries(c.components).map(([name, n]) => `${n} ${name}`).join(", ");
    console.log(`${String(c.number).padStart(2, "0")} ${c.title}  (${c.words} words, about ${pagesOf(c.words)} pages of text${parts ? `; ${parts}` : ""})`);
    for (const w of c.warnings) console.log(`   ${c.file}:${w.line}:${w.column}  ${w.severity}  ${w.code}  ${w.message}`);
  }
  if (problems.length) console.log(`\nProblems (fix these):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  if (notes.length) console.log(`\nTo look at:\n${notes.map((p) => `  - ${p}`).join("\n")}`);
  console.log(`\n${warningCount} parser warning${warningCount === 1 ? "" : "s"}, ${problems.length} problem${problems.length === 1 ? "" : "s"}, ${notes.length} note${notes.length === 1 ? "" : "s"}.`);
  console.log("Pages are estimated from words. The real page count, components too tall for a column, art that does not face, and low-resolution images are shown by the Rosetta preview.");
}
process.exit(warningCount + problems.length > 0 ? 1 : 0);
