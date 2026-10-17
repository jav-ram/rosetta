import "fake-indexeddb/auto";
import { type AssetRef, type Manifest, type ProjectStore } from "@rosetta/contracts";
import { IDBFactory } from "fake-indexeddb";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { chapterPath, exportProject, importProject, openLocalStore, RosettaFileError, slug, type LocalStore } from "../src/index";

let counter = 0;
const newStore = () => openLocalStore({ indexedDB: new IDBFactory(), name: `rf-${++counter}` });
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) % 256);
const blob = (data: Uint8Array, type = "", name?: string): Blob => (name ? new File([data as BlobPart], name, { type }) : new Blob([data as BlobPart], { type }));
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** A project with everything in it: chapters with awkward titles and texts, start rules, page counts, a cover and several assets. */
async function fullProject(store: ProjectStore, chapters = 20) {
  const m: Manifest = {
    rosettaVersion: "0.1",
    title: "Ünïcode “Book”",
    system: "example",
    theme: "classic",
    chapters: Array.from({ length: chapters }, (_, i) => ({
      id: `ch-${String(i).padStart(2, "0")}`,
      title: i === 0 ? "Introduction" : i === 1 ? "What / why: <A> & “B”?" : i === 2 ? "日本語の章" : `Chapter ${i + 1}`,
      ...(i % 4 === 1 ? { start: "right-page" as const } : {}),
      ...(i < 5 ? { pages: i + 2 } : {}),
      ...(i === 3 ? { stale: true } : {}),
    })),
  };
  const { id } = await store.createProject(m);
  const texts = new Map<string, string>();
  for (const [i, c] of m.chapters.entries()) {
    const text =
      i === 5 ? "" : i === 6 ? "windows\r\nline endings\r\n" : i === 7 ? "no trailing newline" : i === 8 ? "x".repeat(300_000) : `# ${c.title}\n\n:::sidebar{title="T"}\nText ✨ of ${c.id}\n:::\n`;
    texts.set(c.id, text);
    await store.saveChapter(id, c.id, text);
  }
  const assets = new Map<string, Uint8Array>();
  const png = await store.putAsset(id, blob(bytes(5000, 1), "image/png", "map.png"), { id: "cover-art" });
  assets.set(png.id, bytes(5000, 1));
  const jpg = await store.putAsset(id, blob(bytes(70_000, 2), "image/jpeg", "photo.jpg"));
  assets.set(jpg.id, bytes(70_000, 2));
  const svg = await store.putAsset(id, blob(strToU8("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"));
  assets.set(svg.id, strToU8("<svg xmlns='http://www.w3.org/2000/svg'/>"));
  const odd = await store.putAsset(id, blob(bytes(10, 3), "application/x-weird", "thing"));
  assets.set(odd.id, bytes(10, 3));
  await store.saveManifest(id, { ...m, cover: { title: "Cover", image: png } });
  return { id, texts, assets };
}

/** Everything a store holds about a project, for comparing two. */
async function snapshot(store: ProjectStore, id: string) {
  const manifest = await store.loadManifest(id);
  const chapters = Object.fromEntries(await Promise.all(manifest.chapters.map(async (c) => [c.id, await store.loadChapter(id, c.id)] as const)));
  const refs = await store.listAssets(id);
  const assets = Object.fromEntries(await Promise.all(refs.map(async (r) => [r.id, Array.from(await bytesOf(await store.getAsset(id, r, "original")))] as const)));
  return { manifest, chapters, refs, assets };
}

describe("file names", () => {
  test("a title becomes a lower case, hyphenated name, without accents or symbols", () => {
    expect(slug("What / why: <A> & “B”?")).toBe("what-why-a-b");
    expect(slug("Çhapter Ünï")).toBe("chapter-uni");
    expect(slug("日本語")).toBe("chapter");
    expect(slug("   ")).toBe("chapter");
    expect(slug("x".repeat(100))).toHaveLength(40);
  });

  test("the number is the position, with as many digits as the project needs", () => {
    expect(chapterPath(0, 3, "Intro")).toBe("chapters/01-intro.md");
    expect(chapterPath(11, 12, "Twelve")).toBe("chapters/12-twelve.md");
    expect(chapterPath(0, 120, "A")).toBe("chapters/001-a.md");
    expect(chapterPath(119, 120, "Z")).toBe("chapters/120-z.md");
  });
});

describe("export", () => {
  test("a .rosetta file is a zip with the manifest, a file per chapter in order, and the assets", async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 3);
    const files = unzipSync(await exportProject(store, id));
    const names = Object.keys(files);
    expect(names).toContain("manifest.json");
    expect(names.filter((n) => n.startsWith("chapters/"))).toEqual(["chapters/01-introduction.md", "chapters/02-what-why-a-b.md", "chapters/03-chapter.md"]);
    expect(names).toContain("assets/assets.json");
    expect(names.filter((n) => n.startsWith("assets/originals/")).sort()).toEqual(
      (JSON.parse(strFromU8(files["assets/assets.json"]!)) as AssetRef[]).map((r) => `assets/originals/${r.id}.${{ "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" }[r.mediaType] ?? "bin"}`).sort(),
    );
    expect(JSON.parse(strFromU8(files["manifest.json"]!)).title).toBe("Ünïcode “Book”");
  });

  test("the same project gives the same bytes every time", async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 4);
    const a = await exportProject(store, id);
    const b = await exportProject(store, id);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test("a project with no chapters and no assets exports and imports", async () => {
    const store = await newStore();
    const { id } = await store.createProject({ rosettaVersion: "0.1", title: "Empty", chapters: [] });
    const again = await importProject(store, await exportProject(store, id));
    expect(await store.loadManifest(again.id)).toEqual({ rosettaVersion: "0.1", title: "Empty", chapters: [] });
  });
});

