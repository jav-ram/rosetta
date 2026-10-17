// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { ProjectStore } from "@rosetta/contracts";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { BackupReminders } from "../src/backupReminder";
import type { MakePreview } from "../src/images/previewMaker";
import { seed } from "./seed";

// Adding images in the whole workspace, with the real LocalStore. The worker that makes previews is replaced by a stand-in.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: { parse: async (md: string) => real.parse(md), setComponents: async () => {}, ready: async () => {} },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  real = await instantiate(readFileSync(dist("rosetta.wasm")));
  // jsdom cannot make addresses for files.
  let n = 0;
  URL.createObjectURL = () => `blob:test/${++n}`;
  URL.revokeObjectURL = () => {};
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

async function open(store: ProjectStore, project: { id: string; title: string; updatedAt: string }, makePreview: MakePreview = async () => null, reminders?: BackupReminders) {
  const { Workspace } = await import("../src/Workspace");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<Workspace store={store} project={project} makePreview={makePreview} reminders={reminders} />));
  await until(() => document.querySelector(".visual-editor .ProseMirror") || document.querySelector(".empty-project"));
  await settle();
}

const untilStored = async (read: () => Promise<string>, check: (text: string) => boolean, ms = 4000) => {
  for (let left = ms; left > 0 && !check(await read()); left -= 100) await settle(100);
};
const image = (name: string, bytes = [1, 2, 3], type = "image/png") => new File([new Uint8Array(bytes)], name, { type });
const names = () => [...document.querySelectorAll(".images .image-name")].map((n) => n.textContent);
const choose = (files: File[]) =>
  act(async () => {
    const input = document.querySelector<HTMLInputElement>(".images input[type=file]")!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
const dragEvent = (type: string, init: { files?: File[]; types?: string[] }) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: { types: init.types ?? ["Files"], files: init.files ?? [] } });
  return e;
};
const small = (...bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: "image/webp" });

describe("images in the workspace", () => {
  test("a project with no images says so", async () => {
    const { store, project } = await seed();
    await open(store, project);
    expect(document.querySelector(".images")!.textContent).toContain("No images yet");
  });

  test("choosing files adds them to the list and to the project, with a thumbnail each", async () => {
    const { store, project } = await seed();
    await open(store, project, async () => small(1));
    await choose([image("tavern.png"), image("map.jpg", [4], "image/jpeg")]);
    await until(() => names().length === 2);
    expect(names()).toEqual(["tavern.png", "map.jpg"]);
    expect((await store.listAssets(project.id)).map((a) => a.name)).toEqual(["tavern.png", "map.jpg"]);
    await until(() => document.querySelectorAll(".images img").length === 2);
    expect(document.querySelector(".images")!.textContent).not.toContain("Adding images");
  });

  test("the images of the project are listed when it is opened", async () => {
    const { store, project } = await seed();
    await store.putAsset(project.id, image("old.png"));
    await open(store, project);
    await until(() => names().length === 1);
    expect(names()).toEqual(["old.png"]);
  });

  test("the thumbnail turns into the preview copy when it is ready", async () => {
    const { store, project } = await seed();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await open(store, project, async () => (await gate, small(1)));
    await choose([image("big.png", [1, 2, 3, 4])]);
    await until(() => names().length === 1);
    expect(document.querySelector(".images")!.textContent).toContain("preparing previews");
    await act(async () => release());
    await until(() => !document.querySelector(".images")!.textContent!.includes("preparing previews"));
    const [ref] = await store.listAssets(project.id);
    expect((await store.getAsset(project.id, ref!, "preview")).size).toBe(1);
  });

  test("dropping files on the editor adds the images; other files are named as not added", async () => {
    const { store, project } = await seed();
    await open(store, project);
    const shell = document.querySelector(".shell")!;
    await act(async () => void shell.dispatchEvent(dragEvent("dragover", {})));
    expect(document.querySelector(".drop-overlay")).not.toBeNull();
    await act(async () => void shell.dispatchEvent(dragEvent("drop", { files: [image("dragon.png"), image("notes.txt", [1], "text/plain")] })));
    await until(() => names().length === 1);
    expect(names()).toEqual(["dragon.png"]);
    expect(document.querySelector(".drop-overlay")).toBeNull();
    await until(() => document.querySelector(".image-problems"));
    expect(document.querySelector(".image-problems")!.textContent).toContain("notes.txt was not added");
  });

  test("dragging a chapter in the list is not a file drop", async () => {
    const { store, project } = await seed();
    await open(store, project);
    const e = dragEvent("dragover", { types: ["text/plain"] });
    await act(async () => void document.querySelector(".shell")!.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(false);
    expect(document.querySelector(".drop-overlay")).toBeNull();
  });

  test("adding images counts as a change for the backup reminder", async () => {
    const { store, project } = await seed();
    const storage = new Map<string, string>();
    let now = new Date("2026-10-01T10:00:00Z").getTime();
    const reminders = new BackupReminders({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) }, () => now);
    await open(store, project, async () => null, reminders);
    now = new Date("2026-10-10T10:00:00Z").getTime(); // nine days later, with a backup in between
    reminders.noteBackup(project.id);
    now = new Date("2026-10-11T10:00:00Z").getTime();
    await choose([image("a.png")]);
    await until(() => names().length === 1);
    expect(reminders.state(project.id).unbackedSince).toBe(new Date(now).toISOString());
  });
});

