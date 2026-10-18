import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";
import { findAsset, validateAssetRef, validateManifest } from "@rosetta/contracts";
import { instantiate } from "@rosetta/parser-wasm";
import { generateBook } from "../src/generate.mjs";
import { toRosettaFile } from "../src/rosetta.mjs";

const dist = (f) => new URL(`../../../packages/parser-wasm/dist/${f}`, import.meta.url);
let parser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

// The books as real `.rosetta` files: what Rosetta's importer checks, checked here (the importer itself is tested in store-local).
describe.each([100, 300])("%i-page book as a .rosetta file", (pages) => {
  const book = generateBook({ pages });
  const files = unzipSync(toRosettaFile(book));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  const assets = JSON.parse(strFromU8(files["assets/assets.json"]));

  test("has a valid manifest, chapter ids that are unique, and the start rules of the book", () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] });
    expect(new Set(manifest.chapters.map((c) => c.id)).size).toBe(manifest.chapters.length);
    expect(manifest.chapters.map((c) => c.start)).toEqual(book.manifest.chapters.map((c) => (c.startOn === "right" ? "right-page" : undefined)));
  });

  test("has a cover: the book's title and a picture that is one of the assets", () => {
    expect(manifest.cover.title).toBe(book.manifest.title);
    expect(assets.some((a) => a.id === manifest.cover.image.id && a.name === "cover.svg")).toBe(true);
    expect(manifest.cover.image).toEqual(assets.find((a) => a.id === "cover"));
  });

  test("has a file for every chapter, found by its number, and nothing else under chapters/", () => {
    const names = Object.keys(files).filter((n) => n.startsWith("chapters/"));
    expect(names).toHaveLength(manifest.chapters.length);
    const digits = Math.max(2, String(manifest.chapters.length).length);
    manifest.chapters.forEach((_c, i) => expect(names.some((n) => n.startsWith(`chapters/${String(i + 1).padStart(digits, "0")}-`))).toBe(true));
  });

  test("lists every image with a valid reference and has its file under the name Rosetta looks for", () => {
    expect(assets.length).toBeGreaterThan(0);
    for (const ref of assets) {
      expect(validateAssetRef(ref), ref.id).toEqual({ valid: true, errors: [] });
      expect(files[`assets/originals/${ref.id}.svg`], ref.id).toBeDefined();
      expect(strToU8Length(files[`assets/originals/${ref.id}.svg`])).toBe(ref.size);
    }
  });

  test("every chapter parses with no warnings, and every image it shows is one of the project's", () => {
    for (const name of Object.keys(files).filter((n) => n.startsWith("chapters/"))) {
      const text = strFromU8(files[name]);
      const result = parser.parse(text);
      expect(result.warnings, name).toEqual([]);
      const sources = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), ...text.matchAll(/^::figure\{src="([^"]+)"/gm), ...text.matchAll(/^::page\{[^}]*art="([^"]+)"/gm)].map((m) => m[1]);
      for (const src of sources) expect(findAsset(assets, src), `${name}: ${src}`).toBeDefined();
    }
  });

  test("the same book gives the same bytes", () => {
    expect([...toRosettaFile(book)]).toEqual([...toRosettaFile(generateBook({ pages }))]);
  });
});

const strToU8Length = (bytes) => bytes.length;

describe("with real picture files (--raster)", () => {
  const book = generateBook({ pages: 100 });
  // Small pictures, so the test is quick: the real ones are 2480 by 1754 pixels.
  const file = toRosettaFile(book, { raster: true, rasterSize: [64, 48] });
  const files = unzipSync(file);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  const assets = JSON.parse(strFromU8(files["assets/assets.json"]));

  test("every illustration and the cover is a valid PNG of the size asked for, listed with its own byte size", () => {
    expect(assets.length).toBeGreaterThan(10);
    for (const ref of assets) {
      const bytes = files[`assets/originals/${ref.id}.png`];
      expect(ref.mediaType, ref.id).toBe("image/png");
      expect(ref.name).toBe(`${ref.id}.png`);
      expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const header = new DataView(bytes.buffer, bytes.byteOffset + 16, 8); // width and height in the IHDR chunk
      expect([header.getUint32(0), header.getUint32(4)]).toEqual([64, 48]);
      expect(ref.size).toBe(bytes.length);
      expect(validateAssetRef(ref)).toEqual({ valid: true, errors: [] });
    }
    expect(Object.keys(files).some((n) => n.endsWith(".svg"))).toBe(false);
  });

  test("the chapters name the PNG files, every one of which is an asset, and the cover is one of them", () => {
    for (const name of Object.keys(files).filter((n) => n.startsWith("chapters/"))) {
      const text = strFromU8(files[name]);
      expect(text).not.toContain(".svg");
      const sources = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), ...text.matchAll(/^::figure\{src="([^"]+)"/gm), ...text.matchAll(/^::page\{[^}]*art="([^"]+)"/gm)].map((m) => m[1]);
      for (const src of sources) expect(findAsset(assets, src), `${name}: ${src}`).toBeDefined();
    }
    expect(manifest.cover.image.mediaType).toBe("image/png");
    expect(assets.some((a) => a.id === manifest.cover.image.id)).toBe(true);
  });

  test("the pictures differ from each other and are the same every time", () => {
    const a = files["assets/originals/ill-001.png"];
    const b = files["assets/originals/ill-002.png"];
    expect([...a]).not.toEqual([...b]);
    expect([...unzipSync(toRosettaFile(book, { raster: true, rasterSize: [64, 48] }))["assets/originals/ill-001.png"]]).toEqual([...a]);
  });

  test("a PNG that Chrome's decoder reads is the point: the IDAT is a zlib stream that inflates to the rows asked for", async () => {
    const { inflateSync } = await import("node:zlib");
    const bytes = files["assets/originals/ill-001.png"];
    let at = 8;
    const idat = [];
    while (at < bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
      const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
      if (type === "IDAT") idat.push(bytes.slice(at + 8, at + 8 + length));
      at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    expect(raw.length).toBe((64 * 3 + 1) * 48); // a filter byte and the pixels of each row
    expect(new Set([...Array(48).keys()].map((y) => raw[y * (64 * 3 + 1)]))).toEqual(new Set([2])); // every row has the filter that was written
  });
});