describe("a project goes through a .rosetta file with nothing lost", () => {
  test("20 chapters, awkward titles and texts, start rules, page counts, a cover and assets: all the same in another store", async () => {
    const from = await newStore();
    const { id, texts, assets } = await fullProject(from, 20);
    const file = await exportProject(from, id);

    const to = await newStore();
    const imported = await importProject(to, file);
    expect(imported.title).toBe("Ünïcode “Book”");
    const before = await snapshot(from, id);
    const after = await snapshot(to, imported.id);

    expect(after.manifest).toEqual(before.manifest); // ids, titles, start, pages, stale, system, theme, cover
    expect(after.manifest.chapters).toHaveLength(20);
    expect(after.chapters).toEqual(before.chapters);
    for (const [chapterId, text] of texts) expect(after.chapters[chapterId], chapterId).toBe(text); // exact: CRLF, empty, no trailing newline, large
    expect(after.refs).toEqual(before.refs); // same ids, names, media types, sizes, and the same order
    expect(after.assets).toEqual(before.assets);
    for (const [assetId, data] of assets) expect(after.assets[assetId], assetId).toEqual(Array.from(data));
    expect(after.manifest.cover!.image!.id).toBe("cover-art"); // the cover still points at its asset
    expect(imported.id).not.toBe(id); // a new project
  });

  test("exporting what was imported gives the same file, byte for byte", async () => {
    const from = await newStore();
    const { id } = await fullProject(from, 12);
    const file = await exportProject(from, id);
    const to = await newStore();
    const imported = await importProject(to, file);
    expect(Array.from(await exportProject(to, imported.id))).toEqual(Array.from(file));
  });

  test("into the same store: a second project, the first is untouched", async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 3);
    const file = await exportProject(store, id);
    const copy = await importProject(store, file);
    expect((await store.listProjects()).map((p) => p.id).sort()).toEqual([id, copy.id].sort());
    expect(await snapshot(store, copy.id)).toEqual(await snapshot(store, id));
  });

  test("more than 99 chapters", async () => {
    const store = await newStore();
    const { id } = await store.createProject({ rosettaVersion: "0.1", title: "Big", chapters: Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, title: `Chapter ${i}` })) });
    for (let i = 0; i < 120; i += 7) await store.saveChapter(id, `c${i}`, `text ${i}`);
    const file = await exportProject(store, id);
    expect(Object.keys(unzipSync(file)).filter((n) => n.startsWith("chapters/"))[119]).toBe("chapters/120-chapter-119.md");
    const copy = await importProject(store, file);
    expect(await snapshot(store, copy.id)).toEqual(await snapshot(store, id));
  });

  test("the file names after the chapter number do not matter, only the number", async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 3);
    const files = unzipSync(await exportProject(store, id));
    const renamed: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(files)) renamed[name.replace(/^chapters\/(\d+)-.*$/, "chapters/$1-edited-by-hand.md")] = data;
    const copy = await importProject(store, zipSync(renamed));
    expect((await snapshot(store, copy.id)).chapters).toEqual((await snapshot(store, id)).chapters);
  });
});

