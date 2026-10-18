// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import "./dom-setup";
import { ProjectsScreen } from "../src/components/ProjectsScreen";
import { newStore } from "./seed";

// The old address (GitHub Pages) says where Rosetta has moved to, because projects are kept per address.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = null;
});

async function show(movedTo?: string) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => root!.render(<ProjectsScreen store={await newStore()} onOpen={() => {}} movedTo={movedTo} />));
  await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
}

describe("the note about the new address", () => {
  test("is there on the old address, with a link and what to do about the projects", async () => {
    await show("https://wildbloom-studio.dev");
    const note = document.querySelector("[role=note].projects-moved")!;
    expect(note.textContent).toContain("Rosetta has moved to wildbloom-studio.dev");
    expect(note.textContent).toContain("Export it here");
    expect(note.textContent).toContain("Import…");
    expect(note.querySelector("a")!.getAttribute("href")).toBe("https://wildbloom-studio.dev");
  });
  test("is not there when the app has not moved", async () => {
    await show(undefined);
    expect(document.querySelector(".projects-moved")).toBeNull();
    expect(document.querySelector("form.projects-new")).not.toBeNull();
  });
});
