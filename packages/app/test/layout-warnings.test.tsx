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
vi.mock("../src/preview", () => ({
  createAppPreview: (): Preview => ({
    render: async ({ html }) => {
      
      const doc = new DOMParser().parseFromString(html, "text/html");
      const oversized: OversizedBlock[] = [];
      [...doc.querySelectorAll("[data-component]")].forEach((el, index) => {
        const name = el.getAttribute("data-component")!;
        if (tooTall.includes(name)) oversized.push({ index, name, heightMm: 461, columnMm: 253 });
      });
      return { pages: 3, layoutMs: 1, oversized };
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
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

// In steps: React runs the effects of one `act` only when it ends, and the app's saves and parses are timers that start from them.
async function settle(ms = 500) {
  for (let left = ms; left > 0; left -= 100) await act(async () => void (await new Promise((r) => setTimeout(r, Math.min(100, left)))));
}

async function start() {
  const { App } = await import("../src/App");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<App />));
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