describe("figures", () => {
  const insertButton = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="Insert ${name} as a figure"]`)!;
  const chapterText = (store: ProjectStore, projectId: string) => store.loadChapter(projectId, "intro");

  test("Insert puts a figure with the image at the end of the chapter, and it is saved", async () => {
    const { store, project } = await seed();
    await store.putAsset(project.id, image("tavern.png"));
    await open(store, project);
    await until(() => insertButton("tavern.png"));
    const before = await chapterText(store, project.id);
    await act(async () => void insertButton("tavern.png").click());
    await untilStored(() => chapterText(store, project.id), (t) => t.includes("::figure"));
    const after = await chapterText(store, project.id);
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(after.endsWith('\n\n::figure{src="tavern.png"}\n')).toBe(true);
  });

  test("Page puts the image at the end of the chapter as a full page of art", async () => {
    const { store, project } = await seed();
    await store.putAsset(project.id, image("dragon.png"));
    await open(store, project);
    await until(() => document.querySelector('button[aria-label="Insert dragon.png as a page of art"]'));
    await act(async () => void document.querySelector<HTMLButtonElement>('button[aria-label="Insert dragon.png as a page of art"]')!.click());
    await untilStored(() => chapterText(store, project.id), (t) => t.includes("::page"));
    expect((await chapterText(store, project.id)).endsWith('\n\n::page{template="art-full" art="dragon.png"}\n')).toBe(true);
  });

  test("two images with one name are told apart by their id", async () => {
    const { store, project } = await seed();
    const a = await store.putAsset(project.id, image("map.png"));
    const b = await store.putAsset(project.id, image("map.png", [9]));
    await open(store, project);
    await until(() => document.querySelectorAll('button[aria-label$="as a figure"]').length === 2);
    await act(async () => void document.querySelectorAll<HTMLButtonElement>('button[aria-label$="as a figure"]')[1]!.click());
    await untilStored(() => chapterText(store, project.id), (t) => t.includes("::figure"));
    const text = await chapterText(store, project.id);
    expect(text).toContain(`src="${b.id}"`);
    expect(text).not.toContain(a.id);
  });

  test("no chapter open, no Insert", async () => {
    const { store, project } = await seed([]);
    await store.putAsset(project.id, image("tavern.png"));
    await open(store, project);
    await settle(300);
    expect(document.querySelector(".image-insert")).toBeNull();
  });
});
