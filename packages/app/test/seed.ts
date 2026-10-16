import { openLocalStore, type LocalStore } from "@rosetta/store-local";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { sampleChapters } from "./sample-chapters";

let counter = 0;

/** A new, empty store in its own in-memory IndexedDB. */
export const newStore = (): Promise<LocalStore> => openLocalStore({ indexedDB: new IDBFactory(), name: `test-${++counter}` });

/** A project with the given chapters (by default the sample ones), each with its text, in a new store. */
export async function seed(chapters = sampleChapters) {
  const store = await newStore();
  const project = await store.createProject({ rosettaVersion: "0.1", title: "Sample project", chapters: chapters.map(({ id, title }) => ({ id, title })) });
  for (const c of chapters) await store.saveChapter(project.id, c.id, c.markdown);
  return { store, project };
}
