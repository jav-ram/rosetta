// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { ProjectStore } from "@rosetta/contracts";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { BackupReminders, type KeyValueStorage } from "../src/backupReminder";
import { newStore, seed } from "./seed";

// A project in the whole workspace: the chapter list, the editor and autosave, with the real editor, parser and LocalStore.

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

async function open(store: ProjectStore, project: { id: string; title: string; updatedAt: string }, saveFile?: never, reminders?: BackupReminders) {
  const { Workspace } = await import("../src/Workspace");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<Workspace store={store} project={project} saveFile={saveFile} reminders={reminders} />));
  await until(() => document.querySelector(".visual-editor .ProseMirror") || document.querySelector(".empty-project") || document.querySelector("[role=alert]"));
  await settle();
  return { close: async () => (await act(async () => root.unmount()), host.remove(), void roots.splice(roots.findIndex((r) => r.root === root), 1)) };
}

const click = (el: Element) => act(async () => void (el as HTMLElement).click());
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const chapterButtons = () => [...document.querySelectorAll<HTMLElement>(".sidebar .chapter-open")];
const titles = () => chapterButtons().map((b) => b.textContent);
const activeTitle = () => document.querySelector(".sidebar [aria-current=true]")?.textContent;
const select = (title: string) => click(chapterButtons().find((b) => b.textContent === title)!);
const source = () => document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Chapter text']")!;
const status = () => document.querySelector(".save-status")?.textContent ?? "";
const showTab = (name: string) => click([...document.querySelectorAll<HTMLElement>("[role=tab]")].find((t) => t.textContent === name)!);
/** Types into the Markdown view, as the browser does. */
const typeSource = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source(), value);
    source().dispatchEvent(new Event("input", { bubbles: true }));
  });
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const saved = () => until(() => status().includes("Saved"));

