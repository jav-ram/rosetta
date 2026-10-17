#!/usr/bin/env node
// Starts a book folder and keeps its chapter files in step with manifest.json, so the folder can be zipped into a .rosetta file that
// Rosetta accepts. Needs only Node 18 or newer.
//
//   node chapters.mjs new <folder> --title "The Book" [--chapters "Introduction,The Crypt"] [--system name] [--theme classic]
//   node chapters.mjs add <folder> "Chapter title" [--at N]     add a chapter at position N (1 is first; default: the end)
//   node chapters.mjs move <folder> <from> <to>                 move chapter <from> to position <to>
//   node chapters.mjs renumber <folder>                         rename the chapter files to match the manifest's order and titles
//
// Chapter files are named chapters/NN-title.md, where NN is the chapter's position in manifest.json: that number is how Rosetta finds
// a chapter's file, so changing the order means renaming files. `add` and `move` do both. Deleting a chapter is left to you (remove its
// entry from manifest.json, delete its file, then run `renumber`): it throws text away, so this script does not do it.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [command, folderArg, ...rest] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const positional = rest.filter((a, i) => !a.startsWith("--") && !(rest[i - 1] ?? "").startsWith("--"));
if (!command || !folderArg || !["new", "add", "move", "renumber"].includes(command)) fail("Usage: node chapters.mjs new|add|move|renumber <folder> ... (see the top of this file)");

const root = resolve(folderArg);
const manifestPath = join(root, "manifest.json");

/** The same file name Rosetta makes from a title: lower case letters and digits joined by hyphens. */
const slug = (title) =>
  title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "chapter";
const prefix = (index, count) => `${String(index + 1).padStart(Math.max(2, String(count).length), "0")}-`;
const target = (chapter, index, count) => `${prefix(index, count)}${slug(chapter.title)}.md`;
const readManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));
const writeManifest = (m) => writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
const uniqueId = (title, taken) => {
  let id = slug(title);
  for (let n = 2; taken.has(id); n++) id = `${slug(title)}-${n}`;
  return id;
};

/** The file each chapter has now, found by its number as Rosetta does: [{ chapter, file }] in manifest order (file null when there is none). */
function currentFiles(manifest) {
  const dir = join(root, "chapters");
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const count = manifest.chapters.length;
  return manifest.chapters.map((chapter, i) => {
    const wanted = prefix(i, count);
    const alternatives = [wanted, `${String(i + 1).padStart(2, "0")}-`, `${i + 1}-`]; // also files made with fewer digits
    return { chapter, file: names.find((n) => alternatives.some((p) => n.startsWith(p))) ?? null };
  });
}

/** Renames the files of `entries` (in the new order) to NN-title.md, through temporary names so that two files never want the same name. */
function writeOrder(entries) {
  const dir = join(root, "chapters");
  mkdirSync(dir, { recursive: true });
  const count = entries.length;
  const moves = entries.map((e, i) => ({ from: e.file, to: target(e.chapter, i, count), text: e.text }));
  moves.forEach((m, i) => {
    if (m.from) renameSync(join(dir, m.from), join(dir, `.moving-${i}`));
  });
  moves.forEach((m, i) => {
    if (m.from) renameSync(join(dir, `.moving-${i}`), join(dir, m.to));
    else writeFileSync(join(dir, m.to), m.text ?? "");
  });
}

if (command === "new") {
  const title = option("--title");
  if (!title) fail('Give the book a title: --title "The Book"');
  if (existsSync(manifestPath)) fail(`${manifestPath} exists already; not overwriting it.`);
  const titles = (option("--chapters") ?? "Chapter 1").split(",").map((t) => t.trim()).filter(Boolean);
  const taken = new Set();
  const manifest = { rosettaVersion: "0.1", title, ...(option("--system") ? { system: option("--system") } : {}), theme: option("--theme") ?? "classic", chapters: titles.map((t) => ({ id: (taken.add(uniqueId(t, taken)), [...taken].at(-1)), title: t })) };
  mkdirSync(join(root, "assets/originals"), { recursive: true });
  writeFileSync(join(root, "assets/assets.json"), "[]\n");
  writeManifest(manifest);
  writeOrder(manifest.chapters.map((chapter) => ({ chapter, file: null, text: `# ${chapter.title}\n` })));
  console.log(`Started "${title}" in ${root} with ${titles.length} chapter${titles.length === 1 ? "" : "s"}.`);
} else {
  if (!existsSync(manifestPath)) fail(`${root} has no manifest.json.`);
  const manifest = readManifest();
  const entries = currentFiles(manifest);
  if (command === "add") {
    const title = positional[0];
    if (!title) fail('Give the chapter a title: add <folder> "Chapter title" [--at N]');
    const at = option("--at") === undefined ? entries.length + 1 : Number(option("--at"));
    if (!Number.isInteger(at) || at < 1 || at > entries.length + 1) fail(`--at must be a position from 1 to ${entries.length + 1}.`);
    const chapter = { id: uniqueId(title, new Set(manifest.chapters.map((c) => c.id))), title };
    entries.splice(at - 1, 0, { chapter, file: null, text: `# ${title}\n` });
    // A chapter that moved is laid out differently: its page count and the ones after it are out of date.
    for (const e of entries.slice(at)) if (e.chapter.pages !== undefined) e.chapter.stale = true;
    console.log(`Added "${title}" as chapter ${at}.`);
  } else if (command === "move") {
    const [from, to] = [Number(positional[0]), Number(positional[1])];
    if (![from, to].every((n) => Number.isInteger(n) && n >= 1 && n <= entries.length)) fail(`Give two positions from 1 to ${entries.length}: move <folder> <from> <to>`);
    const [moved] = entries.splice(from - 1, 1);
    entries.splice(to - 1, 0, moved);
    for (const e of entries.slice(Math.min(from, to) - 1)) if (e.chapter.pages !== undefined) e.chapter.stale = true;
    console.log(`Moved "${moved.chapter.title}" from ${from} to ${to}.`);
  } else {
    console.log("Renumbered the chapter files.");
  }
  manifest.chapters = entries.map((e) => e.chapter);
  writeOrder(entries);
  writeManifest(manifest);
  const missing = entries.filter((e, i) => !e.file && command === "renumber").map((e) => e.chapter.title);
  if (missing.length) console.log(`No file existed for: ${missing.join(", ")} (empty files were made).`);
}
