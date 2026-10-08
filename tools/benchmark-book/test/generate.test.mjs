import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { m1Components } from "@rosetta/contracts";
import { instantiate } from "@rosetta/parser-wasm";
import { components } from "../src/blocks.mjs";
import { checkProject, generateBook, writeBook } from "../src/generate.mjs";

const dist = (f) => new URL(`../../../packages/parser-wasm/dist/${f}`, import.meta.url);

let parser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const walk = (nodes, visit) => {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.children, visit);
  }
};

describe.each([100, 300])("%i-page book", (pages) => {
  const book = generateBook({ pages });

  test("is a valid project", () => {
    expect(checkProject(book.files)).toEqual([]);
  });

  test("is close to the requested size", () => {
    expect(book.stats.estimatedPages).toBeGreaterThan(pages * 0.9);
    expect(book.stats.estimatedPages).toBeLessThan(pages * 1.1);
  });

  test("has about one illustration for every two pages", () => {
    expect(book.stats.illustrations).toBeGreaterThan(pages * 0.4);
    expect(book.stats.illustrations).toBeLessThan(pages * 0.6);
  });

  test("every chapter parses with no warnings and uses real content", () => {
    const seen = new Set();
    for (const chapter of book.manifest.chapters) {
      const result = parser.parse(book.files.get(chapter.file));
      expect(result.warnings, chapter.file).toEqual([]);
      walk(result.ast.children, (n) => seen.add(n.type === "directive" ? n.name : n.type));
    }
    for (const type of ["heading", "paragraph", "table", "list", "blockquote", "image"]) {
      expect([...seen].some((s) => s.startsWith(type) || s === type), type).toBe(true);
    }
  });

  test("uses every component defined so far", () => {
    const seen = new Set();
    for (const chapter of book.manifest.chapters) {
      walk(parser.parse(book.files.get(chapter.file)).ast.children, (n) => n.type === "directive" && seen.add(n.name));
    }
    for (const def of m1Components) expect(seen, def.name).toContain(def.name);
  });
});

test("has a generator for every component definition", () => {
  // Add the new component to src/blocks.mjs when this fails.
  for (const def of m1Components) expect(Object.keys(components), def.name).toContain(def.name);
});

test("the same seed gives the same book, a different seed a different one", () => {
  const a = generateBook({ pages: 30, seed: 7 }).files;
  const b = generateBook({ pages: 30, seed: 7 }).files;
  const c = generateBook({ pages: 30, seed: 8 }).files;
  expect([...b]).toEqual([...a]);
  expect([...c]).not.toEqual([...a]);
});

test("writes the project to a folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "rosetta-book-"));
  try {
    const { files } = generateBook({ pages: 20 });
    writeBook(dir, files);
    expect(readdirSync(dir).sort()).toEqual(["assets", "chapters", "manifest.json"]);
    expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).chapters.length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkProject reports a missing image and an unlisted chapter", () => {
  const { files } = generateBook({ pages: 20 });
  const [image] = [...files.keys()].filter((k) => k.startsWith("assets/originals/ill-"));
  files.delete(image);
  files.set("chapters/99-stray.md", "# Stray\n");
  const problems = checkProject(files).join("\n");
  expect(problems).toContain(image);
  expect(problems).toContain("99-stray.md: not listed");
});
