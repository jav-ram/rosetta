// @vitest-environment jsdom
import type { AssetRef, ExportProgress, Manifest, ProjectStore } from "@rosetta/contracts";
import { ExportError } from "@rosetta/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BrowserPrintExporter, name, type BookLayout } from "../src/index";

test("exports the package name", () => {
  expect(name).toBe("@rosetta/exporter-browser");
});

const asset = (id: string, fileName: string): AssetRef => ({ id, name: fileName, mediaType: "image/png", size: 3 });

/** A project of a few chapters, with the images the tests refer to. */
function fakeStore(chapters: { id: string; title: string; text: string; start?: "right-page" }[], assets: AssetRef[] = [], cover?: Manifest["cover"]) {
  const manifest: Manifest = { rosettaVersion: "0.1", title: "Book", ...(cover ? { cover } : {}), chapters: chapters.map(({ id, title, start }) => ({ id, title, ...(start ? { start } : {}) })) };
  const getAsset = vi.fn(async (_p: string, ref: AssetRef, variant: string) => new Blob([`${ref.id}:${variant}`]));
  const store = {
    loadManifest: async () => manifest,
    loadChapter: async (_p: string, id: string) => chapters.find((c) => c.id === id)!.text,
    listAssets: async () => assets,
    getAsset,
  } as unknown as ProjectStore;
  return { store, getAsset };
}

interface LayoutCalls {
  rendered?: { input: { cover?: { title: string; art?: string }; chapters: { html: string; startOn?: string }[]; css: string }; options: Parameters<BookLayout["render"]>[1] };
  printed: number;
  destroyed: number;
}
/** A stand-in layout: it says what it was given, and answers as the test says. */
function fakeLayout(behave: { render?: (calls: LayoutCalls) => Promise<{ pages: number; layoutMs: number; oversized: unknown[] }>; print?: () => Promise<void> } = {}) {
  const calls: LayoutCalls = { printed: 0, destroyed: 0 };
  const layout: BookLayout = {
    render: async (input, options) => {
      calls.rendered = { input, options };
      options?.onPage?.(5);
      options?.onImages?.(1, 2);
      return behave.render ? behave.render(calls) : { pages: 12, layoutMs: 1, oversized: [] };
    },
    print: async () => {
      calls.printed++;
      await behave.print?.();
    },
    destroy: () => void calls.destroyed++,
  };
  return { layout, calls };
}

const parse = async (markdown: string) => ({ html: markdown.replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/::figure\{src="([^"]+)"\}/g, '<figure><img src="$1"></figure>').replace(/::page\{[^}]*art="([^"]+)"[^}]*\}/g, '<div class="rosetta-page" data-art="$1"></div>') });
const css = ".rosetta-document { color: red; }";

let created: string[] = [];
let revoked: string[] = [];
beforeEach(() => {
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = () => (created.push(`blob:${++n}`), `blob:${n}`);
  URL.revokeObjectURL = (u) => void revoked.push(u);
});
afterEach(() => vi.restoreAllMocks());

const chapters = [
  { id: "one", title: "One", text: "# One\n\nText.\n" },
  { id: "two", title: "Two", text: '# Two\n\n::figure{src="map.png"}\n', start: "right-page" as const },
];
const exporterFor = (store: ProjectStore, layout: BookLayout) => new BrowserPrintExporter({ store, parse, createLayout: () => layout, css });

describe("exporting the book", () => {
  test("every chapter, in order, becomes one book, and the print dialog is opened", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const { layout, calls } = fakeLayout();
    const result = await exporterFor(store, layout).exportBook("p1");
    expect(result).toEqual({ pages: 12, warnings: [] });
    expect(calls.rendered!.input.chapters.map((c) => c.html)).toEqual(["<h1>One</h1>\n\nText.\n", '<h1>Two</h1>\n\n<figure><img src="map.png"></figure>\n']);
    expect(calls.rendered!.input.css).toBe(css);
    expect(calls.printed).toBe(1);
  });

  test("how a chapter starts comes from the manifest", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const { layout, calls } = fakeLayout();
    await exporterFor(store, layout).exportBook("p1");
    expect(calls.rendered!.input.chapters.map((c) => c.startOn)).toEqual([undefined, "right-page"]);
  });

  test("the images are the originals, only the ones the book uses, and their addresses are given up afterwards", async () => {
    const assets = [asset("a1", "map.png"), asset("a2", "unused.png"), asset("a3", "dragon.png")];
    const { store, getAsset } = fakeStore([{ id: "one", title: "One", text: '# One\n\n::figure{src="map.png"}\n\n::page{template="art-full" art="assets/dragon.png"}\n' }], assets);
    const { layout, calls } = fakeLayout();
    await exporterFor(store, layout).exportBook("p1");
    expect(getAsset.mock.calls.map((c) => [c[1].id, c[2]])).toEqual([["a1", "original"], ["a3", "original"]]);
    const resolve = calls.rendered!.options!.resolveImage!;
    expect(resolve("map.png")).toBe("blob:1");
    expect(resolve("assets/dragon.png")).toBe("blob:2");
    expect(resolve("unknown.png")).toBeUndefined();
    expect(revoked.sort()).toEqual(["blob:1", "blob:2"]);
  });

  test("an image that is not in the project is reported, and printed as a placeholder; web images are left alone", async () => {
    const { store } = fakeStore([{ id: "one", title: "One", text: '# One\n\n::figure{src="gone.png"}\n\n![x](https://example.test/a.png)\n' }]);
    const { layout } = fakeLayout();
    const result = await exporterFor(store, layout).exportBook("p1");
    expect(result.warnings).toEqual(["The image “gone.png” is not in the project, so a gray placeholder is printed in its place."]);
  });

  test("components too tall for a column are reported", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const { layout } = fakeLayout({ render: async () => ({ pages: 3, layoutMs: 1, oversized: [{}, {}] }) });
    expect((await exporterFor(store, layout).exportBook("p1")).warnings).toEqual(["2 components are taller than a column and will not fit on a page."]);
  });

  test("progress goes through reading, converting, images, layout and printing", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const { layout } = fakeLayout();
    const seen: ExportProgress[] = [];
    await exporterFor(store, layout).exportBook("p1", { onProgress: (p) => seen.push(p) });
    const stages = seen.map((p) => p.stage);
    expect([...new Set(stages)]).toEqual(["reading", "converting", "images", "layout", "printing"]);
    expect(seen.find((p) => p.stage === "reading")).toMatchObject({ message: "Reading “One”", done: 0, total: 2 });
    expect(seen.find((p) => p.message === "Laying out page 5")).toMatchObject({ stage: "layout", done: 5 });
    expect(seen.at(-1)).toMatchObject({ stage: "printing", done: 12, total: 12 });
  });
});

