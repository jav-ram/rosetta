// @vitest-environment jsdom
import { importProject } from "@rosetta/store-local";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProjectsScreen } from "../src/components/ProjectsScreen";
import { fileNameFor, openProjectFile, saveProjectFile } from "../src/projectFile";
import { BackupReminders, type KeyValueStorage } from "../src/backupReminder";
import "./dom-setup";
import { newStore, seed } from "./seed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  vi.restoreAllMocks();
});
const settle = (ms = 60) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** A stand-in for the browser's save dialog: remembers what it was asked and what was written. */
function fakePicker(options: { cancel?: boolean; fail?: Error } = {}) {
  const log: string[] = [];
  const written: Uint8Array[] = [];
  const env = {
    showSaveFilePicker: async (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => {
      log.push(`picker ${o.suggestedName} ${JSON.stringify(o.types[0]!.accept)}`);
      if (options.cancel) throw new DOMException("closed", "AbortError");
      if (options.fail) throw options.fail;
      return { createWritable: async () => ({ write: async (d: Uint8Array) => void (log.push("write"), written.push(d)), close: async () => void log.push("close") }) };
    },
  };
  return { env, log, written };
}

describe("file names", () => {
  test("a title becomes a safe file name with .rosetta, keeping letters from any language", () => {
    expect(fileNameFor("The Lost Mine")).toBe("The Lost Mine.rosetta");
    expect(fileNameFor("What / why: <A>?")).toBe("What - why- -A.rosetta"); // slashes, colons, brackets and ? replaced, and no dash left at the end
    expect(fileNameFor("日本語の本")).toBe("日本語の本.rosetta");
    expect(fileNameFor("  ..hidden.. ")).toBe("hidden.rosetta");
    expect(fileNameFor("///")).toBe("project.rosetta");
    expect(fileNameFor("")).toBe("project.rosetta");
    expect(fileNameFor("x".repeat(200))).toHaveLength(80 + ".rosetta".length);
  });
});

describe("saving a project as a file", () => {
  test("in a browser with the file dialog: it asks where first, then writes a file that opens as the same project", async () => {
    const { store, project } = await seed();
    const { env, log, written } = fakePicker();
    expect(await saveProjectFile(store, project, env)).toBe("saved");
    expect(log).toEqual(['picker Sample project.rosetta {"application/zip":[".rosetta"]}', "write", "close"]); // dialog first, then the data
    expect(Array.from(written[0]!.slice(0, 2))).toEqual([0x50, 0x4b]); // "PK": a zip
    const copy = await importProject(await newStore(), written[0]!);
    expect(copy.title).toBe("Sample project");
  });

  test("closing the dialog is not an error, and nothing is written", async () => {
    const { store, project } = await seed();
    const { env, log } = fakePicker({ cancel: true });
    expect(await saveProjectFile(store, project, env)).toBe("cancelled");
    expect(log).toHaveLength(1);
  });

  test("any other failure of the dialog is passed on", async () => {
    const { store, project } = await seed();
    await expect(saveProjectFile(store, project, fakePicker({ fail: new Error("not allowed") }).env)).rejects.toThrow("not allowed");
  });

  test("without the file dialog the browser downloads it, under the right name", async () => {
    const { store, project } = await seed();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });
    expect(await saveProjectFile(store, project, {})).toBe("saved");
    expect(clicked).toEqual([{ download: "Sample project.rosetta", href: "blob:test" }]);
    const blob = (URL.createObjectURL as unknown as { mock: { calls: Blob[][] } }).mock.calls[0]![0]!;
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(100);
  });
});

describe("opening a file", () => {
  test("a .rosetta file becomes a new project", async () => {
    const { store, project } = await seed();
    const { env, written } = fakePicker();
    await saveProjectFile(store, project, env);
    const target = await newStore();
    const opened = await openProjectFile(target, new File([written[0]! as BlobPart], "book.rosetta"));
    expect(opened.title).toBe("Sample project");
    expect((await target.loadManifest(opened.id)).chapters.map((c) => c.title)).toEqual(["Introduction", "Bestiary", "Empty chapter"]);
  });

  test("a file that is not a project gives a message with its name and what is wrong", async () => {
    const target = await newStore();
    await expect(openProjectFile(target, new File(["just text"], "notes.rosetta"))).rejects.toThrow(/“notes.rosetta” cannot be opened. This is not a Rosetta project file/);
    expect(await target.listProjects()).toEqual([]);
  });
});

