import {
  isId,
  ProjectStoreError,
  validateManifest,
  type AssetRef,
  type Manifest,
  type ProjectStore,
  type ProjectSummary,
} from "@rosetta/contracts";

/** What each object store holds. Keys: a project by its id, a chapter's text and an asset by `[projectId, id]`. */
const PROJECTS = "projects"; // { id, manifest, updatedAt }
const CHAPTERS = "chapters"; // { projectId, chapterId, source }: only chapters that have been saved; the manifest says which exist
const ASSETS = "assets"; // { projectId, ref, bytes }

interface ProjectRecord {
  id: string;
  manifest: Manifest;
  updatedAt: string;
}
interface ChapterRecord {
  projectId: string;
  chapterId: string;
  source: string;
}
interface AssetRecord {
  projectId: string;
  ref: AssetRef;
  bytes: ArrayBuffer;
  /** When it was added, so assets list in the order they were added. */
  seq: number;
}

export interface LocalStoreOptions {
  /** The database's name. One database holds every project. */
  name?: string;
  /** For tests, or an environment with no global `indexedDB`. */
  indexedDB?: IDBFactory;
}

const DEFAULT_NAME = "rosetta";
const VERSION = 1;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** The key range of everything that belongs to one project in a store keyed by `[projectId, id]`. */
const ofProject = (projectId: string) => IDBKeyRange.bound([projectId, ""], [projectId, "￿"]);

/**
 * `ProjectStore` in IndexedDB: the projects of this browser. Open it with `openLocalStore`.
 *
 * Each call is one transaction, so a save is all there or not at all, and its promise resolves when the browser has committed it.
 * Assets are stored as their bytes. The preview of an asset is the original until previews are generated (M4).
 */
export class LocalStore implements ProjectStore {
  private constructor(private db: IDBDatabase) {}

  static async open(options: LocalStoreOptions = {}): Promise<LocalStore> {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error("IndexedDB is not available here");
    const opening = factory.open(options.name ?? DEFAULT_NAME, VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore(PROJECTS, { keyPath: "id" });
      db.createObjectStore(CHAPTERS, { keyPath: ["projectId", "chapterId"] });
      db.createObjectStore(ASSETS, { keyPath: ["projectId", "ref.id"] });
    };
    const db = await request(opening);
    // Another tab that wants a newer version of the database must not be kept waiting by this one.
    db.onversionchange = () => db.close();
    return new LocalStore(db);
  }

  /** Closes the connection. Nothing can be done with the store afterwards; open it again with `openLocalStore`. */
  close(): void {
    this.db.close();
  }