describe("the front cover", () => {
  test("a book with no cover setting has none", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const { layout, calls } = fakeLayout();
    await exporterFor(store, layout).exportBook("p1");
    expect(calls.rendered!.input.cover).toBeUndefined();
  });

  test("a cover with only a title prints the book's title when none is given for it", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")], {});
    const { layout, calls } = fakeLayout();
    await exporterFor(store, layout).exportBook("p1");
    expect(calls.rendered!.input.cover).toEqual({ title: "Book" });
  });

  test("the title set for the cover wins, and its picture is the original of one of the project's images, found by id", async () => {
    const dragon = asset("a9", "dragon.png");
    const { store, getAsset } = fakeStore(chapters, [asset("a1", "map.png"), dragon], { title: "  The Warcaller  ", image: dragon });
    const { layout, calls } = fakeLayout();
    const result = await exporterFor(store, layout).exportBook("p1");
    expect(calls.rendered!.input.cover).toEqual({ title: "The Warcaller", art: "a9" });
    expect(getAsset.mock.calls.map((c) => [c[1].id, c[2]]).sort()).toEqual([["a1", "original"], ["a9", "original"]]);
    expect(calls.rendered!.options!.resolveImage!("a9")).toMatch(/^blob:/);
    expect(result.warnings).toEqual([]);
  });

  test("a cover picture that is no longer in the project is reported, and the cover is printed without it", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")], { image: asset("gone", "gone.png") });
    const { layout, calls } = fakeLayout();
    const result = await exporterFor(store, layout).exportBook("p1");
    expect(calls.rendered!.input.cover).toEqual({ title: "Book" });
    expect(result.warnings).toEqual(["The cover image is not in the project, so the cover is printed without it."]);
  });
});

describe("when it cannot or should not go on", () => {
  test("a book with no chapters, or only empty ones, says so and prints nothing", async () => {
    for (const list of [[], [{ id: "a", title: "A", text: "  \n" }]]) {
      const { store } = fakeStore(list);
      const { layout, calls } = fakeLayout();
      await expect(exporterFor(store, layout).exportBook("p1")).rejects.toMatchObject({ code: "empty" });
      expect(calls.printed).toBe(0);
      expect(calls.destroyed).toBe(1);
    }
  });

  test("a signal that is already aborted stops it before anything is read", async () => {
    const { store } = fakeStore(chapters);
    const { layout, calls } = fakeLayout();
    const controller = new AbortController();
    controller.abort();
    await expect(exporterFor(store, layout).exportBook("p1", { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(calls.rendered).toBeUndefined();
    expect(calls.destroyed).toBe(1);
  });

  test("cancelling while the pages are laid out rejects as cancelled, and cleans up", async () => {
    const { store } = fakeStore(chapters, [asset("a1", "map.png")]);
    const controller = new AbortController();
    const { layout, calls } = fakeLayout({
      render: async () => {
        controller.abort();
        throw new DOMException("cancelled", "AbortError");
      },
    });
    await expect(exporterFor(store, layout).exportBook("p1", { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(calls.printed).toBe(0);
    expect(calls.destroyed).toBe(1);
    expect(revoked).toEqual(created);
  });

  test("a failure while laying out says what it was, and cleans up", async () => {
    const { store } = fakeStore(chapters);
    const { layout, calls } = fakeLayout({ render: async () => Promise.reject(new Error("Paged.js did not load")) });
    const error = await exporterFor(store, layout).exportBook("p1").catch((e) => e);
    expect(error).toBeInstanceOf(ExportError);
    expect(error).toMatchObject({ code: "failed", message: "Paged.js did not load" });
    expect(calls.destroyed).toBe(1);
  });

  test("a chapter the parser fails on, or a store that fails, is a failure with its message", async () => {
    const { store } = fakeStore(chapters);
    const { layout } = fakeLayout();
    const bad = new BrowserPrintExporter({ store, parse: async () => Promise.reject(new Error("parser down")), createLayout: () => layout, css });
    await expect(bad.exportBook("p1")).rejects.toMatchObject({ code: "failed", message: "parser down" });
    const broken = { ...(store as object), loadManifest: async () => Promise.reject(new Error("no such project")) } as unknown as ProjectStore;
    await expect(exporterFor(broken, layout).exportBook("p1")).rejects.toMatchObject({ code: "failed", message: "no such project" });
  });

  test("closing the print dialog is not an error: the book was laid out and offered", async () => {
    const { store } = fakeStore(chapters);
    const { layout } = fakeLayout({ print: async () => {} });
    await expect(exporterFor(store, layout).exportBook("p1")).resolves.toMatchObject({ pages: 12 });
  });
});
