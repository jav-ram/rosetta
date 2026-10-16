import type { Manifest, ProjectStore } from "@rosetta/contracts";
import { describe, expect, test } from "vitest";
import { ProjectSession } from "../src/project";
import { newStore } from "./seed";

/** The store with some methods replaced (a store is a class, so it cannot be spread). */
const with_ = (store: ProjectStore, overrides: Partial<ProjectStore>): ProjectStore => Object.assign(Object.create(store), overrides);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const manifest = (n: number): Manifest => ({
  rosettaVersion: "0.1",
  title: "Book",
  chapters: Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}` })),
});

async function open(n = 3, delayMs = 20, wrap?: (store: ProjectStore) => ProjectStore) {
  const base = await newStore();
  const { id } = await base.createProject(manifest(n));
  const store = wrap ? wrap(base) : base;
  return { base, store, id, session: await ProjectSession.open(store, id, delayMs) };
}

describe("autosave", () => {
  test("a new session is saved, and has the manifest", async () => {
    const { session } = await open();
    expect(session.status).toEqual({ state: "saved" });
    expect(session.manifest.chapters.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  test("an edit is written a moment later, and the status goes saving → saved", async () => {
    const { session, base, id } = await open();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.status.state));
    session.edit("c2", "# Two");
    expect(session.status).toEqual({ state: "saving" });
    expect(await base.loadChapter(id, "c2")).toBe(""); // not yet
    await wait(150);
    expect(await base.loadChapter(id, "c2")).toBe("# Two");
    expect(session.status).toEqual({ state: "saved" });
    expect(seen[0]).toBe("saving");
    expect(seen.at(-1)).toBe("saved");
  });

  test("many quick edits are written once, with the last text", async () => {
    const saved: string[] = [];
    const { session, base, id } = await open(3, 40, (s) => with_(s, { saveChapter: async (...a) => (saved.push(a[2]), s.saveChapter(...a)) }));
    for (const t of ["a", "ab", "abc"]) {
      session.edit("c1", t);
      await wait(10);
    }
    await wait(200);
    expect(saved).toEqual(["abc"]);
    expect(await base.loadChapter(id, "c1")).toBe("abc");
  });

  test("flush writes at once", async () => {
    const { session, base, id } = await open(3, 10_000);
    session.edit("c1", "now");
    await session.flush();
    expect(await base.loadChapter(id, "c1")).toBe("now");
    expect(session.status).toEqual({ state: "saved" });
  });

  test("the newest text of a chapter is what was edited, written or not", async () => {
    const { session } = await open(3, 10_000);
    session.edit("c1", "typed");
    expect(await session.chapterText("c1")).toBe("typed");
    expect(await session.chapterText("c2")).toBe("");
  });

  test("text for a chapter that is not in the project is ignored", async () => {
    const { session } = await open();
    session.edit("nope", "x");
    expect(session.hasUnsaved).toBe(false);
  });

  test("an edit made while a save is being written is not lost", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const { session, base, id } = await open(3, 5, (s) => with_(s, {
      saveChapter: async (...a) => {
        if (first) {
          first = false;
          await gate; // the first write is slow
        }
        return s.saveChapter(...a);
      },
    }));
    session.edit("c1", "old");
    await wait(30); // the write of "old" has started
    session.edit("c1", "new");
    release();
    await wait(150);
    expect(await base.loadChapter(id, "c1")).toBe("new");
    expect(session.status).toEqual({ state: "saved" });
  });

  test("a failed write is shown, kept, and written by retry", async () => {
    let fail = true;
    const { session, base, id } = await open(3, 5, (s) => with_(s, {
      saveChapter: async (...a) => {
        if (fail) throw new Error("disk full");
        return s.saveChapter(...a);
      },
    }));
    session.edit("c1", "precious");
    await wait(60);
    expect(session.status).toEqual({ state: "error", message: "disk full" });
    expect(session.hasUnsaved).toBe(true);
    expect(await session.chapterText("c1")).toBe("precious"); // still here
    fail = false;
    await session.retry();
    expect(session.status).toEqual({ state: "saved" });
    expect(await base.loadChapter(id, "c1")).toBe("precious");
  });
});

describe("chapters", () => {
  test("a new chapter is written to the manifest before its text, and can be edited at once", async () => {
    const calls: string[] = [];
    const { session, base, id } = await open(2, 10_000, (s) => with_(s, {
      saveManifest: async (...a) => (calls.push("manifest"), s.saveManifest(...a)),
      saveChapter: async (...a) => (calls.push(`chapter ${a[1]}`), s.saveChapter(...a)),
    }));
    const added = session.addChapter("  Third  ");
    expect(added.title).toBe("Third");
    expect(added.id).toMatch(/^ch-[0-9a-f]{8}$/);
    expect(await session.chapterText(added.id)).toBe(""); // the store does not know it yet
    session.edit(added.id, "hello");
    await session.flush();
    expect(calls).toEqual(["manifest", `chapter ${added.id}`]);
    expect((await base.loadManifest(id)).chapters.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2", "Third"]);
    expect(await base.loadChapter(id, added.id)).toBe("hello");
  });

  test("renaming and reordering keep the text", async () => {
    const { session, base, id } = await open(3);
    for (const c of session.manifest.chapters) session.edit(c.id, `text of ${c.id}`);
    session.renameChapter("c2", "  Renamed ");
    session.moveChapter("c3", 0);
    await session.flush();
    const saved = await base.loadManifest(id);
    expect(saved.chapters.map((c) => [c.id, c.title])).toEqual([["c3", "Chapter 3"], ["c1", "Chapter 1"], ["c2", "Renamed"]]);
    for (const c of saved.chapters) expect(await base.loadChapter(id, c.id)).toBe(`text of ${c.id}`);
  });

  test("an empty name is not accepted, and a move is clamped", async () => {
    const { session } = await open(3);
    session.renameChapter("c1", "   ");
    expect(session.manifest.chapters[0]!.title).toBe("Chapter 1");
    session.moveChapter("c1", 99);
    expect(session.manifest.chapters.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
    session.moveChapter("c1", 2); // already there
    session.moveChapter("nope", 0);
    expect(session.manifest.chapters.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  test("a deleted chapter loses its text, including text that was not written yet", async () => {
    const { session, base, id } = await open(3, 10_000);
    session.edit("c2", "doomed");
    session.deleteChapter("c2");
    session.edit("c2", "late edit from a closing editor"); // ignored
    await session.flush();
    expect((await base.loadManifest(id)).chapters.map((c) => c.id)).toEqual(["c1", "c3"]);
    await expect(base.loadChapter(id, "c2")).rejects.toMatchObject({ code: "not-found" });
    expect(session.status).toEqual({ state: "saved" });
  });

  test("the manifest object changes with every change, so a view can tell", async () => {
    const { session } = await open(2, 10_000);
    const before = session.manifest;
    session.renameChapter("c1", "X");
    expect(session.manifest).not.toBe(before);
    expect(before.chapters[0]!.title).toBe("Chapter 1"); // the old one is untouched
  });
});

describe("a project of 20 chapters", () => {
  test("edited and reordered over and over, with nothing lost", async () => {
    const { session, base, id } = await open(20, 15);
    const text = new Map<string, string>();
    // every chapter gets text, some several times
    for (let round = 0; round < 3; round++) {
      for (const c of session.manifest.chapters) {
        if ((Number(c.id.slice(1)) + round) % 2 === 0) {
          const t = `# ${c.id} round ${round}\n\n${"lorem ipsum ".repeat(20 * (round + 1))}\n`;
          text.set(c.id, t);
          session.edit(c.id, t);
        }
      }
      // reorder: a fixed shuffle (a seeded generator, so a failure can be repeated)
      let seed = 12345 + round;
      const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      for (let i = 0; i < 25; i++) {
        const ids = session.manifest.chapters.map((c) => c.id);
        session.moveChapter(ids[Math.floor(rand() * ids.length)]!, Math.floor(rand() * ids.length));
      }
      await wait(20); // writes happen between the rounds too
    }
    const order = session.manifest.chapters.map((c) => c.id);
    await session.flush();
    expect(session.status).toEqual({ state: "saved" });

    // a new session on the stored project sees the same order and every text
    const again = await ProjectSession.open(base, id);
    expect(again.manifest.chapters.map((c) => c.id)).toEqual(order);
    expect(new Set(order).size).toBe(20);
    for (const c of again.manifest.chapters) expect(await again.chapterText(c.id), c.id).toBe(text.get(c.id) ?? "");
  });
});
