// The ProjectStore conformance suite (`@rosetta/contracts/store-conformance`).
//
// It does not depend on a test runner or on Node, so it runs in Vitest, in a browser, or anywhere a promise can be
// awaited. Each case throws when it fails:
//
//   for (const c of projectStoreCases({ create: async () => new MyStore() })) test(c.name, c.run);
import type { AssetRef, Manifest } from "./generated/types";
import { ProjectStoreError, type ProjectStore } from "./store";
import { validateAssetRef, validateProjectSummary } from "./validate";

export interface ProjectStoreFactory {
  /** A store with no projects. Called once per case. */
  create(): Promise<ProjectStore>;
  /**
   * Closes the store and opens it again on the same data, as when the page is reloaded. Give it when the store keeps data
   * beyond its own lifetime (a database, files); it adds the cases that check nothing was lost.
   */
  reopen?(store: ProjectStore): Promise<ProjectStore>;
}

export interface ProjectStoreCase {
  name: string;
  run(): Promise<void>;
}

class Failure extends Error {}

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Failure(message);
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

function same(actual: unknown, expected: unknown, what: string) {
  check(stable(actual) === stable(expected), `${what}: expected ${stable(expected)}, got ${stable(actual)}`);
}

async function rejects(promise: Promise<unknown>, code: string, what: string) {
  try {
    await promise;
  } catch (e) {
    check(e instanceof ProjectStoreError, `${what}: expected a ProjectStoreError, got ${String(e)}`);
    check(e.code === code, `${what}: expected code "${code}", got "${e.code}"`);
    return;
  }
  throw new Failure(`${what}: expected it to fail with "${code}", but it succeeded`);
}

const bytesOf = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const manifest = (): Manifest => ({
  rosettaVersion: "0.1",
  title: "Test book",
  system: "example",
  theme: "classic",
  cover: { title: "The Test Book" },
  chapters: [
    { id: "intro", title: "Introduction" },
    { id: "rules", title: "Rules", start: "right-page" },
    { id: "bestiary", title: "Bestiary" },
  ],
});

const png = (...bytes: number[]) => new File([new Uint8Array(bytes)], "map.png", { type: "image/png" });

