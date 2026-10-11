// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { Editor } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";

// The Visual and Markdown views of a chapter, in the whole app, with the real editor and the real parser.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: {
    parse: async (md: string) => real.parse(md),
    setComponents: async () => {},
    ready: async () => {},
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  real = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const roots: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

const settle = (ms = 400) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function start() {
  const { App } = await import("../src/App");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<App />));
  await settle();
}

const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((t) => t.textContent === name)!;
const show = (name: string) => act(async () => void tab(name).click());
const source = () => document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Chapter text']")!;
const editor = () => (document.querySelector(".visual-editor .ProseMirror") as unknown as { editor: Editor }).editor;
const chapter = (title: string) => act(async () => void [...document.querySelectorAll<HTMLElement>(".sidebar button, nav button")].find((b) => b.textContent === title)!.click());

/** Types into the text box the way the browser does: the value changes, then React hears an input event. */
const typeSource = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source(), value);
    source().dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("visual -> markdown", () => {
  test("what was just typed in the visual editor is in the Markdown view at once, without waiting for the save", async () => {
    await start();
    editor().chain().focus("end").insertContent("Just typed.").run();
    await show("Markdown");
    expect(source().value).toContain("Just typed.");
  });

  test("a save that was waiting does not undo what is then typed in the Markdown view", async () => {
    await start();
    editor().chain().focus("end").insertContent("From visual.").run();
    await show("Markdown");
    await typeSource(source().value + "\nFrom markdown.\n");
    await settle();
    expect(source().value).toContain("From visual.");
    expect(source().value).toContain("From markdown.");
  });
});

describe("markdown -> visual", () => {
  test("text typed in the Markdown view is in the editor when switching back", async () => {
    await start();
    await show("Markdown");
    await typeSource("# Typed in source\n\nA *new* paragraph.\n\n:::sidebar{title=Hi}\nNote.\n:::\n");
    await settle();
    await show("Visual");
    const doc = editor().state.doc;
    expect(doc.child(0).textContent).toBe("Typed in source");
    expect(doc.child(1).textContent).toBe("A new paragraph.");
    expect(doc.child(2).attrs.name).toBe("sidebar");
    expect(editor().isEditable).toBe(true);
  });

  test("the editor cannot be typed into until it shows what was typed in the Markdown view", async () => {
    await start();
    await show("Markdown");
    await typeSource("Changed.\n");
    await show("Visual");
    expect(editor().isEditable).toBe(false);
    await settle();
    expect(editor().isEditable).toBe(true);
    expect(editor().state.doc.textContent).toBe("Changed.");
  });

  test("typing back the text the editor already shows makes it editable again", async () => {
    await start();
    const original = (await show("Markdown"), source().value);
    await typeSource("x\n");
    await show("Visual");
    await typeSource(original);
    await settle();
    expect(editor().isEditable).toBe(true);
  });
});

describe("no loss", () => {
  test("going to the Visual view and back without editing does not change a single character", async () => {
    await start();
    await show("Markdown");
    const hand = "Title\n=====\n\n* one\n* two\n\n__bold__ and _it_\n\n:::sidebar{ title=\"A\" #x }\nbody\n:::\n\n::pagebreak\n";
    await typeSource(hand);
    await settle();
    await show("Visual");
    await settle();
    await show("Markdown");
    expect(source().value).toBe(hand);
  });

  test("an edit in the visual editor changes only that, and a chapter keeps its own text", async () => {
    await start();
    await show("Markdown");
    const intro = source().value;
    await show("Visual");
    editor().chain().focus("end").insertContent("More.").run();
    await show("Markdown");
    expect(source().value.startsWith(intro.trimEnd().split("\n").slice(0, 3).join("\n"))).toBe(true);
    expect(source().value).toContain("More.");
    await chapter("Bestiary");
    await settle();
    expect(source().value).toContain(":::statblock");
    await chapter("Introduction");
    await settle();
    expect(source().value).toContain("More.");
  });
});
