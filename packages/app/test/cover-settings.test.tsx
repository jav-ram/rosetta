// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { ProjectStore } from "@rosetta/contracts";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import "./dom-setup";
import { seed } from "./seed";

// The cover setting in the editor, with the real store: what is chosen is written to the project's manifest.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let real: RosettaParser;
vi.mock("../src/parser", () => ({
  parser: { parse: async (md: string) => real.parse(md), setComponents: async () => {}, ready: async () => {} },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  real = await instantiate(readFileSync(dist("rosetta.wasm")));
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

async function openEditor(withImages: string[] = []) {
  const { Workspace } = await import("../src/Workspace");
  const { store, project } = await seed();
  for (const name of withImages) await store.putAsset(project.id, new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<Workspace store={store} project={project} makePreview={async () => null} />));
  await until(() => document.querySelector(".visual-editor .ProseMirror"));
  await settle();
  return { store: store as ProjectStore, project };
}

const click = (el: Element) => act(async () => void (el as HTMLElement).click());
const coverButton = () => [...document.querySelectorAll<HTMLButtonElement>(".topbar button")].find((b) => b.textContent === "Cover…")!;
const dialog = () => document.querySelector<HTMLElement>("[role=dialog][aria-label=Cover]");
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const choose = (select: HTMLSelectElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const written = async (store: ProjectStore, id: string) => {
  await settle(700); // the autosave
  return (await store.loadManifest(id)).cover;
};

describe("the cover setting", () => {
  test("starts with no cover: the fields are there but cannot be used", async () => {
    await openEditor();
    await click(coverButton());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false);
    expect(dialog()!.querySelector<HTMLInputElement>("input[type=text]")!.disabled).toBe(true);
    expect(dialog()!.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
    expect(dialog()!.querySelector("input[type=text]")!.getAttribute("placeholder")).toBe("Sample project");
  });

  test("turning it on makes a cover with the book's title; turning it off takes it away", async () => {
    const { store, project } = await openEditor();
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    expect(await written(store, project.id)).toEqual({});
    expect(dialog()!.querySelector<HTMLInputElement>("input[type=text]")!.disabled).toBe(false);
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    expect(await written(store, project.id)).toBeUndefined();
  });

  test("a title of its own is written, and an empty one is left out (the manifest does not allow it)", async () => {
    const { store, project } = await openEditor();
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    await type(dialog()!.querySelector("input[type=text]")!, "The Warcaller");
    expect(await written(store, project.id)).toEqual({ title: "The Warcaller" });
    await type(dialog()!.querySelector("input[type=text]")!, "");
    expect(await written(store, project.id)).toEqual({});
  });

  test("the picture is chosen from the project's images, and 'no picture' removes it", async () => {
    const { store, project } = await openEditor(["dragon.png", "map.png"]);
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    const select = () => dialog()!.querySelector<HTMLSelectElement>("select")!;
    await until(() => select().options.length === 3);
    expect([...select().options].map((o) => o.textContent)).toEqual(["No picture (a plain color)", "dragon.png", "map.png"]);
    const [dragon] = await store.listAssets(project.id);
    await choose(select(), dragon!.id);
    expect(await written(store, project.id)).toEqual({ image: dragon });
    await choose(select(), "");
    expect(await written(store, project.id)).toEqual({});
  });

  test("title and picture are kept together", async () => {
    const { store, project } = await openEditor(["dragon.png"]);
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    await type(dialog()!.querySelector("input[type=text]")!, "T");
    const [dragon] = await store.listAssets(project.id);
    await until(() => dialog()!.querySelectorAll("option").length === 2);
    await choose(dialog()!.querySelector("select")!, dragon!.id);
    expect(await written(store, project.id)).toEqual({ title: "T", image: dragon });
  });

  test("with no images in the project it says where to add one, and Done closes the window", async () => {
    await openEditor();
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    expect(dialog()!.textContent).toContain("Add an image to the project first");
    await click([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Done")!);
    expect(dialog()).toBeNull();
  });

  test("the cover that was set is there when the window is opened again", async () => {
    await openEditor();
    await click(coverButton());
    await click(dialog()!.querySelector("input[type=checkbox]")!);
    await type(dialog()!.querySelector("input[type=text]")!, "Remembered");
    await click([...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Done")!);
    await click(coverButton());
    expect(dialog()!.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(true);
    expect(dialog()!.querySelector<HTMLInputElement>("input[type=text]")!.value).toBe("Remembered");
  });
});
