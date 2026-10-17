// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { ProjectStore } from "@rosetta/contracts";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import type { Preview, PreviewInput } from "@rosetta/preview";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { seed } from "./seed";

// Page numbers across chapters, in the whole app (real editor, parser and store). The preview is a stand-in with a simple rule for
// how many pages a chapter has: one per heading, plus a blank page when a chapter that starts on a right-hand page would start on
// a left-hand one (the real preview does that; it is tested in `preview`).

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: { parse: async (md: string) => real.parse(md), setComponents: async () => {}, ready: async () => {} },
}));
const asked: PreviewInput[] = [];
vi.mock("../src/preview", () => ({
  createAppPreview: (): Preview => ({
    render: async (input) => {
      asked.push(input);
      const headings = (input.html.match(/<h1/g) ?? []).length;
      const blank = input.startOn === "right-page" && (input.startPage ?? 1) % 2 === 0 ? 1 : 0;
      return { pages: Math.max(1, headings) + blank, layoutMs: 1, oversized: [] };
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
  asked.length = 0;
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

const settle = async (ms = 100) => {
  for (let left = ms; left > 0; left -= 50) await act(async () => void (await new Promise((r) => setTimeout(r, Math.min(50, left)))));
};
const until = async (check: () => unknown, ms = 4000) => {
  for (let left = ms; left > 0 && !check(); left -= 50) await settle(50);
  if (!check()) throw new Error("timed out");
};

const three = [
  { id: "a", title: "One", markdown: "# A\n\n# B\n\n# C\n" }, // 3 pages
  { id: "b", title: "Two", markdown: "# D\n\n# E\n" }, // 2 pages
  { id: "c", title: "Three", markdown: "" }, // 1 page
];

async function open(store: ProjectStore, project: { id: string; title: string; updatedAt: string }) {
  const { Workspace } = await import("../src/Workspace");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<Workspace store={store} project={project} />));
  await until(() => document.querySelector(".visual-editor .ProseMirror"));
  await settle(200);
  return { close: async () => (await act(async () => root.unmount()), host.remove(), void roots.splice(roots.findIndex((r) => r.root === root), 1)) };
}

const click = (el: Element) => act(async () => void (el as HTMLElement).click());
const chapterButtons = () => [...document.querySelectorAll<HTMLElement>(".sidebar .chapter-open")];
const select = async (title: string) => {
  await click(chapterButtons().find((b) => b.textContent === title)!);
  await until(() => document.querySelector(".sidebar [aria-current=true]")?.textContent === title);
  await settle(200);
};
/** What the list says about each chapter's pages: "pp. 1–3", or "⚠ p. ?" when it may be out of date. */
const labels = () => [...document.querySelectorAll<HTMLElement>(".sidebar li")].map((li) => li.querySelector(".chapter-pages")?.textContent ?? "");
const lastAsked = () => asked.at(-1)!;
const saved = () => until(() => document.querySelector(".save-status")?.textContent?.includes("Saved"));
const source = () => document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Chapter text']")!;
const typeSource = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source(), value);
    source().dispatchEvent(new Event("input", { bubbles: true }));
  });
const showTab = (name: string) => click([...document.querySelectorAll<HTMLElement>("[role=tab]")].find((t) => t.textContent === name)!);

describe("page numbers across chapters", () => {
  test("a chapter that has not been laid out says so, and each chapter starts after the pages of the ones before", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    expect(lastAsked().startPage).toBe(1);
    expect(labels()).toEqual(["pp. 1–3", "⚠ p. ?", "⚠ p. ?"]); // only the open chapter has been laid out

    await select("Two");
    expect(lastAsked().startPage).toBe(4); // after the three pages of chapter one
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–5", "⚠ p. ?"]);
    await select("Three");
    expect(lastAsked().startPage).toBe(6);
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–5", "p. 6"]);
    expect(document.querySelector(".stale-pages")).toBeNull();
  });

  test("the preview says which page the chapter starts on", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Two");
    await select("Three");
    expect(document.querySelector(".preview header .hint")!.textContent).toContain("(from page 6)");
  });

  test("when an earlier chapter gets longer, the chapters after it are flagged until they are laid out again", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Two");
    await select("Three");
    await select("One");
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–5", "p. 6"]); // everything fresh

    await showTab("Markdown");
    await typeSource("# A\n\n# B\n\n# C\n\n# D\n"); // 4 pages
    await until(() => labels()[0] === "pp. 1–4");
    expect(labels()).toEqual(["pp. 1–4", "⚠ pp. 5–6", "⚠ p. 7"]); // the others move up a page, and are flagged: their own counts are from before
    await saved();
    expect((await store.loadManifest(project.id)).chapters.map((c) => [c.pages, c.stale])).toEqual([[4, undefined], [2, true], [1, true]]);

    await select("Two");
    expect(lastAsked().startPage).toBe(5);
    expect(document.querySelector(".stale-pages")).toBeNull(); // the chapter before it is fresh
    expect(labels()).toEqual(["pp. 1–4", "pp. 5–6", "⚠ p. 7"]); // two is right now; three still needs its turn
    await select("Three");
    expect(labels()).toEqual(["pp. 1–4", "pp. 5–6", "p. 7"]);
  });

  test("a chapter whose count did not change does not flag the ones after it", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Two");
    await select("Three");
    await select("One");
    await showTab("Markdown");
    await typeSource("# Changed title\n\n# B\n\n# C\n"); // still 3 pages
    await settle(900);
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–5", "p. 6"]);
  });

  test("opening a chapter after an unfinished one shows a note that its page numbers may be wrong", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Three"); // chapter one was laid out when the project opened; chapter two has not been
    expect(document.querySelector(".stale-pages")!.textContent).toContain("may be out of date");
    expect(lastAsked().startPage).toBe(5); // chapter one's three pages, and one for chapter two, which is not known yet
  });

  test("a chapter set to start on a right-hand page gets a blank page when it would start on a left-hand one, and the next chapter follows", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Two");
    await select("Three");
    await select("Two");
    expect(lastAsked()).toMatchObject({ startPage: 4, startOn: "next-page" });
    await click(document.querySelector('button[aria-label="Start Two on a right-hand page"]')!);
    await until(() => lastAsked().startOn === "right-page");
    await settle(200);
    expect(lastAsked().startPage).toBe(4); // an even page: it needs a blank page
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–6", "⚠ p. 7"]); // its two pages and the blank: three, so chapter three moves up a page and is flagged
    await select("Three");
    expect(lastAsked().startPage).toBe(7);
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–6", "p. 7"]);
  });

  test("reordering flags the chapters whose numbers change, and they are fixed by opening them", async () => {
    const { store, project } = await seed(three);
    await open(store, project);
    await select("Two");
    await select("Three");
    await select("One");
    await click(document.querySelector('button[aria-label="Move Three up"]')!);
    await click(document.querySelector('button[aria-label="Move Three up"]')!);
    expect(chapterButtons().map((b) => b.textContent)).toEqual(["Three", "One", "Two"]);
    expect(labels()).toEqual(["⚠ p. 1", "⚠ pp. 2–4", "⚠ pp. 5–6"]);
    await select("Three");
    expect(labels()[0]).toBe("p. 1");
  });

  test("counts and flags are kept: opening the project again shows the same numbers", async () => {
    const { store, project } = await seed(three);
    const first = await open(store, project);
    await select("Two");
    await select("Three");
    await saved();
    await first.close();
    await open(store, project);
    expect(labels()).toEqual(["pp. 1–3", "pp. 4–5", "p. 6"]);
  });
});
