import type { AssetRef, ProjectStore } from "@rosetta/contracts";
import { describe, expect, test, vi } from "vitest";
import { importImages, type ImportProgress } from "../src/images/importImages";
import { rebuildPreviews } from "../src/images/rebuildPreviews";
import { newStore } from "./seed";

const image = (name: string, bytes = [1, 2, 3], type = "image/png") => new File([new Uint8Array(bytes)], name, { type });
const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())];
const small = (...bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: "image/webp" });

async function project() {
  const store = await newStore();
  const { id } = await store.createProject({ rosettaVersion: "0.1", title: "Book", chapters: [{ id: "a", title: "A" }] });
  return { store, id };
}

describe("importing images", () => {
  test("originals are stored as they are, and the preview copy is kept next to them", async () => {
    const { store, id } = await project();
    const result = await importImages(store, id, [image("map.png", [9, 8, 7])], { makePreview: async () => small(5) });
    expect(result.skipped).toEqual([]);
    const [ref] = await store.listAssets(id);
    expect(ref).toMatchObject({ name: "map.png", mediaType: "image/png", size: 3 });
    expect(await bytesOf(await store.getAsset(id, ref!, "original"))).toEqual([9, 8, 7]);
    expect(await bytesOf(await store.getAsset(id, ref!, "preview"))).toEqual([5]);
  });

  test("an image is listed as soon as it is stored, before its preview is ready", async () => {
    const { store, id } = await project();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const running = importImages(store, id, [image("a.png")], {
      makePreview: async () => (await gate, small(1)),
      onAdded: (ref) => events.push(`added ${ref.name}`),
      onPreview: (ref) => events.push(`preview ${ref.name}`),
    });
    await vi.waitFor(() => expect(events).toEqual(["added a.png"]));
    release();
    await running;
    expect(events).toEqual(["added a.png", "preview a.png"]);
  });

  test("an image that is small already, or cannot be read, keeps its original as the preview", async () => {
    const { store, id } = await project();
    let n = 0;
    const makePreview = async () => {
      if (n++ === 0) return null; // small enough
      throw new Error("cannot decode"); // the maker should not throw, but if it does the import goes on
    };
    const result = await importImages(store, id, [image("one.png", [1]), image("two.png", [2])], { makePreview });
    expect(result.added).toHaveLength(2);
    for (const ref of await store.listAssets(id)) expect(await bytesOf(await store.getAsset(id, ref, "preview"))).toEqual(await bytesOf(await store.getAsset(id, ref, "original")));
  });

  test("files that are not images are skipped and named; the images are still added", async () => {
    const { store, id } = await project();
    const result = await importImages(store, id, [image("notes.txt", [1], "text/plain"), image("a.jpg", [2], "image/jpeg")], { makePreview: async () => null });
    expect(result.added.map((a) => a.name)).toEqual(["a.jpg"]);
    expect(result.skipped).toEqual([{ name: "notes.txt", reason: "not an image" }]);
  });

  test("one image that cannot be stored does not stop the rest", async () => {
    const { store, id } = await project();
    const failing = Object.assign(Object.create(store) as ProjectStore, {
      putAsset: vi.fn(async (p: string, f: Blob, o?: { id?: string }) => {
        if ((f as File).name === "bad.png") throw new Error("the disk is full");
        return store.putAsset(p, f, o);
      }),
    });
    const result = await importImages(failing, id, [image("a.png"), image("bad.png"), image("c.png")], { makePreview: async () => null });
    expect(result.added.map((a) => a.name)).toEqual(["a.png", "c.png"]);
    expect(result.skipped).toEqual([{ name: "bad.png", reason: "the disk is full" }]);
  });

  test("the progress counts stored images and finished previews", async () => {
    const { store, id } = await project();
    const seen: ImportProgress[] = [];
    await importImages(store, id, [image("a.png"), image("b.png"), image("c.png")], { makePreview: async () => small(1), onProgress: (p) => seen.push(p) });
    expect(seen[0]).toEqual({ total: 3, stored: 0, previewed: 0 });
    expect(seen.at(-1)).toEqual({ total: 3, stored: 3, previewed: 3 });
  });

  test("thirty images: all stored in order, and previews are asked for while later images are still being stored", async () => {
    const { store, id } = await project();
    const files = Array.from({ length: 30 }, (_, i) => image(`img-${i}.png`, [i, i, i]));
    let stored = 0;
    let previewedBeforeAllStored = 0;
    const result = await importImages(store, id, files, {
      makePreview: async () => {
        if (stored < 30) previewedBeforeAllStored++;
        return small(1);
      },
      onAdded: () => stored++,
    });
    expect(result.added.map((a) => a.name)).toEqual(files.map((f) => f.name));
    expect((await store.listAssets(id)).map((a) => a.name)).toEqual(files.map((f) => f.name));
    expect(previewedBeforeAllStored).toBeGreaterThan(0);
  });
});

describe("making previews again", () => {
  test("every image gets its preview copy from the original; other files are left alone", async () => {
    const { store, id } = await project();
    const a = await store.putAsset(id, image("a.png", [1, 2]));
    const font = await store.putAsset(id, new File([new Uint8Array([7])], "f.woff2", { type: "font/woff2" }));
    const made: number[][] = [];
    await rebuildPreviews(store, id, async (blob) => (made.push(await bytesOf(blob)), small(made.length)));
    expect(made).toEqual([[1, 2]]);
    expect(await bytesOf(await store.getAsset(id, a, "preview"))).toEqual([1]);
    expect(await bytesOf(await store.getAsset(id, font, "preview"))).toEqual([7]);
  });

  test("a project that is gone, or an image that fails, does not make it reject", async () => {
    const { store, id } = await project();
    await store.putAsset(id, image("a.png"));
    await expect(rebuildPreviews(store, id, async () => Promise.reject(new Error("no")))).resolves.toBeUndefined();
    await expect(rebuildPreviews(store, "gone", async () => null)).resolves.toBeUndefined();
  });
});

describe("an asset reference", () => {
  test("is not changed by a preview copy", async () => {
    const { store, id } = await project();
    const ref: AssetRef = await store.putAsset(id, image("a.png"));
    await store.setAssetPreview(id, ref.id, small(1));
    expect(await store.listAssets(id)).toEqual([ref]);
  });
});
