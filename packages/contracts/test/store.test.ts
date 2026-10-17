import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  isManifest,
  validateAssetRef,
  validateChapter,
  validateManifest,
  validateProjectSummary,
  ProjectStoreError,
  type Manifest,
  type ProjectStore,
} from "../src/index";
import { projectStoreCases, type ProjectStoreFactory } from "../src/store-conformance";
import { MemoryStore, newData } from "./memory-store";

const manifest = (): Manifest => ({
  rosettaVersion: "0.1",
  title: "Book",
  system: "example",
  theme: "classic",
  cover: { title: "Cover", image: { id: "a1", mediaType: "image/png", size: 10, name: "cover.png", width: 600, height: 800 } },
  chapters: [{ id: "intro", title: "Introduction" }, { id: "rules", title: "Rules", start: "right-page" }],
});

describe("manifest", () => {
  test("the sample manifest (also used by the Go tests) validates", () => {
    const sample = JSON.parse(readFileSync(new URL("../examples/sample-manifest.json", import.meta.url), "utf8"));
    expect(validateManifest(sample)).toEqual({ valid: true, errors: [] });
  });

  test("a full manifest validates", () => {
    expect(validateManifest(manifest())).toEqual({ valid: true, errors: [] });
    expect(isManifest(manifest())).toBe(true);
  });

  test("only title, version and chapters are required", () => {
    expect(validateManifest({ rosettaVersion: "0.1", title: "T", chapters: [] }).valid).toBe(true);
    for (const key of ["rosettaVersion", "title", "chapters"]) {
      const m: Record<string, unknown> = { ...manifest() };
      delete m[key];
      expect(validateManifest(m).valid, key).toBe(false);
    }
  });

  test("unknown fields are rejected", () => {
    expect(validateManifest({ ...manifest(), extra: 1 }).valid).toBe(false);
    expect(validateManifest({ ...manifest(), chapters: [{ id: "a", title: "A", file: "a.md" }] }).valid).toBe(false);
  });

  test("chapter ids are unique", () => {
    const m = manifest();
    m.chapters.push({ id: "intro", title: "Again" });
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("/chapters/2/id");
  });

  test("ids are safe in a file name and a URL", () => {
    for (const bad of ["", "-a", "_a", "a b", "a/b", "a.b", "é", "a".repeat(65)]) {
      expect(validateChapter({ id: bad, title: "T" }).valid, JSON.stringify(bad)).toBe(false);
    }
    for (const good of ["a", "A1", "01-introduction", "chapter_2", "a".repeat(64)]) {
      expect(validateChapter({ id: good, title: "T" }).valid, good).toBe(true);
    }
  });

  test("a chapter can carry its page count and whether it is stale", () => {
    expect(validateChapter({ id: "a", title: "A", pages: 12, stale: true }).valid).toBe(true);
    expect(validateChapter({ id: "a", title: "A", pages: 0 }).valid).toBe(true);
    for (const bad of [{ pages: -1 }, { pages: 1.5 }, { pages: "3" }, { stale: "yes" }]) {
      expect(validateChapter({ id: "a", title: "A", ...bad }).valid, JSON.stringify(bad)).toBe(false);
    }
  });

  test("a chapter starts on the next page or the right page", () => {
    expect(validateChapter({ id: "a", title: "A", start: "left-page" }).valid).toBe(false);
    expect(validateChapter({ id: "a", title: "" }).valid).toBe(false);
  });
});

describe("asset reference and project summary", () => {
  test("an asset reference needs id, media type and size", () => {
    expect(validateAssetRef({ id: "a1", mediaType: "image/png", size: 0 }).valid).toBe(true);
    for (const bad of [{ mediaType: "image/png", size: 1 }, { id: "a1", size: 1 }, { id: "a1", mediaType: "image/png" }, { id: "a1", mediaType: "png", size: 1 }, { id: "a1", mediaType: "image/png", size: -1 }, { id: "a1", mediaType: "image/png", size: 1, width: 0 }]) {
      expect(validateAssetRef(bad).valid, JSON.stringify(bad)).toBe(false);
    }
  });

  test("a summary has a UTC ISO time", () => {
    expect(validateProjectSummary({ id: "p1", title: "T", updatedAt: "2026-10-16T09:30:00.123Z" }).valid).toBe(true);
    expect(validateProjectSummary({ id: "p1", title: "T", updatedAt: "2026-10-16T09:30:00+02:00" }).valid).toBe(false);
    expect(validateProjectSummary({ id: "p1", title: "T", updatedAt: "yesterday" }).valid).toBe(false);
  });
});

