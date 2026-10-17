// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { Editor } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import type { OversizedBlock, Preview } from "@rosetta/preview";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { seed } from "./seed";

// A component that is taller than a column gets a warning in the preview and on the same block in the editor, in the whole app
// (real editor, real parser). The preview itself is a stand-in: it finds the stat blocks in the HTML it is given and says they are
// too tall, the way the real one does after Paged.js (that part is tested in `preview`).

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: { parse: async (md: string) => real.parse(md), setComponents: async () => {}, ready: async () => {} },
}));

/** What the stand-in preview should call too tall: component names. */
let tooTall: string[] = ["statblock"];
/** The stand-in preview says the first `page` component and the one after it are two pages of art that do not face each other. */
let unpaired = false;
/** What the stand-in preview says it placed: every `figure` in the HTML, as a box of this many CSS pixels wide (and as tall as it is wide). */
let figureBox: number | null = null;
vi.mock("../src/preview", () => ({
  createAppPreview: (): Preview => ({
    render: async ({ html }) => {
      
      const doc = new DOMParser().parseFromString(html, "text/html");
      const oversized: OversizedBlock[] = [];
      [...doc.querySelectorAll("[data-component]")].forEach((el, index) => {
        const name = el.getAttribute("data-component")!;
        if (tooTall.includes(name)) oversized.push({ index, name, heightMm: 461, columnMm: 253 });
      });
      const spreads = unpaired ? [...doc.querySelectorAll("[data-component]")].flatMap((el, index) => (el.getAttribute("data-component") === "page" ? [{ index, page: 2, count: 2 }] : [])).slice(0, 1) : [];
      const images =
        figureBox === null
          ? []
          : [...doc.querySelectorAll("[data-component]")].flatMap((el, index) =>
              el.getAttribute("data-component") === "figure" ? [{ source: el.querySelector("img")!.getAttribute("data-source") ?? el.querySelector("img")!.getAttribute("src")!, index, page: 2, widthPx: figureBox!, heightPx: figureBox!, naturalWidth: 100, naturalHeight: 100 }] : [],
            );
      return { pages: 3, layoutMs: 1, oversized, spreads, images };
    },
    destroy: () => {},
  }),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  real = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const roots: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  tooTall = ["statblock"];
  unpaired = false;
  figureBox = null;
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

// In steps: React runs the effects of one `act` only when it ends, and the app's saves and parses are timers that start from them.
async function settle(ms = 500) {
  for (let left = ms; left > 0; left -= 100) await act(async () => void (await new Promise((r) => setTimeout(r, Math.min(100, left)))));
}

async function start(chapters?: Parameters<typeof seed>[0], setup?: (store: Awaited<ReturnType<typeof seed>>["store"], projectId: string) => Promise<void>) {
  const { Workspace } = await import("../src/Workspace");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  const { store, project } = await seed(chapters);
  await setup?.(store, project.id);
  await act(async () => root.render(<Workspace store={store} project={project} />));
  // The project opens, then its first chapter is read from the store, and only then is there an editor.
  for (let i = 0; i < 50 && !document.querySelector(".visual-editor .ProseMirror"); i++) await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
  await settle();
}

const editor = () => (document.querySelector(".visual-editor .ProseMirror") as unknown as { editor: Editor }).editor;
const chapter = (title: string) => act(async () => void [...document.querySelectorAll<HTMLElement>(".sidebar button, nav button")].find((b) => b.textContent === title)!.click());
const inEditor = () => [...document.querySelectorAll<HTMLElement>(".visual-editor [data-layout-warning]")].map((e) => `${e.dataset.component}`);
const inPreview = () => [...document.querySelectorAll(".layout-warnings li")].map((li) => li.textContent ?? "");

describe("an oversized stat block", () => {
  test("is warned about in the preview and on the block in the editor", async () => {
    await start();
    await chapter("Bestiary");
    await settle(900);
    expect(inPreview()).toHaveLength(1);
    expect(inPreview()[0]).toContain('A "statblock" is taller than a column (461 mm; a column is 253 mm)');
    expect(inEditor()).toEqual(["statblock"]);
    const frame = document.querySelector<HTMLElement>(".visual-editor .has-layout-warning")!;
    expect(frame.dataset.layoutWarning).toBe(inPreview()[0]);
  });

  test("nothing is marked when everything fits", async () => {
    tooTall = [];
    await start();
    await chapter("Bestiary");
    await settle(900);
    expect(inPreview()).toEqual([]);
    expect(inEditor()).toEqual([]);
  });

  test("only the oversized one is marked when there are several", async () => {
    await start();
    await chapter("Bestiary");
    await settle(900);
    // the chapter has more components than one; only stat blocks are too tall
    const names = [...document.querySelectorAll(".visual-editor .rosetta-component")].map((e) => (e as HTMLElement).dataset.component);
    const marked = inEditor();
    expect(marked.length).toBe(names.filter((n) => n === "statblock").length);
    expect(marked.every((n) => n === "statblock")).toBe(true);
  });

  test("the warning is not in the chapter's text", async () => {
    await start();
    await chapter("Bestiary");
    await settle(900);
    const area = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Chapter text']")!;
    expect(area.value).not.toContain("taller than a column");
    expect(area.value).not.toContain("layout-warning");
  });

  test("stays on the block while the text above it is edited, and goes when the chapter changes", async () => {
    await start();
    await chapter("Bestiary");
    await settle(900);
    editor().chain().focus("start").insertContent("A new first line. ").run();
    await settle(100);
    expect(inEditor()).toEqual(["statblock"]);
    await settle(900); // saved, parsed, laid out again: still there
    expect(inEditor()).toEqual(["statblock"]);

    await chapter("Introduction");
    await settle(900);
    expect(inEditor()).toEqual([]); // the introduction has no stat block
    expect(inPreview()).toEqual([]);
  });

  test("is not marked any more when it is shortened (the next layout says it fits)", async () => {
    await start();
    await chapter("Bestiary");
    await settle(900);
    expect(inEditor()).toEqual(["statblock"]);
    tooTall = [];
    editor().chain().focus("end").insertContent("x").run();
    await settle(1200);
    expect(inEditor()).toEqual([]);
    expect(inPreview()).toEqual([]);
  });
});

describe("pages of art that do not face each other", () => {
  const spread = '::page{template="art-full" art="a.png"}\n::page{template="art-full" art="b.png"}\n';

  test("are warned about in the preview, with the book's page numbers, and on the first page of art in the editor", async () => {
    unpaired = true;
    await start([{ id: "one", title: "One", markdown: `# One\n\n${spread}` }]);
    await settle(900);
    expect(inPreview()).toEqual(['Pages 2 and 3 are pages of art in a row, but 2 is a right-hand page, so they do not face each other when the book is printed. Add side="left" to the first one to put it on a left-hand page.']);
    expect(inEditor()).toEqual(["page"]);
    expect(document.querySelectorAll(".visual-editor [data-component=\"page\"].has-layout-warning, .visual-editor .has-layout-warning[data-component=\"page\"]").length).toBeGreaterThan(0);
    expect(document.querySelector(".preview header .hint")!.textContent).toContain("1 layout problem");
  });

  test("nothing is said when they face each other", async () => {
    await start([{ id: "one", title: "One", markdown: `# One\n\n${spread}` }]);
    await settle(900);
    expect(inPreview()).toEqual([]);
    expect(inEditor()).toEqual([]);
  });
});

// A PNG that is only its header: all the app reads of it is the size.
const png = (w: number, h: number, name: string) => {
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0])], name, { type: "image/png" });
};

