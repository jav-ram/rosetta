// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { openLocalStore } from "@rosetta/store-local";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import "./dom-setup";

// The projects screen with the real LocalStore (in an in-memory IndexedDB), through the whole App.

vi.mock("../src/Workspace", () => ({
  Workspace: ({ title, onBack }: { title?: string; onBack?: () => void }) => (
    <div data-testid="workspace">
      <span>{title}</span>
      <button type="button" onClick={onBack}>
        ← Projects
      </button>
    </div>
  ),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, host } of roots.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
/** Until the list has been read from the store. */
const loaded = async () => {
  for (let i = 0; i < 100 && /Loading projects|Opening your projects/.test(document.body.textContent ?? ""); i++) await settle(10);
};

/** Starts the app on the database `name` in `indexedDB`: starting it again is "restarting the browser". */
async function start(indexedDB: IDBFactory, name = "app") {
  const { App } = await import("../src/App");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<App openStore={() => openLocalStore({ indexedDB, name })} />));
  await loaded();
  return {
    stop: async () => {
      await act(async () => root.unmount());
      roots.splice(0, roots.length, ...roots.filter((r) => r.root !== root));
      host.remove();
    },
  };
}

const text = () => document.body.textContent ?? "";
const button = (label: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").match(label))!;
const click = (b: HTMLElement) => act(async () => void b.click());
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = (form: HTMLFormElement) => act(async () => void form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const titles = () => [...document.querySelectorAll(".projects-open strong")].map((e) => e.textContent);

async function create(title: string) {
  const input = document.querySelector<HTMLInputElement>("input[aria-label='Title of a new project']")!;
  await type(input, title);
  await submit(input.closest("form")!);
  await settle();
}

describe("the projects screen", () => {
  test("a new database shows no projects and says so", async () => {
    await start(new IDBFactory());
    expect(text()).toContain("No projects yet");
    expect(button("Create project").disabled).toBe(true); // nothing to name it yet
  });

  test("a project is created from a title, with a first chapter, and listed", async () => {
    const indexedDB = new IDBFactory();
    await start(indexedDB);
    await create("  The Lost Mine  ");
    expect(titles()).toEqual(["The Lost Mine"]); // the title is trimmed
    expect((document.querySelector("input[aria-label='Title of a new project']") as HTMLInputElement).value).toBe(""); // and the box is cleared
    const store = await openLocalStore({ indexedDB, name: "app" });
    const [summary] = await store.listProjects();
    expect(await store.loadManifest(summary!.id)).toMatchObject({ title: "The Lost Mine", chapters: [{ id: "chapter-1", title: "Chapter 1" }] });
    expect(await store.loadChapter(summary!.id, "chapter-1")).toBe("");
  });

  test("the most recently changed project is first", async () => {
    await start(new IDBFactory());
    await create("First");
    await new Promise((r) => setTimeout(r, 10));
    await create("Second");
    expect(titles()).toEqual(["Second", "First"]);
  });

  test("projects are still there when the app is started again", async () => {
    const indexedDB = new IDBFactory();
    const first = await start(indexedDB);
    await create("Survivor");
    await create("Another");
    await first.stop();

    await start(indexedDB); // a new page, with the same browser storage
    expect(titles().sort()).toEqual(["Another", "Survivor"]);
  });

  test("a project is renamed, and the new title is kept", async () => {
    const indexedDB = new IDBFactory();
    const first = await start(indexedDB);
    await create("Old name");
    await click(button("Rename Old name"));
    const input = document.querySelector<HTMLInputElement>("input[aria-label='New title for Old name']")!;
    await type(input, "New name");
    await submit(input.closest("form")!);
    await settle();
    expect(titles()).toEqual(["New name"]);
    await first.stop();
    await start(indexedDB);
    expect(titles()).toEqual(["New name"]);
  });

  test("renaming can be cancelled, and an empty title cannot be saved", async () => {
    await start(new IDBFactory());
    await create("Keep me");
    await click(button("Rename Keep me"));
    const input = document.querySelector<HTMLInputElement>("input[aria-label='New title for Keep me']")!;
    await type(input, "   ");
    expect(button("Save").disabled).toBe(true);
    await click(button("Cancel"));
    expect(titles()).toEqual(["Keep me"]);
  });

  test("deleting asks first, then removes the project for good", async () => {
    const indexedDB = new IDBFactory();
    const first = await start(indexedDB);
    await create("Doomed");
    await create("Safe");
    await click(button("Delete Doomed"));
    expect(text()).toContain("This cannot be undone");
    await click(button("Cancel"));
    expect(titles().sort()).toEqual(["Doomed", "Safe"]); // cancelled
    await click(button("Delete Doomed"));
    await click([...document.querySelectorAll<HTMLButtonElement>(".projects-confirm button")].find((b) => b.textContent === "Delete")!);
    await settle();
    expect(titles()).toEqual(["Safe"]);
    await first.stop();
    await start(indexedDB);
    expect(titles()).toEqual(["Safe"]);
  });

  test("opening a project shows its editor, and the button there goes back to the list", async () => {
    await start(new IDBFactory());
    await create("Open me");
    await click(button(/Open me/));
    expect(document.querySelector("[data-testid=workspace]")!.textContent).toContain("Open me");
    expect(document.querySelector(".projects")).toBeNull();
    await click(button("← Projects"));
    await loaded();
    expect(titles()).toEqual(["Open me"]);
  });

  test("when the browser's storage is not available the screen says why", async () => {
    const { App } = await import("../src/App");
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => root.render(<App openStore={() => Promise.reject(new Error("storage is blocked"))} />));
    await settle();
    expect(document.querySelector("[role=alert]")!.textContent).toContain("storage is blocked");
  });

  test("a failed change is shown and does not break the screen", async () => {
    const indexedDB = new IDBFactory();
    await start(indexedDB);
    await create("Ghost");
    // another tab deletes it behind the screen's back
    const other = await openLocalStore({ indexedDB, name: "app" });
    const [gone] = await other.listProjects();
    await other.deleteProject(gone!.id);
    await click(button("Rename Ghost"));
    const input = document.querySelector<HTMLInputElement>("input[aria-label='New title for Ghost']")!;
    await type(input, "Renamed");
    await submit(input.closest("form")!);
    await settle();
    expect(document.querySelector("[role=alert]")!.textContent).toContain("no project");
    expect(text()).toContain("Create project"); // still usable
  });
});
