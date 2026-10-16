import "fake-indexeddb/auto"; // IDBKeyRange and friends as globals, as in a browser
import { projectStoreCases, type ProjectStoreFactory } from "@rosetta/contracts/store-conformance";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test, vi } from "vitest";
import { LocalStore, openLocalStore } from "../src/index";

// A new in-memory IndexedDB for each case, so the cases do not see each other. Reopening opens the same one again.
const factories = new WeakMap<LocalStore, { indexedDB: IDBFactory; name: string }>();
let counter = 0;

const factory: ProjectStoreFactory = {
  async create() {
    const config = { indexedDB: new IDBFactory(), name: `rosetta-test-${++counter}` };
    const store = await openLocalStore(config);
    factories.set(store, config);
    return store;
  },
  async reopen(store) {
    const config = factories.get(store as LocalStore)!;
    (store as LocalStore).close();
    const reopened = await openLocalStore(config);
    factories.set(reopened, config);
    return reopened;
  },
};

describe("LocalStore passes the ProjectStore conformance suite", () => {
  for (const c of projectStoreCases(factory)) test(c.name, c.run);
});

describe("LocalStore", () => {
  test("the cases that check reopening are part of the run", () => {
    expect(projectStoreCases(factory).filter((c) => c.name.startsWith("after reopening"))).toHaveLength(3);
  });

  test("two stores with different names in one browser are separate", async () => {
    const indexedDB = new IDBFactory();
    const a = await openLocalStore({ indexedDB, name: "a" });
    const b = await openLocalStore({ indexedDB, name: "b" });
    await a.createProject({ rosettaVersion: "0.1", title: "In A", chapters: [] });
    expect(await b.listProjects()).toEqual([]);
  });

  test("two connections to one database see each other's saves", async () => {
    const config = { indexedDB: new IDBFactory(), name: "shared" };
    const a = await openLocalStore(config);
    const b = await openLocalStore(config);
    const { id } = await a.createProject({ rosettaVersion: "0.1", title: "T", chapters: [{ id: "c", title: "C" }] });
    await a.saveChapter(id, "c", "from a");
    expect(await b.loadChapter(id, "c")).toBe("from a");
  });

  test("a failed save changes nothing: a chapter of a project that is gone is not written", async () => {
    const config = { indexedDB: new IDBFactory(), name: "atomic" };
    const store = await openLocalStore(config);
    const { id } = await store.createProject({ rosettaVersion: "0.1", title: "T", chapters: [{ id: "c", title: "C" }] });
    await store.saveChapter(id, "c", "kept");
    await expect(store.saveChapter(id, "nope", "x")).rejects.toMatchObject({ code: "not-found" });
    expect(await store.loadChapter(id, "c")).toBe("kept");
  });

  test("a chapter's text must be a string", async () => {
    const store = await openLocalStore({ indexedDB: new IDBFactory(), name: "types" });
    const { id } = await store.createProject({ rosettaVersion: "0.1", title: "T", chapters: [{ id: "c", title: "C" }] });
    await expect(store.saveChapter(id, "c", 5 as unknown as string)).rejects.toMatchObject({ code: "invalid" });
  });

  test("without IndexedDB it says so", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      await expect(LocalStore.open()).rejects.toThrow(/IndexedDB is not available/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
