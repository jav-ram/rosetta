import type { Chapter, Manifest, ProjectStore } from "@rosetta/contracts";

export type SaveStatus = { state: "saved" } | { state: "saving" } | { state: "error"; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A chapter id that is not in use. Never changes once chosen, so renaming and reordering keep the text. */
function newChapterId(taken: Set<string>): string {
  for (;;) {
    const id = `ch-${crypto.randomUUID().slice(0, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * One open project: its manifest, and the autosave of everything that changes in it.
 *
 * Edits are kept in memory and written to the store a moment after the last change (`delayMs`), or at once with `flush`.
 * Writes happen one at a time, in order (the manifest first, so a chapter is in it before its text is written), and a
 * failed write is kept and tried again with the next save or `retry`. `status` says whether everything is on disk.
 * No framework: the app subscribes to it.
 */
export class ProjectSession {
  private listeners = new Set<() => void>();
  /** Chapter text that has not been written yet, by chapter id. It is also the newest text of that chapter. */
  private dirty = new Map<string, string>();
  private manifestDirty = false;
  /** Chapters added here whose manifest has not been written: the store does not know them yet, and their text is empty. */
  private added = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = 0;
  private queue: Promise<void> = Promise.resolve();
  private failure: string | null = null;

  private constructor(
    private store: ProjectStore,
    readonly projectId: string,
    private current: Manifest,
    private delayMs: number,
  ) {}

  static async open(store: ProjectStore, projectId: string, delayMs = 500): Promise<ProjectSession> {
    return new ProjectSession(store, projectId, await store.loadManifest(projectId), delayMs);
  }

  /** The manifest as it is now, with changes not yet written. A new object after every change. */
  get manifest(): Manifest {
    return this.current;
  }

  get hasUnsaved(): boolean {
    return this.dirty.size > 0 || this.manifestDirty;
  }

  get status(): SaveStatus {
    if (this.failure !== null) return { state: "error", message: this.failure };
    return this.hasUnsaved || this.running > 0 ? { state: "saving" } : { state: "saved" };
  }

  /** Calls `listener` when the manifest or the status changes. Returns the function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    for (const l of [...this.listeners]) l();
  }

  has(chapterId: string): boolean {
    return this.current.chapters.some((c) => c.id === chapterId);
  }

  /** The newest text of a chapter: what was edited and not yet written, or what the store has. */
  async chapterText(chapterId: string): Promise<string> {
    const edited = this.dirty.get(chapterId);
    if (edited !== undefined) return edited;
    if (this.added.has(chapterId)) return "";
    return this.store.loadChapter(this.projectId, chapterId);
  }

  /** Records new text for a chapter and saves it shortly. Text for a chapter that is not in the project is ignored. */
  edit(chapterId: string, text: string): void {
    if (!this.has(chapterId)) return;
    this.dirty.set(chapterId, text);
    this.schedule();
    this.emit();
  }

  addChapter(title: string): Chapter {
    const chapter: Chapter = { id: newChapterId(new Set(this.current.chapters.map((c) => c.id))), title: title.trim() || "Untitled chapter" };
    this.added.add(chapter.id);
    this.change((chapters) => [...chapters, chapter]);
    return chapter;
  }

  renameChapter(chapterId: string, title: string): void {
    const name = title.trim();
    if (!name || !this.has(chapterId)) return;
    this.change((chapters) => chapters.map((c) => (c.id === chapterId ? { ...c, title: name } : c)));
  }

  deleteChapter(chapterId: string): void {
    if (!this.has(chapterId)) return;
    this.dirty.delete(chapterId);
    this.added.delete(chapterId);
    this.change((chapters) => chapters.filter((c) => c.id !== chapterId));
  }

  /** Moves a chapter to position `index` (0 is first), counted in the list as it is before the move. */
  moveChapter(chapterId: string, index: number): void {
    const from = this.current.chapters.findIndex((c) => c.id === chapterId);
    if (from < 0) return;
    const to = Math.max(0, Math.min(this.current.chapters.length - 1, index));
    if (to === from) return;
    this.change((chapters) => {
      const next = [...chapters];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }

  private change(update: (chapters: Chapter[]) => Chapter[]) {
    this.current = { ...this.current, chapters: update(this.current.chapters) };
    this.manifestDirty = true;
    this.schedule();
    this.emit();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persist();
    }, this.delayMs);
  }

  /** Writes everything that is waiting, now. Resolves when it is written, or when a write failed (see `status`). */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.persist();
  }

  /** Tries again after a failed write. */
  retry(): Promise<void> {
    return this.flush();
  }

  private persist(): Promise<void> {
    const run = async () => {
      this.running++;
      this.emit();
      try {
        if (this.manifestDirty) {
          const saved = this.current;
          await this.store.saveManifest(this.projectId, structuredClone(saved));
          if (this.current === saved) this.manifestDirty = false;
          for (const c of saved.chapters) this.added.delete(c.id);
        }
        for (const [id, text] of [...this.dirty]) {
          if (!this.has(id)) {
            this.dirty.delete(id);
            continue;
          }
          await this.store.saveChapter(this.projectId, id, text);
          if (this.dirty.get(id) === text) this.dirty.delete(id); // not edited again while it was being written
        }
        this.failure = null;
      } catch (e) {
        this.failure = message(e);
      } finally {
        this.running--;
        this.emit();
      }
    };
    this.queue = this.queue.then(run);
    return this.queue;
  }
}
