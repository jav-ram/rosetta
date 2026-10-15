// @vitest-environment jsdom
import type { OversizedBlock, Preview, PreviewInput, PreviewResult } from "@rosetta/preview";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PreviewPane } from "../src/components/PreviewPane";
import type { Parsed } from "../src/useParsed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ready = (html: string, warnings = 0): Parsed => ({
  state: "ready",
  markdown: "",
  html,
  ast: { rosettaVersion: "0.1", children: [], warnings: [] },
  warnings: Array.from({ length: warnings }, () => ({ code: "a.b", severity: "warning" as const, message: "x" })),
});

interface Call {
  input: PreviewInput;
  resolve: (r: PreviewResult | null) => void;
  reject: (e: Error) => void;
}

let container: HTMLElement;
let root: Root;
let calls: Call[];
let destroyed: number;
const fake = (): Preview => ({
  render: (input) => new Promise((resolve, reject) => calls.push({ input, resolve, reject })),
  destroy: () => void destroyed++,
});
const create = vi.fn((_host: HTMLElement) => fake());

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  calls = [];
  destroyed = 0;
  create.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (parsed: Parsed, onLayout?: (markdown: string, oversized: OversizedBlock[]) => void) => act(() => root.render(<PreviewPane parsed={parsed} onLayout={onLayout} createPreview={create} />));
const status = () => container.querySelector("[role=status]")!.textContent;
const settle = (fn: () => void) => act(async () => fn());

test("nothing is drawn until the parser has produced HTML", () => {
  show({ state: "loading" });
  expect(calls).toHaveLength(0);
  expect(status()).toContain("loading the parser");
});

test("the HTML and the book's CSS are sent to the preview, with the page rules filled in", () => {
  show(ready("<h1>Hi</h1>"));
  expect(calls).toHaveLength(1);
  expect(calls[0]!.input.html).toBe("<h1>Hi</h1>");
  expect(calls[0]!.input.css).toContain("--font-body:");
  expect(calls[0]!.input.css).toContain("size: A4;");
  expect(status()).toContain("laying out");
});

test("when the pages are done it says how many and how long", async () => {
  show(ready("<p>a</p>", 2));
  await settle(() => calls[0]!.resolve({ pages: 12, layoutMs: 140, oversized: [] }));
  expect(status()).toMatch(/12 pages · \d+ ms · 2 warnings/);
});

test("new HTML draws again, and an answer that was replaced changes nothing", async () => {
  show(ready("<p>one</p>"));
  show(ready("<p>two</p>"));
  expect(calls.map((c) => c.input.html)).toEqual(["<p>one</p>", "<p>two</p>"]);
  await settle(() => calls[0]!.resolve(null));
  expect(status()).toContain("laying out");
  await settle(() => calls[1]!.resolve({ pages: 1, layoutMs: 1, oversized: [] }));
  expect(status()).toMatch(/1 page · /);
});

test("a failure is shown, not thrown", async () => {
  show(ready("<p>a</p>"));
  await settle(() => calls[0]!.reject(new Error("Paged.js did not load")));
  expect(container.querySelector(".error")!.textContent).toBe("Paged.js did not load");
  expect(status()).toContain("preview error");
});

test("the preview is made once for the pane, and destroyed with it", () => {
  show(ready("<p>a</p>"));
  show(ready("<p>b</p>"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]![0]).toBe(container.querySelector(".preview-host"));
  act(() => root.unmount());
  expect(destroyed).toBe(1);
  root = createRoot(container); // for afterEach
});

const wyrm: OversizedBlock = { index: 3, name: "statblock", heightMm: 461, columnMm: 253 };

test("a component that does not fit in a column is listed, and counted in the status", async () => {
  show(ready("<p>a</p>"));
  await settle(() => calls[0]!.resolve({ pages: 3, layoutMs: 5, oversized: [wyrm] }));
  const items = [...container.querySelectorAll(".layout-warnings li")].map((li) => li.textContent);
  expect(items).toEqual(['A "statblock" is taller than a column (461 mm; a column is 253 mm). It cannot fit on a page: shorten it or split it in two.']);
  expect(status()).toMatch(/3 pages · \d+ ms · 0 warnings · 1 layout problem/);
});

test("nothing is listed when everything fits", async () => {
  show(ready("<p>a</p>"));
  await settle(() => calls[0]!.resolve({ pages: 1, layoutMs: 1, oversized: [] }));
  expect(container.querySelector(".layout-warnings")).toBeNull();
  expect(status()).not.toContain("layout problem");
});

test("onLayout gets the text that was laid out and what was found", async () => {
  const seen: [string, OversizedBlock[]][] = [];
  show({ ...(ready("<p>a</p>") as Extract<Parsed, { state: "ready" }>), markdown: "the text" }, (m, o) => seen.push([m, o]));
  await settle(() => calls[0]!.resolve({ pages: 1, layoutMs: 1, oversized: [wyrm] }));
  expect(seen).toEqual([["the text", [wyrm]]]);
});

test("a layout that was replaced is not reported", async () => {
  const seen: unknown[] = [];
  show(ready("<p>one</p>"), (m, o) => seen.push([m, o]));
  show(ready("<p>two</p>"), (m, o) => seen.push([m, o]));
  await settle(() => calls[0]!.resolve(null));
  expect(seen).toEqual([]);
});