  /** Runs `work` in one transaction over `stores`. Resolves with its result once the transaction has committed; a throw aborts it. */
  private async run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const tx = this.db.transaction(stores, mode);
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("The transaction was aborted"));
    });
    committed.catch(() => {}); // reported through `work` or below, not as an unhandled rejection
    let result: T;
    try {
      result = await work(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      throw e;
    }
    await committed;
    return result;
  }

  private async project(tx: IDBTransaction, projectId: string): Promise<ProjectRecord> {
    const record = (await request(tx.objectStore(PROJECTS).get(projectId))) as ProjectRecord | undefined;
    if (!record) throw new ProjectStoreError("not-found", `There is no project "${projectId}"`);
    return record;
  }

  private checked(manifest: Manifest): Manifest {
    const result = validateManifest(manifest);
    if (!result.valid) throw new ProjectStoreError("invalid", `The manifest is not valid: ${result.errors.join("; ")}`);
    return manifest;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.run([PROJECTS], "readonly", async (tx) => {
      const all = (await request(tx.objectStore(PROJECTS).getAll())) as ProjectRecord[];
      return all
        .map((p) => ({ id: p.id, title: p.manifest.title, updatedAt: p.updatedAt }))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    });
  }

  async createProject(manifest: Manifest): Promise<ProjectSummary> {
    const checked = this.checked(manifest);
    const record: ProjectRecord = { id: crypto.randomUUID(), manifest: checked, updatedAt: new Date().toISOString() };
    await this.run([PROJECTS], "readwrite", async (tx) => void (await request(tx.objectStore(PROJECTS).add(record))));
    return { id: record.id, title: checked.title, updatedAt: record.updatedAt };
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.run([PROJECTS, CHAPTERS, ASSETS], "readwrite", async (tx) => {
      await this.project(tx, projectId);
      tx.objectStore(PROJECTS).delete(projectId);
      tx.objectStore(CHAPTERS).delete(ofProject(projectId));
      tx.objectStore(ASSETS).delete(ofProject(projectId));
    });
  }

  async loadManifest(projectId: string): Promise<Manifest> {
    return this.run([PROJECTS], "readonly", async (tx) => (await this.project(tx, projectId)).manifest);
  }

  async saveManifest(projectId: string, manifest: Manifest): Promise<void> {
    const checked = this.checked(manifest);
    await this.run([PROJECTS, CHAPTERS], "readwrite", async (tx) => {
      const project = await this.project(tx, projectId);
      const keep = new Set(checked.chapters.map((c) => c.id));
      // A chapter the manifest no longer lists loses its text.
      const chapters = tx.objectStore(CHAPTERS);
      const saved = (await request(chapters.getAll(ofProject(projectId)))) as ChapterRecord[];
      for (const c of saved) if (!keep.has(c.chapterId)) chapters.delete([projectId, c.chapterId]);
      tx.objectStore(PROJECTS).put({ ...project, manifest: checked, updatedAt: new Date().toISOString() } satisfies ProjectRecord);
    });
  }

  async loadChapter(projectId: string, chapterId: string): Promise<string> {
    return this.run([PROJECTS, CHAPTERS], "readonly", async (tx) => {
      const project = await this.project(tx, projectId);
      if (!project.manifest.chapters.some((c) => c.id === chapterId)) throw new ProjectStoreError("not-found", `There is no chapter "${chapterId}"`);
      const saved = (await request(tx.objectStore(CHAPTERS).get([projectId, chapterId]))) as ChapterRecord | undefined;
      return saved?.source ?? "";
    });
  }

  async saveChapter(projectId: string, chapterId: string, source: string): Promise<void> {
    if (typeof source !== "string") throw new ProjectStoreError("invalid", "A chapter's text must be a string");
    await this.run([PROJECTS, CHAPTERS], "readwrite", async (tx) => {
      const project = await this.project(tx, projectId);
      if (!project.manifest.chapters.some((c) => c.id === chapterId)) throw new ProjectStoreError("not-found", `There is no chapter "${chapterId}"`);
      tx.objectStore(CHAPTERS).put({ projectId, chapterId, source } satisfies ChapterRecord);
      tx.objectStore(PROJECTS).put({ ...project, updatedAt: new Date().toISOString() } satisfies ProjectRecord);
    });
  }

  async putAsset(projectId: string, file: Blob, options?: { id?: string }): Promise<AssetRef> {
    if (options?.id !== undefined && !isId(options.id)) throw new ProjectStoreError("invalid", `The asset id "${options.id}" is not valid`);
    // Read the bytes first: a transaction closes if it waits for anything but its own requests.
    const bytes = await file.arrayBuffer();
    const ref: AssetRef = { id: options?.id ?? crypto.randomUUID(), mediaType: file.type || "application/octet-stream", size: bytes.byteLength };
    const name = (file as File).name;
    if (name) ref.name = name;
    await this.run([PROJECTS, ASSETS], "readwrite", async (tx) => {
      const project = await this.project(tx, projectId);
      const assets = tx.objectStore(ASSETS);
      if (options?.id !== undefined && (await request(assets.count([projectId, ref.id]))) > 0) throw new ProjectStoreError("invalid", `The asset id "${ref.id}" is taken`);
      // Listed in the order they were added: one more than the highest number there is.
      const last = (await request(assets.getAll(ofProject(projectId)))) as AssetRecord[];
      const seq = last.reduce((n, a) => Math.max(n, a.seq ?? 0), 0) + 1;
      assets.add({ projectId, ref, bytes, seq } satisfies AssetRecord);
      tx.objectStore(PROJECTS).put({ ...project, updatedAt: new Date().toISOString() } satisfies ProjectRecord);
    });
    return ref;
  }

  async listAssets(projectId: string): Promise<AssetRef[]> {
    return this.run([PROJECTS, ASSETS], "readonly", async (tx) => {
      await this.project(tx, projectId);
      const all = (await request(tx.objectStore(ASSETS).getAll(ofProject(projectId)))) as AssetRecord[];
      return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).map((a) => a.ref); // records from before `seq` was kept sort first
    });
  }

  async getAsset(projectId: string, ref: AssetRef, _variant: "preview" | "original"): Promise<Blob> {
    const asset = await this.run([PROJECTS, ASSETS], "readonly", async (tx) => {
      await this.project(tx, projectId);
      return (await request(tx.objectStore(ASSETS).get([projectId, ref.id]))) as AssetRecord | undefined;
    });
    if (!asset) throw new ProjectStoreError("not-found", `There is no asset "${ref.id}"`);
    return new Blob([asset.bytes], { type: asset.ref.mediaType });
  }
}

/** Opens (and, the first time, creates) the browser's project database. */
export const openLocalStore = (options?: LocalStoreOptions) => LocalStore.open(options);