export function projectStoreCases(factory: ProjectStoreFactory): ProjectStoreCase[] {
  const cases: ProjectStoreCase[] = [];
  const test = (name: string, body: (store: ProjectStore) => Promise<void>) =>
    cases.push({ name, run: async () => body(await factory.create()) });

  // -- Projects ---------------------------------------------------------------------------------------------------
  test("a new store has no projects", async (store) => {
    same(await store.listProjects(), [], "listProjects");
  });

  test("createProject returns a valid summary, and the project is listed", async (store) => {
    const summary = await store.createProject(manifest());
    const valid = validateProjectSummary(summary);
    check(valid.valid, `summary does not validate: ${valid.errors.join("; ")}`);
    check(summary.title === "Test book", "summary.title is the manifest's title");
    same(await store.listProjects(), [summary], "listProjects");
  });

  test("projects get different ids", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    check(a.id !== b.id, "two projects share an id");
  });

  test("createProject refuses a manifest that does not validate", async (store) => {
    await rejects(store.createProject({ ...manifest(), title: "" }), "invalid", "empty title");
    await rejects(store.createProject({ ...manifest(), chapters: [{ id: "a", title: "A" }, { id: "a", title: "B" }] }), "invalid", "duplicate chapter ids");
    await rejects(store.createProject({ title: "No chapters" } as unknown as Manifest), "invalid", "missing fields");
    same(await store.listProjects(), [], "nothing was created");
  });

  test("most recently changed projects come first", async (store) => {
    const a = await store.createProject(manifest());
    await wait(10);
    const b = await store.createProject(manifest());
    same((await store.listProjects()).map((p) => p.id), [b.id, a.id], "after creating");
    await wait(10);
    await store.saveChapter(a.id, "intro", "changed");
    const list = await store.listProjects();
    same(list.map((p) => p.id), [a.id, b.id], "after changing the older project");
    check(Date.parse(list[0]!.updatedAt) > Date.parse(a.updatedAt), "updatedAt moves forward when a chapter is saved");
  });

  test("deleteProject removes only that project", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    await store.saveChapter(b.id, "intro", "kept");
    await store.deleteProject(a.id);
    same((await store.listProjects()).map((p) => p.id), [b.id], "listProjects");
    await rejects(store.loadManifest(a.id), "not-found", "loadManifest of the deleted project");
    check((await store.loadChapter(b.id, "intro")) === "kept", "the other project is untouched");
  });

  test("a project that does not exist is not found", async (store) => {
    const m = manifest();
    await rejects(store.loadManifest("nope"), "not-found", "loadManifest");
    await rejects(store.saveManifest("nope", m), "not-found", "saveManifest");
    await rejects(store.loadChapter("nope", "intro"), "not-found", "loadChapter");
    await rejects(store.saveChapter("nope", "intro", "x"), "not-found", "saveChapter");
    await rejects(store.putAsset("nope", png(1)), "not-found", "putAsset");
    await rejects(store.deleteProject("nope"), "not-found", "deleteProject");
  });

  // -- Manifest ---------------------------------------------------------------------------------------------------
  test("loadManifest returns the manifest that was saved", async (store) => {
    const { id } = await store.createProject(manifest());
    same(await store.loadManifest(id), manifest(), "after createProject");
    const edited = { ...manifest(), title: "Renamed", chapters: [...manifest().chapters, { id: "appendix", title: "Appendix" }] };
    await store.saveManifest(id, edited);
    same(await store.loadManifest(id), edited, "after saveManifest");
  });

  test("changing a returned manifest does not change the stored one", async (store) => {
    const { id } = await store.createProject(manifest());
    const loaded = await store.loadManifest(id);
    loaded.title = "Changed";
    loaded.chapters.pop();
    same(await store.loadManifest(id), manifest(), "stored manifest");
  });

  test("changing a manifest after saving it does not change the stored one", async (store) => {
    const m = manifest();
    const { id } = await store.createProject(m);
    m.title = "Changed";
    m.chapters.pop();
    same(await store.loadManifest(id), manifest(), "stored manifest");
  });

  test("saveManifest refuses a manifest that does not validate, and keeps the old one", async (store) => {
    const { id } = await store.createProject(manifest());
    await rejects(store.saveManifest(id, { ...manifest(), chapters: [{ id: "a", title: "A" }, { id: "a", title: "B" }] }), "invalid", "duplicate chapter ids");
    await rejects(store.saveManifest(id, { ...manifest(), rosettaVersion: "x" }), "invalid", "bad version");
    same(await store.loadManifest(id), manifest(), "stored manifest");
  });

  // -- Chapters ---------------------------------------------------------------------------------------------------
  test("a chapter starts empty and gives back exactly what was saved", async (store) => {
    const { id } = await store.createProject(manifest());
    check((await store.loadChapter(id, "intro")) === "", "a new chapter is empty");
    const texts = [
      "# Title\n\nSome text.\n",
      "no trailing newline",
      "windows\r\nline endings\r\n",
      ":::sidebar{title=\"Tip\"}\nBorrowed ✨ 日本語 𝄞\n:::\n",
      "  leading and trailing space  \n\n\n",
      "x".repeat(1_000_000),
      "",
    ];
    for (const text of texts) {
      await store.saveChapter(id, "intro", text);
      check((await store.loadChapter(id, "intro")) === text, `text of ${text.length} characters changed: ${JSON.stringify(text.slice(0, 40))}`);
    }
  });

  test("chapters are separate", async (store) => {
    const { id } = await store.createProject(manifest());
    await store.saveChapter(id, "intro", "one");
    await store.saveChapter(id, "rules", "two");
    check((await store.loadChapter(id, "intro")) === "one", "intro");
    check((await store.loadChapter(id, "rules")) === "two", "rules");
    check((await store.loadChapter(id, "bestiary")) === "", "bestiary");
  });

  test("a chapter the manifest does not list is not found", async (store) => {
    const { id } = await store.createProject(manifest());
    await rejects(store.loadChapter(id, "missing"), "not-found", "loadChapter");
    await rejects(store.saveChapter(id, "missing", "x"), "not-found", "saveChapter");
  });

  test("reordering and renaming chapters keeps their text", async (store) => {
    const { id } = await store.createProject(manifest());
    await store.saveChapter(id, "intro", "one");
    await store.saveChapter(id, "rules", "two");
    const [intro, rules, bestiary] = manifest().chapters;
    await store.saveManifest(id, { ...manifest(), chapters: [bestiary!, { ...rules!, title: "House rules" }, intro!] });
    check((await store.loadChapter(id, "intro")) === "one", "intro");
    check((await store.loadChapter(id, "rules")) === "two", "rules");
  });

  test("a chapter removed from the manifest loses its text, also when added again", async (store) => {
    const { id } = await store.createProject(manifest());
    await store.saveChapter(id, "rules", "two");
    await store.saveManifest(id, { ...manifest(), chapters: manifest().chapters.filter((c) => c.id !== "rules") });
    await rejects(store.loadChapter(id, "rules"), "not-found", "removed chapter");
    await store.saveManifest(id, manifest());
    check((await store.loadChapter(id, "rules")) === "", "chapter added again starts empty");
  });

  test("projects do not share chapters", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    await store.saveChapter(a.id, "intro", "in a");
    check((await store.loadChapter(b.id, "intro")) === "", "intro of the other project");
  });

  // -- Assets -----------------------------------------------------------------------------------------------------
  test("putAsset returns a valid reference that records size, type and name", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(137, 80, 78, 71));
    const valid = validateAssetRef(ref);
    check(valid.valid, `reference does not validate: ${valid.errors.join("; ")}`);
    check(ref.size === 4, `size: expected 4, got ${ref.size}`);
    check(ref.mediaType === "image/png", `mediaType: expected image/png, got ${ref.mediaType}`);
    check(ref.name === "map.png", `name: expected map.png, got ${ref.name}`);
  });

  test("a Blob without a type is application/octet-stream", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, new Blob([new Uint8Array([1, 2, 3])]));
    check(ref.mediaType === "application/octet-stream", `mediaType: got ${ref.mediaType}`);
  });

  test("every asset gets its own id", async (store) => {
    const { id } = await store.createProject(manifest());
    const a = await store.putAsset(id, png(1));
    const b = await store.putAsset(id, png(1));
    check(a.id !== b.id, "two assets share an id");
  });

  test("the original is exactly the bytes that were added", async (store) => {
    const { id } = await store.createProject(manifest());
    const bytes = Array.from({ length: 70_000 }, (_, i) => (i * 31) % 256);
    const ref = await store.putAsset(id, png(...bytes));
    same(await bytesOf(await store.getAsset(id, ref, "original")), bytes, "original bytes");
  });

  test("a preview is a Blob", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(1, 2, 3));
    const preview = await store.getAsset(id, ref, "preview");
    check(typeof preview.arrayBuffer === "function" && preview.size > 0, "preview is a Blob with content");
  });

  test("without a preview copy, the preview is the original", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(5, 6, 7));
    same(await bytesOf(await store.getAsset(id, ref, "preview")), [5, 6, 7], "preview bytes");
  });

  test("a preview copy is given back as the preview, and the original is untouched", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(1, 2, 3, 4));
    await store.setAssetPreview(id, ref.id, new Blob([new Uint8Array([9, 9])], { type: "image/webp" }));
    same(await bytesOf(await store.getAsset(id, ref, "preview")), [9, 9], "preview bytes");
    same(await bytesOf(await store.getAsset(id, ref, "original")), [1, 2, 3, 4], "original bytes");
    same(await store.listAssets(id), [ref], "the reference does not change");
    await store.setAssetPreview(id, ref.id, new Blob([new Uint8Array([8])]));
    same(await bytesOf(await store.getAsset(id, ref, "preview")), [8], "a second preview replaces the first");
  });

  test("a preview copy needs an asset of that project", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    const ref = await store.putAsset(a.id, png(1));
    await rejects(store.setAssetPreview(a.id, "nope", new Blob([new Uint8Array([1])])), "not-found", "unknown asset");
    await rejects(store.setAssetPreview(b.id, ref.id, new Blob([new Uint8Array([1])])), "not-found", "asset of another project");
    await rejects(store.setAssetPreview("nope", ref.id, new Blob([new Uint8Array([1])])), "not-found", "unknown project");
  });

  test("an asset is found by its id, and only in its own project", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    const ref = await store.putAsset(a.id, png(1, 2, 3));
    await rejects(store.getAsset(b.id, ref, "original"), "not-found", "asset of another project");
    await rejects(store.getAsset(a.id, { ...ref, id: "nope" } as AssetRef, "original"), "not-found", "unknown asset");
  });

  test("deleting a project deletes its assets", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(1));
    await store.deleteProject(id);
    const again = await store.createProject(manifest());
    await rejects(store.getAsset(again.id, ref, "original"), "not-found", "asset of the deleted project");
  });

  test("listAssets gives every asset of the project, in the order they were added, and no one else's", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    same(await store.listAssets(a.id), [], "a project with no assets");
    const first = await store.putAsset(a.id, png(1));
    const second = await store.putAsset(a.id, new Blob([new Uint8Array([2, 2])], { type: "image/jpeg" }));
    await store.putAsset(b.id, png(3));
    same(await store.listAssets(a.id), [first, second], "assets of the first project");
    same((await store.listAssets(b.id)).length, 1, "assets of the second project");
    await rejects(store.listAssets("nope"), "not-found", "unknown project");
  });

  test("an asset can be added under a chosen id (when importing), and is found by it", async (store) => {
    const { id } = await store.createProject(manifest());
    const ref = await store.putAsset(id, png(5, 6), { id: "cover-1" });
    check(ref.id === "cover-1", `id: expected cover-1, got ${ref.id}`);
    check(validateAssetRef(ref).valid, "the reference validates");
    same(await bytesOf(await store.getAsset(id, ref, "original")), [5, 6], "bytes");
    same((await store.listAssets(id)).map((r) => r.id), ["cover-1"], "listAssets");
  });

  test("a chosen asset id must be valid and not taken", async (store) => {
    const { id } = await store.createProject(manifest());
    await store.putAsset(id, png(1), { id: "taken" });
    await rejects(store.putAsset(id, png(2), { id: "taken" }), "invalid", "an id in use");
    for (const bad of ["", "a b", "-x", "a/b"]) await rejects(store.putAsset(id, png(2), { id: bad }), "invalid", `id ${JSON.stringify(bad)}`);
    same((await store.listAssets(id)).length, 1, "nothing was added");
  });

  test("the same asset id can be used in two projects", async (store) => {
    const a = await store.createProject(manifest());
    const b = await store.createProject(manifest());
    await store.putAsset(a.id, png(1), { id: "shared" });
    await store.putAsset(b.id, png(2), { id: "shared" });
    same(await bytesOf(await store.getAsset(b.id, { id: "shared", mediaType: "image/png", size: 1 }, "original")), [2], "the second project's own bytes");
  });

  test("adding an asset moves the project's updatedAt forward", async (store) => {
    const { id, updatedAt } = await store.createProject(manifest());
    await wait(10);
    await store.putAsset(id, png(1));
    const [summary] = await store.listProjects();
    check(Date.parse(summary!.updatedAt) > Date.parse(updatedAt), "updatedAt did not move");
  });

  // -- After reopening --------------------------------------------------------------------------------------------
  const { reopen } = factory;
  if (reopen) {
    test("after reopening, projects, manifests, chapters and assets are all still there", async (store) => {
      const summary = await store.createProject(manifest());
      const edited = { ...manifest(), title: "Saved" };
      await store.saveManifest(summary.id, edited);
      await store.saveChapter(summary.id, "rules", "# Rules ✨\n");
      const ref = await store.putAsset(summary.id, png(9, 8, 7));

      const reopened = await reopen(store);
      const list = await reopened.listProjects();
      same(list.map((p) => p.id), [summary.id], "projects");
      check(list[0]!.title === "Saved", "the summary shows the saved title");
      same(await reopened.loadManifest(summary.id), edited, "manifest");
      check((await reopened.loadChapter(summary.id, "rules")) === "# Rules ✨\n", "chapter text");
      check((await reopened.loadChapter(summary.id, "intro")) === "", "chapter that was never saved");
      same(await bytesOf(await reopened.getAsset(summary.id, ref, "original")), [9, 8, 7], "asset bytes");
      same(await reopened.listAssets(summary.id), [ref], "listAssets");
      await reopened.setAssetPreview(summary.id, ref.id, new Blob([new Uint8Array([4])]));
      same(await bytesOf(await (await reopen(reopened)).getAsset(summary.id, ref, "preview")), [4], "preview bytes");
    });

    test("after reopening, a deleted project and a removed chapter stay gone", async (store) => {
      const a = await store.createProject(manifest());
      const b = await store.createProject(manifest());
      await store.saveChapter(b.id, "rules", "two");
      await store.deleteProject(a.id);
      await store.saveManifest(b.id, { ...manifest(), chapters: manifest().chapters.filter((c) => c.id !== "rules") });

      const reopened = await reopen(store);
      same((await reopened.listProjects()).map((p) => p.id), [b.id], "projects");
      await rejects(reopened.loadChapter(b.id, "rules"), "not-found", "removed chapter");
    });

    test("after reopening, new projects do not reuse ids", async (store) => {
      const a = await store.createProject(manifest());
      await store.deleteProject(a.id);
      const reopened = await reopen(store);
      const b = await reopened.createProject(manifest());
      check(a.id !== b.id, "an id was reused");
    });
  }

  return cases;
}