describe("images too small for print", () => {
  const chapters = [{ id: "one", title: "One", markdown: '# One\n\n::figure{src="small.png"}\n\n::figure{src="big.png"}\n\n::figure{src="elsewhere.png"}\n' }];
  const assets = async (store: Awaited<ReturnType<typeof seed>>["store"], id: string) => {
    await store.putAsset(id, png(300, 200, "small.png"));
    await store.putAsset(id, png(3000, 2000, "big.png"));
  };

  test("are warned about in the preview, with the book's page, and on the figure in the editor; the others are not", async () => {
    figureBox = 288; // a 3 inch square: the 300 × 200 pixel image is short of pixels on its height (67 dpi), the big one has plenty
    await start(chapters, assets);
    await settle(1200);
    expect(inPreview()).toEqual(["“small.png” is 300 × 200 pixels, about 67 dpi at the size it has on page 2. Print needs at least 150 dpi (300 is best): use a larger image, or give it less room."]);
    expect(inEditor()).toEqual(["figure"]);
    expect(document.querySelector(".preview header .hint")!.textContent).toContain("1 layout problem");
  });

  test("nothing is said when the images are big enough for the room they have", async () => {
    figureBox = 96; // an inch: 300 dpi
    await start(chapters, assets);
    await settle(1200);
    expect(inPreview()).toEqual([]);
    expect(inEditor()).toEqual([]);
  });

  test("an image that is not one of the project's, or whose file cannot be read, is not judged", async () => {
    figureBox = 9600;
    await start([{ id: "one", title: "One", markdown: '# One\n\n::figure{src="elsewhere.png"}\n\n::figure{src="notes.png"}\n' }], async (store, id) => {
      await store.putAsset(id, new File(["this is not a picture"], "notes.png", { type: "image/png" }));
    });
    await settle(1200);
    expect(inPreview()).toEqual([]);
  });
});