describe("export", () => {
  const exportButton = () => [...document.querySelectorAll<HTMLButtonElement>(".topbar button")].find((b) => /^Export/.test(b.textContent ?? ""))!;

  test("what was just typed is written to the project first, then the file is saved", async () => {
    const { store, project } = await seed();
    let storedWhenSaving: string | null = null;
    const saveFile = vi.fn(async () => {
      storedWhenSaving = await store.loadChapter(project.id, "intro");
      return "saved" as const;
    });
    await open(store, project, saveFile as never);
    await showTab("Markdown");
    await typeSource("# Typed just now\n");
    await click(exportButton()); // before the autosave has had its turn
    await until(() => exportButton().textContent === "Exported ✓");
    expect(saveFile).toHaveBeenCalledWith(store, expect.objectContaining({ id: project.id }));
    expect(storedWhenSaving).toBe("# Typed just now\n");
  });

  test("closing the save dialog is not an error", async () => {
    const { store, project } = await seed();
    await open(store, project, vi.fn(async () => "cancelled" as const) as never);
    await click(exportButton());
    await settle(200);
    expect(exportButton().textContent).toBe("Export");
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  test("a failure says what happened", async () => {
    const { store, project } = await seed();
    await open(store, project, vi.fn(async () => Promise.reject(new Error("the disk is full"))) as never);
    await click(exportButton());
    await until(() => document.querySelector("[role=alert]"));
    expect(document.querySelector("[role=alert]")!.textContent).toContain("the disk is full");
  });
});

describe("backup reminder", () => {
  const DAY = 24 * 60 * 60 * 1000;
  /** Reminders on a clock and storage the test controls. */
  function clock(start = Date.UTC(2026, 9, 1)) {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    let now = start;
    return { storage, reminders: new BackupReminders(storage, () => now), later: (days: number) => void (now += days * DAY) };
  }
  const banner = () => document.querySelector<HTMLElement>('[aria-label="Backup reminder"]');
  const bannerButton = (label: string) => [...banner()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;

  test("a project opened for the first time has no reminder", async () => {
    const { store, project } = await seed();
    const { reminders } = clock();
    await open(store, project, undefined, reminders);
    expect(banner()).toBeNull();
    expect(reminders.state(project.id).unbackedSince).toBeDefined(); // but it has started counting
  });

  test("after a week of changes without a backup the reminder appears, says how long, and can be dismissed", async () => {
    const { store, project } = await seed();
    const { reminders, later } = clock();
    reminders.noteOpened(project.id);
    later(9);
    await open(store, project, undefined, reminders);
    expect(banner()!.textContent).toContain("Back up “Sample project”?");
    expect(banner()!.textContent).toContain("9 days");
    expect(banner()!.textContent).toContain("There is no backup yet");
    await click(bannerButton("Not now"));
    expect(banner()).toBeNull();
    expect(reminders.state(project.id).dismissedAt).toBeDefined();
    expect(reminders.isDue(project.id)).toBe(false);
  });

  test("a dismissed reminder is still dismissed when the project is opened again, and comes back a week later", async () => {
    const { store, project } = await seed();
    const { reminders, later } = clock();
    reminders.noteOpened(project.id);
    later(8);
    const first = await open(store, project, undefined, reminders);
    await click(bannerButton("Not now"));
    await first.close();
    later(3);
    const second = await open(store, project, undefined, reminders);
    expect(banner()).toBeNull();
    await second.close();
    later(5);
    await open(store, project, undefined, reminders);
    expect(banner()).not.toBeNull();
  });

  test("Export a backup saves the file and the reminder goes away for good", async () => {
    const { store, project } = await seed();
    const { reminders, later } = clock();
    reminders.noteOpened(project.id);
    later(10);
    const saveFile = vi.fn(async () => "saved" as const);
    await open(store, project, saveFile as never, reminders);
    await click(bannerButton("Export a backup"));
    await until(() => banner() === null);
    expect(saveFile).toHaveBeenCalledWith(store, expect.objectContaining({ id: project.id }));
    expect(reminders.state(project.id)).toEqual({ lastBackupAt: new Date(Date.UTC(2026, 9, 11)).toISOString() });
  });

  test("closing the save dialog does not count as a backup", async () => {
    const { store, project } = await seed();
    const { reminders, later } = clock();
    reminders.noteOpened(project.id);
    later(10);
    await open(store, project, vi.fn(async () => "cancelled" as const) as never, reminders);
    await click(bannerButton("Export a backup"));
    await settle(200);
    expect(banner()).not.toBeNull();
    expect(reminders.state(project.id).lastBackupAt).toBeUndefined();
  });

  test("after a backup, the next change starts the count again, and last backup is shown in the reminder", async () => {
    const { store, project } = await seed();
    const { reminders, later } = clock();
    reminders.noteBackup(project.id);
    later(2);
    await open(store, project, undefined, reminders);
    expect(reminders.state(project.id).unbackedSince).toBeUndefined(); // nothing changed yet
    await showTab("Markdown");
    await typeSource("# Changed after the backup\n");
    await saved();
    expect(reminders.state(project.id).unbackedSince).toBeDefined();
    later(8);
    await click(document.querySelector('button[aria-label="Add chapter"]')!); // any later render shows it
    expect(banner()!.textContent).toContain("Last backup: ");
    expect(banner()!.textContent).toContain("8 days");
  });
});

describe("opening a project", () => {
  test("the chapters of the project are listed, and the first one is open with its text from the store", async () => {
    const { store, project } = await seed();
    await open(store, project);
    expect(titles()).toEqual(["Introduction", "Bestiary", "Empty chapter"]);
    expect(activeTitle()).toBe("Introduction");
    await showTab("Markdown");
    expect(source().value).toContain("Welcome to **Rosetta**");
    expect(status()).toContain("Saved");
    expect(document.querySelector(".topbar")!.textContent).toContain("Sample project · Introduction");
  });

  test("a project that cannot be opened says so", async () => {
    const store = await newStore();
    await open(store, { id: "gone", title: "Gone", updatedAt: "2026-01-01T00:00:00Z" });
    await until(() => document.querySelector("[role=alert]"));
    expect(document.querySelector("[role=alert]")!.textContent).toContain("cannot be opened");
  });

  test("a project with no chapters says how to add one", async () => {
    const { store, project } = await seed([]);
    await open(store, project);
    expect(document.querySelector(".empty-project")!.textContent).toContain("no chapters");
  });
});

describe("autosave", () => {
  test("typing is saved after a moment, and the indicator says so", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await showTab("Markdown");
    await typeSource("# Changed\n");
    expect(status()).toContain("Saving");
    await saved();
    expect(await store.loadChapter(project.id, "intro")).toBe("# Changed\n");
  });

  test("what is typed in a chapter is kept when going to another chapter and back, and is saved", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await showTab("Markdown");
    await typeSource("# Intro, edited\n");
    await select("Bestiary"); // before the save has happened
    await until(() => activeTitle() === "Bestiary");
    expect(source().value).toContain("Bone Warden");
    await select("Introduction");
    await until(() => activeTitle() === "Introduction");
    expect(source().value).toBe("# Intro, edited\n");
    await saved();
    expect(await store.loadChapter(project.id, "intro")).toBe("# Intro, edited\n");
    expect(await store.loadChapter(project.id, "bestiary")).toContain("Bone Warden"); // the other one is untouched
  });

  test("a save that fails says so, keeps the text, and Retry writes it", async () => {
    const { store, project } = await seed();
    let fail = true;
    const flaky = Object.assign(Object.create(store), {
      saveChapter: async (...a: Parameters<ProjectStore["saveChapter"]>) => {
        if (fail) throw new Error("storage is full");
        return store.saveChapter(...a);
      },
    }) as ProjectStore;
    await open(flaky, project);
    await showTab("Markdown");
    await typeSource("# Keep this\n");
    await until(() => status().includes("Not saved"));
    expect(status()).toContain("storage is full");
    fail = false;
    await click([...document.querySelectorAll<HTMLElement>(".save-status button")].find((b) => b.textContent === "Retry")!);
    await saved();
    expect(await store.loadChapter(project.id, "intro")).toBe("# Keep this\n");
  });

  test("opening the project again shows what was saved", async () => {
    const { store, project } = await seed();
    const first = await open(store, project);
    await showTab("Markdown");
    await typeSource("# Still here\n");
    await saved();
    await first.close();
    await open(store, project);
    await showTab("Markdown");
    expect(source().value).toBe("# Still here\n");
  });
});

describe("chapters", () => {
  test("a chapter is added, opened, written in and saved", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await click(button("Add chapter"));
    await until(() => activeTitle() === "Chapter 4");
    expect(titles()).toEqual(["Introduction", "Bestiary", "Empty chapter", "Chapter 4"]);
    await showTab("Markdown");
    expect(source().value).toBe("");
    await typeSource("# New\n");
    await saved();
    const manifest = await store.loadManifest(project.id);
    expect(manifest.chapters.map((c) => c.title)).toEqual(["Introduction", "Bestiary", "Empty chapter", "Chapter 4"]);
    expect(await store.loadChapter(project.id, manifest.chapters[3]!.id)).toBe("# New\n");
  });

  test("a chapter is set to start on a right-hand page, shown with a badge, and saved", async () => {
    const { store, project } = await seed();
    await open(store, project);
    expect(document.querySelectorAll(".chapter-badge")).toHaveLength(0);
    await click(button("Start Bestiary on a right-hand page"));
    expect(button("Start Bestiary on a right-hand page").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".chapter-badge")).toHaveLength(1);
    await saved();
    expect((await store.loadManifest(project.id)).chapters.map((c) => c.start)).toEqual([undefined, "right-page", undefined]);
    await click(button("Start Bestiary on a right-hand page")); // and off again
    await saved();
    expect((await store.loadManifest(project.id)).chapters[1]).not.toHaveProperty("start");
  });

  test("a chapter is renamed, and keeps its text", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await click(button("Rename Bestiary"));
    await type(document.querySelector<HTMLInputElement>("input[aria-label='New title for Bestiary']")!, "Monsters");
    await act(async () => void document.querySelector("form.chapter-rename")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(titles()).toEqual(["Introduction", "Monsters", "Empty chapter"]);
    await saved();
    const manifest = await store.loadManifest(project.id);
    expect(manifest.chapters[1]).toMatchObject({ id: "bestiary", title: "Monsters" });
    expect(await store.loadChapter(project.id, "bestiary")).toContain("Bone Warden");
  });

  test("a chapter is deleted after asking, and the next one opens", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await select("Bestiary");
    await until(() => activeTitle() === "Bestiary");
    await click(button("Delete Bestiary"));
    expect(document.body.textContent).toContain("and its text?");
    await click([...document.querySelectorAll<HTMLElement>(".chapter-confirm button")].find((b) => b.textContent === "Cancel")!);
    expect(titles()).toHaveLength(3);
    await click(button("Delete Bestiary"));
    await click([...document.querySelectorAll<HTMLElement>(".chapter-confirm button")].find((b) => b.textContent === "Delete")!);
    await until(() => activeTitle() === "Empty chapter");
    expect(titles()).toEqual(["Introduction", "Empty chapter"]);
    await saved();
    expect((await store.loadManifest(project.id)).chapters.map((c) => c.id)).toEqual(["intro", "empty"]);
    await expect(store.loadChapter(project.id, "bestiary")).rejects.toMatchObject({ code: "not-found" });
  });

  test("deleting the last chapter leaves an empty project, and a chapter can be added again", async () => {
    const { store, project } = await seed([{ id: "only", title: "Only", markdown: "x" }]);
    await open(store, project);
    await click(button("Delete Only"));
    await click([...document.querySelectorAll<HTMLElement>(".chapter-confirm button")].find((b) => b.textContent === "Delete")!);
    await until(() => document.querySelector(".empty-project"));
    await click(button("Add chapter"));
    await until(() => document.querySelector(".visual-editor .ProseMirror"));
    expect(titles()).toEqual(["Chapter 1"]);
  });

  test("chapters are reordered with the arrows, and each keeps its own text", async () => {
    const { store, project } = await seed();
    await open(store, project);
    await click(button("Move Empty chapter up"));
    await click(button("Move Introduction down"));
    expect(titles()).toEqual(["Empty chapter", "Introduction", "Bestiary"]);
    expect(button("Move Empty chapter up").disabled).toBe(true); // first
    expect(button("Move Bestiary down").disabled).toBe(true); // last
    await saved();
    expect((await store.loadManifest(project.id)).chapters.map((c) => c.id)).toEqual(["empty", "intro", "bestiary"]);
    expect(await store.loadChapter(project.id, "bestiary")).toContain("Bone Warden");
    expect(activeTitle()).toBe("Introduction"); // the open chapter stays open
  });

  test("a chapter is reordered by dragging it", async () => {
    const { store, project } = await seed();
    await open(store, project);
    const items = [...document.querySelectorAll<HTMLElement>(".sidebar li")];
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "", setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? "" };
    const fire = (el: Element, type: string) => act(async () => void el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer })));
    await fire(items[2]!, "dragstart");
    await fire(items[0]!, "dragover");
    await fire(items[0]!, "drop");
    expect(titles()).toEqual(["Empty chapter", "Introduction", "Bestiary"]);
  });
});