describe("ProjectStore conformance suite", () => {
  const memory: ProjectStoreFactory = {
    create: async () => new MemoryStore(),
  };
  // Opening a new MemoryStore on the same data is "reopening".
  const dataOf = new WeakMap<ProjectStore, ReturnType<typeof newData>>();
  const reopenable: ProjectStoreFactory = {
    create: async () => {
      const data = newData();
      const store = new MemoryStore(data);
      dataOf.set(store, data);
      return store;
    },
    reopen: async (store) => new MemoryStore(dataOf.get(store)),
  };

  describe("the in-memory store passes", () => {
    for (const c of projectStoreCases(reopenable)) test(c.name, c.run);
  });

  test("the cases after reopening are only there when the store can be reopened", () => {
    const withReopen = projectStoreCases(reopenable).map((c) => c.name);
    const without = projectStoreCases(memory).map((c) => c.name);
    expect(withReopen.length - without.length).toBe(3);
    expect(withReopen.filter((n) => !without.includes(n)).every((n) => n.startsWith("after reopening"))).toBe(true);
    expect(without.length).toBeGreaterThanOrEqual(25);
  });

  // The suite has to fail for stores that break a rule, or passing it means nothing.
  describe("it fails for a store that", () => {
    const broken = (name: string, patch: (store: MemoryStore) => void, failing: string[]) =>
      test(name, async () => {
        const factory: ProjectStoreFactory = {
          create: async () => {
            const store = new MemoryStore();
            patch(store);
            return store;
          },
        };
        const failed: string[] = [];
        for (const c of projectStoreCases(factory)) {
          try {
            await c.run();
          } catch {
            failed.push(c.name);
          }
        }
        expect(failed).toEqual(expect.arrayContaining(failing));
      });

    broken(
      "keeps the text of a chapter removed from the manifest",
      (s) => {
        // Chapter text lives on in a side table, and comes back when the chapter is listed again.
        const kept = new Map<string, string>();
        const save = s.saveChapter.bind(s);
        s.saveChapter = async (p, c, text) => {
          await save(p, c, text);
          kept.set(`${p}/${c}`, text);
        };
        const load = s.loadChapter.bind(s);
        s.loadChapter = async (p, c) => ((await load(p, c)) === "" ? (kept.get(`${p}/${c}`) ?? "") : load(p, c));
      },
      ["a chapter removed from the manifest loses its text, also when added again"],
    );

    broken(
      "does not validate manifests",
      (s) => {
        const create = s.createProject.bind(s);
        s.createProject = async (m) => create({ ...m, chapters: m.chapters.slice(0, 1) });
      },
      ["loadManifest returns the manifest that was saved"],
    );

    broken(
      "returns its own manifest, not a copy",
      (s) => {
        const cache = new Map<string, Manifest>();
        const load = s.loadManifest.bind(s);
        s.loadManifest = async (id) => {
          if (!cache.has(id)) cache.set(id, await load(id));
          return cache.get(id)!;
        };
      },
      ["changing a returned manifest does not change the stored one"],
    );

    broken(
      "gives back a different error for a missing project",
      (s) => {
        s.loadManifest = async () => {
          throw new Error("boom");
        };
      },
      ["a project that does not exist is not found"],
    );

    broken(
      "finds an asset in any project",
      (s) => {
        const get = s.getAsset.bind(s);
        s.getAsset = async (_project, ref, variant) => {
          for (const { id } of await s.listProjects()) {
            try {
              return await get(id, ref, variant);
            } catch {
              // not in this one
            }
          }
          throw new ProjectStoreError("not-found", "no such asset");
        };
      },
      ["an asset is found by its id, and only in its own project"],
    );

    broken(
      "loses the last bytes of an asset",
      (s) => {
        const get = s.getAsset.bind(s);
        s.getAsset = async (p, ref, variant) => (await get(p, ref, variant)).slice(0, -1);
      },
      ["the original is exactly the bytes that were added"],
    );

    test("it fails after reopening for a store that forgets", async () => {
      const factory: ProjectStoreFactory = {
        create: async () => new MemoryStore(),
        reopen: async () => new MemoryStore(), // a store that lost its data
      };
      const reopening = projectStoreCases(factory).filter((c) => c.name.startsWith("after reopening"));
      expect(reopening).toHaveLength(3);
      const outcomes = await Promise.all(reopening.map((c) => c.run().then(() => "passed", () => "failed")));
      expect(outcomes.slice(0, 2)).toEqual(["failed", "failed"]);
    });
  });
});
