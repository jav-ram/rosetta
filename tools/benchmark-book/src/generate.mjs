import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as assets from "./assets.mjs";
import { components, figure, markdownBlocks, nested, paragraphs } from "./blocks.mjs";
import { createRandom } from "./random.mjs";
import { title } from "./text.mjs";

const PAGES_PER_CHAPTER = 15;
const PAGES_PER_ILLUSTRATION = 1.2;

/** What each section of a chapter contains. Sections cycle through these, so every kind shows up in every long chapter. */
const recipes = [
  ["readaloud", "paragraphs", "statblock"],
  ["paragraphs", "table", "sidebar"],
  ["paragraphs", "list", "readaloud", "pagebreak"],
  ["quote", "paragraphs", "nested"],
  ["paragraphs", "numbered", "statblock", "code"],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Builds a project in memory: a map of file path to contents, plus statistics.
 * The same options always give the same files.
 *
 * @param {{ pages: number, seed?: number, name?: string }} options `pages` is a target; see "pages" in the returned stats.
 */
export function generateBook({ pages, seed = 1, name = `Benchmark book (${pages} pages)` }) {
  const rng = createRandom(seed);
  const files = new Map();
  const chapters = [];
  const usage = {};
  let illustrations = 0;

  const use = (kind, block) => {
    usage[kind] = (usage[kind] ?? 0) + 1;
    return block;
  };
  const make = (kind) => {
    if (kind === "paragraphs") return use(kind, paragraphs(rng, rng.int(2, 4)));
    if (kind === "nested") return use(kind, nested(rng));
    if (components[kind]) return use(kind, components[kind](rng));
    return use(kind, markdownBlocks[kind](rng));
  };

  const chapterCount = Math.max(1, Math.round(pages / PAGES_PER_CHAPTER));
  const target = pages / chapterCount;
  const usedTitles = new Set();
  let estimated = 0;

  for (let c = 1; c <= chapterCount; c++) {
    let chapterTitle = title(rng);
    while (usedTitles.has(chapterTitle)) chapterTitle = `${title(rng)} ${c}`;
    usedTitles.add(chapterTitle);

    const parts = [`# ${chapterTitle}`];
    let size = 1; // a chapter always starts on a new page
    let sincePicture = 0;
    let section = 0;

    while (size < target - 1) {
      parts.push(`## ${title(rng)}`);
      for (const kind of recipes[(section + c) % recipes.length]) {
        const block = make(kind);
        parts.push(block.markdown);
        size += block.pages;
        sincePicture += block.pages;
        if (sincePicture >= PAGES_PER_ILLUSTRATION) {
          const picture = figure(++illustrations);
          use("figure", picture);
          parts.push(picture.markdown);
          size += picture.pages;
          sincePicture = 0;
        }
      }
      section++;
    }

    const file = `chapters/${String(c).padStart(2, "0")}-${slug(chapterTitle)}.md`;
    files.set(file, parts.join("\n\n") + "\n");
    chapters.push({ file, title: chapterTitle, startOn: c % 2 === 1 ? "right" : "any" });
    estimated += Math.ceil(size);
  }

  for (let n = 1; n <= illustrations; n++) {
    const id = String(n).padStart(3, "0");
    files.set(`assets/originals/ill-${id}.svg`, assets.original(n, `Illustration ${id}`));
    files.set(`assets/previews/ill-${id}.svg`, assets.preview(n));
  }
  files.set("assets/originals/cover.svg", assets.original(0, name));
  files.set("assets/previews/cover.svg", assets.preview(0));

  // Provisional: the real manifest format is defined with project storage (T3.x).
  const manifest = {
    rosettaVersion: "0.1",
    title: name,
    system: "example",
    theme: "classic",
    cover: { title: name, image: "assets/originals/cover.svg" },
    chapters,
  };
  files.set("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

  return { files, manifest, stats: { targetPages: pages, estimatedPages: estimated, chapters: chapterCount, illustrations, usage } };
}

/** Structural problems that make a generated project invalid; empty when it is fine. */
export function checkProject(files) {
  const problems = [];
  const manifest = JSON.parse(files.get("manifest.json") ?? "{}");
  for (const key of ["rosettaVersion", "title", "system", "theme", "cover", "chapters"]) {
    if (manifest[key] === undefined) problems.push(`manifest.json: missing ${key}`);
  }
  if (!files.has(manifest.cover?.image)) problems.push(`cover image ${manifest.cover?.image} does not exist`);
  for (const chapter of manifest.chapters ?? []) {
    const text = files.get(chapter.file);
    if (text === undefined) {
      problems.push(`${chapter.file}: listed in the manifest but missing`);
      continue;
    }
    for (const [, path] of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!files.has(path)) problems.push(`${chapter.file}: image ${path} does not exist`);
      const preview = path.replace("originals/", "previews/");
      if (!files.has(preview)) problems.push(`${chapter.file}: preview ${preview} does not exist`);
    }
  }
  for (const path of files.keys()) {
    if (path.startsWith("chapters/") && !(manifest.chapters ?? []).some((c) => c.file === path)) problems.push(`${path}: not listed in the manifest`);
  }
  return problems;
}

export function writeBook(dir, files) {
  for (const [path, contents] of files) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}