describe("a project of 20 chapters", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}`, markdown: `# Chapter ${i + 1}\n\nText of chapter ${i + 1}.\n` }));

  test("every chapter opens with its text, can be edited and reordered, and nothing is lost", async () => {
    const { store, project } = await seed(twenty);
    await open(store, project);
    await showTab("Markdown");
    expect(titles()).toHaveLength(20);

    // open every chapter, and edit every fifth
    const expected = new Map(twenty.map((c) => [c.id, c.markdown]));
    for (const [i, c] of twenty.entries()) {
      await select(c.title);
      await until(() => activeTitle() === c.title && source().value === expected.get(c.id));
      if (i % 5 === 0) {
        const edited = `${expected.get(c.id)}\nEdited ${c.id}.\n`;
        await typeSource(edited);
        expected.set(c.id, edited);
      }
    }
    // reorder: last to first, a middle one to the end
    await click(button("Move Chapter 20 up"));
    for (let i = 0; i < 18; i++) await click(button(`Move Chapter 20 up`));
    await click(button("Move Chapter 10 down"));
    const order = titles();
    expect(order[0]).toBe("Chapter 20");
    await saved();

    // what is stored
    const manifest = await store.loadManifest(project.id);
    expect(manifest.chapters.map((c) => c.title)).toEqual(order);
    expect(new Set(manifest.chapters.map((c) => c.id)).size).toBe(20);
    for (const c of manifest.chapters) expect(await store.loadChapter(project.id, c.id), c.id).toBe(expected.get(c.id));
  });
});
