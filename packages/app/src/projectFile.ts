import type { ProjectStore } from "@rosetta/contracts";
import { exportProject, importProject, RosettaFileError } from "@rosetta/store-local";

/** The part of the File System Access API that saving uses. Chrome and Edge have it; other browsers get a download. */
interface SaveFilePicker {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>;
}

/** The name a project's file is offered under: its title, made safe for a file name, with `.rosetta`. */
export function fileNameFor(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.-]+|[. -]+$/g, "")
    .slice(0, 80);
  return `${base || "project"}.rosetta`;
}

export type SaveOutcome = "saved" | "cancelled";

/**
 * Saves a project as a `.rosetta` file. Where the browser can (Chrome, Edge) it asks where to save and writes there; otherwise
 * the browser downloads it. The picker is opened first, straight from the click: it needs that, and building a large file can
 * take longer than the browser allows between the click and the picker.
 */
export async function saveProjectFile(store: ProjectStore, project: { id: string; title: string }, env: SaveFilePicker = window as unknown as SaveFilePicker): Promise<SaveOutcome> {
  const name = fileNameFor(project.title);
  if (typeof env.showSaveFilePicker === "function") {
    let handle: Awaited<ReturnType<NonNullable<SaveFilePicker["showSaveFilePicker"]>>>;
    try {
      handle = await env.showSaveFilePicker({ suggestedName: name, types: [{ description: "Rosetta project", accept: { "application/zip": [".rosetta"] } }] });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled"; // the person closed the dialog
      throw e;
    }
    const data = await exportProject(store, project.id);
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return "saved";
  }
  const data = await exportProject(store, project.id);
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

/** Reads a chosen `.rosetta` file into a new project. A problem with the file comes back as a message the person can act on. */
export async function openProjectFile(store: ProjectStore, file: File) {
  try {
    return await importProject(store, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof RosettaFileError) throw new Error(`“${file.name}” cannot be opened. ${e.message}`);
    throw e;
  }
}