function reminders() {
  const data = new Map<string, string>();
  const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  return new BackupReminders(storage, () => Date.UTC(2026, 9, 1));
}

async function mountScreen(store: Awaited<ReturnType<typeof newStore>>, saveFile = vi.fn(async (): Promise<"saved" | "cancelled"> => "saved"), notes = reminders()) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<ProjectsScreen store={store} onOpen={() => {}} saveFile={saveFile} reminders={notes} />));
  await settle();
  return { saveFile, notes };
}
const titles = () => [...document.querySelectorAll(".projects-open strong")].map((e) => e.textContent);
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const chooseFile = (file: File) =>
  act(async () => {
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
  });

describe("on the projects screen", () => {
  test("Export saves that project as a file, and says it did", async () => {
    const { store, project } = await seed();
    const { saveFile } = await mountScreen(store);
    await act(async () => void button("Export Sample project").click());
    await settle();
    expect(saveFile).toHaveBeenCalledWith(store, expect.objectContaining({ id: project.id, title: "Sample project" }));
    expect(button("Export Sample project").textContent).toBe("Exported ✓");
  });

  test("closing the save dialog leaves it as it was", async () => {
    const { store } = await seed();
    await mountScreen(store, vi.fn(async (): Promise<"saved" | "cancelled"> => "cancelled"));
    await act(async () => void button("Export Sample project").click());
    await settle();
    expect(button("Export Sample project").textContent).toBe("Export");
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  test("Import makes a project from a file and lists it", async () => {
    const { store, project } = await seed();
    const { env, written } = fakePicker();
    await saveProjectFile(store, project, env);
    await mountScreen(store);
    expect(titles()).toEqual(["Sample project"]);
    await chooseFile(new File([written[0]! as BlobPart], "copy.rosetta"));
    expect(titles()).toEqual(["Sample project", "Sample project"]); // a second project, with the same title
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  test("a file that is not a project shows what is wrong, and the list is unchanged", async () => {
    const { store } = await seed();
    await mountScreen(store);
    await chooseFile(new File(["not a zip"], "bad.rosetta"));
    expect(document.querySelector("[role=alert]")!.textContent).toMatch(/“bad.rosetta” cannot be opened/);
    expect(titles()).toEqual(["Sample project"]);
  });
});

describe("the backup reminder, from the projects screen", () => {
  test("exporting a project counts as a backup, and closing the dialog does not", async () => {
    const { store, project } = await seed();
    const { notes } = await mountScreen(store, vi.fn(async (): Promise<"saved" | "cancelled"> => "cancelled"));
    await act(async () => void button("Export Sample project").click());
    await settle();
    expect(notes.state(project.id).lastBackupAt).toBeUndefined();
    const again = await mountScreen(store);
    await act(async () => void [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Export Sample project"]')].pop()!.click());
    await settle();
    expect(again.notes.state(project.id).lastBackupAt).toBeDefined();
  });

  test("a project imported from a file counts as backed up", async () => {
    const { store, project } = await seed();
    const { env, written } = fakePicker();
    await saveProjectFile(store, project, env);
    const { notes } = await mountScreen(store);
    await chooseFile(new File([written[0]! as BlobPart], "copy.rosetta"));
    const imported = (await store.listProjects()).find((p) => p.id !== project.id)!;
    expect(notes.state(imported.id).lastBackupAt).toBeDefined();
    expect(notes.isDue(imported.id)).toBe(false);
  });

  test("deleting a project forgets its reminder", async () => {
    const { store, project } = await seed();
    const { notes } = await mountScreen(store);
    notes.noteOpened(project.id);
    await act(async () => void button("Delete Sample project").click());
    await act(async () => void [...document.querySelectorAll<HTMLButtonElement>(".projects-confirm button")].find((b) => b.textContent === "Delete")!.click());
    await settle();
    expect(notes.state(project.id)).toEqual({});
  });
});
