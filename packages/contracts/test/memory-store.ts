import { isId, ProjectStoreError, validateManifest, type AssetRef, type Manifest, type ProjectStore, type ProjectSummary } from "../src/index";

interface Project {
  manifest: Manifest;
  updatedAt: string;
  chapters: Map<string, string>;
  assets: Map<string, { ref: AssetRef; bytes: Blob }>;
}

/** What a store keeps beyond its own lifetime. Opening a MemoryStore on the same Data is "reopening" it. */
export interface Data {
  projects: Map<string, Project>;
  nextId: number;
}

export const newData = (): Data => ({ projects: new Map(), nextId: 1 });

/** The simplest ProjectStore there is: everything in memory. The reference for the conformance suite, and a stand-in for tests. */
export class MemoryStore implements ProjectStore {
  constructor(private data: Data = newData()) {}

  private project(id: string): Project {
    const p = this.data.projects.get(id);
    if (!p) throw new ProjectStoreError("not-found", `no project "${id}"`);
    return p;
  }

  private touch(p: Project) {
    p.updatedAt = new Date().toISOString();
  }

  private checked(manifest: Manifest): Manifest {
    const result = validateManifest(manifest);
    if (!result.valid) throw new ProjectStoreError("invalid", result.errors.join("; "));
    return structuredClone(manifest);
  }

  private summary(id: string, p: Project): ProjectSummary {
    return { id, title: p.manifest.title, updatedAt: p.updatedAt };
  }

  async listProjects() {
    return [...this.data.projects]
      .map(([id, p]) => this.summary(id, p))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async createProject(manifest: Manifest) {
    const checked = this.checked(manifest);
    const id = `p${this.data.nextId++}`;
    const p: Project = { manifest: checked, updatedAt: "", chapters: new Map(checked.chapters.map((c) => [c.id, ""])), assets: new Map() };
    this.touch(p);
    this.data.projects.set(id, p);
    return this.summary(id, p);
  }

  async deleteProject(projectId: string) {
    this.project(projectId);
    this.data.projects.delete(projectId);
  }

  async loadManifest(projectId: string) {
    return structuredClone(this.project(projectId).manifest);
  }

  async saveManifest(projectId: string, manifest: Manifest) {
    const p = this.project(projectId);
    const checked = this.checked(manifest);
    const ids = new Set(checked.chapters.map((c) => c.id));
    for (const id of p.chapters.keys()) if (!ids.has(id)) p.chapters.delete(id);
    for (const id of ids) if (!p.chapters.has(id)) p.chapters.set(id, "");
    p.manifest = checked;
    this.touch(p);
  }

  async loadChapter(projectId: string, chapterId: string) {
    const text = this.project(projectId).chapters.get(chapterId);
    if (text === undefined) throw new ProjectStoreError("not-found", `no chapter "${chapterId}"`);
    return text;
  }

  async saveChapter(projectId: string, chapterId: string, source: string) {
    const p = this.project(projectId);
    if (!p.chapters.has(chapterId)) throw new ProjectStoreError("not-found", `no chapter "${chapterId}"`);
    p.chapters.set(chapterId, source);
    this.touch(p);
  }

  async putAsset(projectId: string, file: Blob, options?: { id?: string }) {
    const p = this.project(projectId);
    if (options?.id !== undefined && (!isId(options.id) || p.assets.has(options.id))) throw new ProjectStoreError("invalid", `The asset id "${options.id}" is not valid or is taken`);
    const ref: AssetRef = { id: options?.id ?? `a${this.data.nextId++}`, mediaType: file.type || "application/octet-stream", size: file.size };
    const name = (file as File).name;
    if (name) ref.name = name;
    p.assets.set(ref.id, { ref, bytes: file.slice() });
    this.touch(p);
    return structuredClone(ref);
  }

  async listAssets(projectId: string) {
    return [...this.project(projectId).assets.values()].map((a) => structuredClone(a.ref));
  }

  async getAsset(projectId: string, ref: AssetRef, _variant: "preview" | "original") {
    const asset = this.project(projectId).assets.get(ref.id);
    if (!asset) throw new ProjectStoreError("not-found", `no asset "${ref.id}"`);
    return asset.bytes.slice();
  }
}
