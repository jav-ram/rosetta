// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { ExportError, type ExportOptions, type ExportResult, type Exporter, type ProjectStore } from "@rosetta/contracts";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { ProjectsScreen } from "../src/components/ProjectsScreen";
import { seed } from "./seed";

// Exporting the book as a PDF from the editor and from the projects list, with a stand-in exporter (the real one is tested in
// exporter-browser, and the layout in preview).

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: { parse: async (md: string) => real.parse(md), setComponents: async () => {}, ready: async () => {} },
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
const settle = async (ms = 100) => {
  for (let left = ms; left > 0; left -= 50) await act(async () => void (await new Promise((r) => setTimeout(r, Math.min(50, left)))));
};
const until = async (check: () => unknown, ms = 4000) => {
  for (let left = ms; left > 0 && !check(); left -= 50) await settle(50);
  if (!check()) throw new Error("timed out");
};

/** An exporter that does what the test says, one step at a time. */
function fakeExporter(run?: (projectId: string, options: ExportOptions) => Promise<ExportResult>) {
  const calls: { projectId: string; options: ExportOptions }[] = [];
  const create = vi.fn((_store: ProjectStore): Exporter => ({
    exportBook: async (projectId, options = {}) => {
      calls.push({ projectId, options });
      return run ? run(projectId, options) : { pages: 7, warnings: [] };
    },
  }));
  return { create, calls };
}

async function openEditor(createExporter: (s: ProjectStore) => Exporter) {
  const { Workspace } = await import("../src/Workspace");
  const { store, project } = await seed();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<Workspace store={store} project={project} createExporter={createExporter} />));
  await until(() => document.querySelector(".visual-editor .ProseMirror"));
  await settle();
  return { store, project };
}

const pdfButton = () => [...document.querySelectorAll<HTMLButtonElement>(".topbar button")].find((b) => b.textContent === "Export PDF")!;
const dialog = () => document.querySelector("[role=dialog]");
const click = (el: Element) => act(async () => void (el as HTMLElement).click());

describe("Export PDF in the editor", () => {
  test("starts the export of this project, and shows what it is doing", async () => {
    let report!: NonNullable<ExportOptions["onProgress"]>;
    let finish!: (r: ExportResult) => void;
    const { create, calls } = fakeExporter((_id, options) => {
      report = options.onProgress!;
      return new Promise((resolve) => (finish = resolve));
    });
    const { project } = await openEditor(create);
    expect(dialog()).toBeNull();
    await click(pdfButton());
    await until(() => calls.length === 1);
    expect(calls[0]!.projectId).toBe(project.id);
    expect(dialog()!.textContent).toContain("Export “Sample project” as PDF");
    await act(async () => report({ stage: "layout", message: "Laying out page 12", done: 12, total: 0 }));
    expect(dialog()!.textContent).toContain("Laying out page 12");
    expect(dialog()!.querySelector("progress")!.hasAttribute("value")).toBe(false); // not known how long: no fixed bar
    await act(async () => report({ stage: "images", message: "Loading images (2 of 8)", done: 2, total: 8 }));
    expect(dialog()!.querySelector("progress")!.getAttribute("value")).toBe("2");
    expect(pdfButton().disabled).toBe(true);
    await act(async () => finish({ pages: 24, warnings: [] }));
    expect(dialog()!.textContent).toContain("Done: the book has 24 pages");
  });

  test("while the print dialog is open it says what to choose, and cannot be cancelled", async () => {
    let report!: NonNullable<ExportOptions["onProgress"]>;
    const { create } = fakeExporter((_id, options) => {
      report = options.onProgress!;
      return new Promise(() => {});
    });
    await openEditor(create);
    await click(pdfButton());
    await until(() => report);
    await act(async () => report({ stage: "printing", message: "Opening the print dialog", done: 3, total: 3 }));
    expect(dialog()!.textContent).toContain("choose “Save as PDF”");
    expect([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.disabled).toBe(true);
  });

  test("what was just typed is written to the project first, so the PDF is what is on screen", async () => {
    let stored: string | null = null;
    const { create } = fakeExporter(async (projectId) => {
      stored = await (create.mock.calls[0]![0] as ProjectStore).loadChapter(projectId, "intro");
      return { pages: 1, warnings: [] };
    });
    await openEditor(create);
    await click([...document.querySelectorAll<HTMLElement>("[role=tab]")].find((t) => t.textContent === "Markdown")!);
    const source = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Chapter text']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "# Typed just now\n");
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(pdfButton()); // before the autosave has had its turn
    await until(() => stored !== null);
    expect(stored).toBe("# Typed just now\n");
  });

  test("things to know that came with a finished export are listed", async () => {
    const { create } = fakeExporter(async () => ({ pages: 3, warnings: ["The image “gone.png” is not in the project, so a gray placeholder is printed in its place."] }));
    await openEditor(create);
    await click(pdfButton());
    await until(() => dialog()?.textContent?.includes("Done"));
    expect(dialog()!.querySelector("[aria-label='Things to know'] li")!.textContent).toContain("gone.png");
    await click([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Close")!);
    expect(dialog()).toBeNull();
    expect(pdfButton().disabled).toBe(false);
  });

  test("cancelling stops it and closes the window quietly", async () => {
    const { create, calls } = fakeExporter(
      (_id, options) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(new ExportError("cancelled", "The export was cancelled")));
        }),
    );
    await openEditor(create);
    await click(pdfButton());
    await until(() => calls.length === 1);
    await click([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!);
    await until(() => dialog() === null);
    expect(calls[0]!.options.signal!.aborted).toBe(true);
  });

  test("a failure says why, and can be closed", async () => {
    const { create } = fakeExporter(async () => Promise.reject(new ExportError("empty", "There is nothing to export: the book has no text yet")));
    await openEditor(create);
    await click(pdfButton());
    await until(() => document.querySelector("[role=alert].export-error"));
    expect(document.querySelector(".export-error")!.textContent).toBe("The PDF could not be made: There is nothing to export: the book has no text yet");
    await click([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Close")!);
    expect(dialog()).toBeNull();
  });

  test("a second click while one is running does not start another", async () => {
    const { create, calls } = fakeExporter(() => new Promise(() => {}));
    await openEditor(create);
    await click(pdfButton());
    await until(() => calls.length === 1);
    await click(pdfButton());
    await settle(150);
    expect(calls).toHaveLength(1);
  });
});

describe("PDF in the projects list", () => {
  test("exports that project, and is not a backup", async () => {
    const { create, calls } = fakeExporter();
    const { store, project } = await seed();
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => root.render(<ProjectsScreen store={store} onOpen={() => {}} createExporter={create} />));
    await until(() => document.querySelector(`button[aria-label="Export ${project.title} as PDF"]`));
    await click(document.querySelector(`button[aria-label="Export ${project.title} as PDF"]`)!);
    await until(() => calls.length === 1);
    expect(calls[0]!.projectId).toBe(project.id);
    await until(() => dialog()?.textContent?.includes("Done: the book has 7 pages"));
  });
});