describe("a file that is not a project", () => {
  const rejects = async (data: Uint8Array, message: RegExp) => {
    const store = await newStore();
    await expect(importProject(store, data)).rejects.toThrow(message);
    await expect(importProject(store, data)).rejects.toBeInstanceOf(RosettaFileError);
    expect(await store.listProjects()).toEqual([]); // nothing was left behind
  };
  const good = async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 3);
    return unzipSync(await exportProject(store, id));
  };

  test("bytes that are not a zip", () => rejects(bytes(1000), /not a Rosetta project file/));
  test("an empty file", () => rejects(new Uint8Array(), /not a Rosetta project file/));
  test("a zip without a manifest", () => rejects(zipSync({ "hello.txt": strToU8("hi") }), /manifest\.json is missing/));
  test("a manifest that is not JSON", () => rejects(zipSync({ "manifest.json": strToU8("{nope") }), /not valid JSON/));
  test("a manifest that does not validate", () => rejects(zipSync({ "manifest.json": strToU8('{"title":"x"}') }), /not a valid manifest/));
  test("a manifest with the same chapter id twice", () =>
    rejects(zipSync({ "manifest.json": strToU8('{"rosettaVersion":"0.1","title":"x","chapters":[{"id":"a","title":"A"},{"id":"a","title":"B"}]}') }), /not a valid manifest/));

  test("a chapter file that is missing", async () => {
    const files = await good();
    delete files["chapters/02-what-why-a-b.md"];
    await rejects(zipSync(files), /chapter 2.*is missing/);
  });

  test("an asset that is listed but not in the file", async () => {
    const files = await good();
    delete files["assets/originals/cover-art.png"];
    await rejects(zipSync(files), /cover-art is listed but .* is missing/);
  });

  test("an asset list that is not valid, or lists an asset twice", async () => {
    const files = await good();
    await rejects(zipSync({ ...files, "assets/assets.json": strToU8('[{"id":"a b","mediaType":"image/png","size":1}]') }), /not valid/);
    const refs = JSON.parse(strFromU8(files["assets/assets.json"]!)) as AssetRef[];
    await rejects(zipSync({ ...files, "assets/assets.json": strToU8(JSON.stringify([refs[0], refs[0]])) }), /twice/);
  });

  test("a cover that is not among the assets", async () => {
    const files = await good();
    await rejects(zipSync({ ...files, "assets/assets.json": strToU8("[]") }), /cover image/);
  });

  test("a store that fails part way: the project is taken back out", async () => {
    const store = await newStore();
    const { id } = await fullProject(store, 3);
    const file = await exportProject(store, id);
    const target = await newStore();
    const failing = Object.assign(Object.create(target as LocalStore), {
      saveChapter: async (...a: Parameters<ProjectStore["saveChapter"]>) => {
        if (a[1] === "ch-01") throw new Error("disk full");
        return target.saveChapter(...a);
      },
    }) as ProjectStore;
    await expect(importProject(failing, file)).rejects.toThrow("disk full");
    expect(await target.listProjects()).toEqual([]);
  });
});
