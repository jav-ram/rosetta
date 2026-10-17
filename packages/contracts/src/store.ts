import type { AssetRef, Manifest, ProjectSummary } from "./generated/types";

export type ProjectStoreErrorCode =
  /** The project, chapter or asset does not exist. */
  | "not-found"
  /** The input breaks a contract: a manifest that does not validate, or text that is not a string. */
  | "invalid";

/** What a ProjectStore throws (as a rejected promise) when it cannot do what was asked. Anything else is a failure of the storage itself. */
export class ProjectStoreError extends Error {
  constructor(
    readonly code: ProjectStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectStoreError";
  }
}

/**
 * Where projects live. All app code goes through this interface; nothing else talks to IndexedDB, files or a server.
 * `LocalStore` (IndexedDB) implements it in v1, and an `ApiStore` can later.
 *
 * A project is a manifest, the text of each chapter listed in it, and assets.
 * Any implementation can be checked with the suite in `@rosetta/contracts/store-conformance`.
 *
 * Rules every implementation follows:
 *
 * - **The manifest is the list of what exists.** A chapter exists while the manifest lists its id. `saveManifest` that no longer lists a chapter discards the chapter's text. Reordering or renaming keeps it, because ids do not change.
 * - **Values, not references.** What a store returns is the caller's to change; changing it never changes what is stored.
 * - **Whole-value writes.** Each save replaces the previous value, and when the promise resolves the value has been stored: loading it, also after the store is reopened, gives it back.
 * - **Projects are separate.** The same chapter id in two projects is two chapters, and an asset belongs to the project it was added to.
 * - **Errors** are `ProjectStoreError` with a `code`.
 */
export interface ProjectStore {
  /** All projects, most recently changed first. */
  listProjects(): Promise<ProjectSummary[]>;

  /**
   * Adds a project and returns its summary; the store chooses the id. The manifest must validate (`validateManifest`), else `invalid`.
   * Every chapter it lists starts with empty text.
   */
  createProject(manifest: Manifest): Promise<ProjectSummary>;

  /** Removes the project with its chapters and assets. `not-found` if there is no such project. */
  deleteProject(projectId: string): Promise<void>;

  /** `not-found` if there is no such project. */
  loadManifest(projectId: string): Promise<Manifest>;

  /** Replaces the manifest. It must validate, else `invalid`. Chapters it no longer lists are discarded; new ones start empty. */
  saveManifest(projectId: string, manifest: Manifest): Promise<void>;

  /** The chapter's Rosetta Markdown, exactly as it was saved (empty if never saved). `not-found` if the manifest does not list the chapter. */
  loadChapter(projectId: string, chapterId: string): Promise<string>;

  /** Replaces the chapter's Markdown. `not-found` if the manifest does not list the chapter. */
  saveChapter(projectId: string, chapterId: string, source: string): Promise<void>;

  /**
   * Stores a file and returns its reference. The reference records the size and, when the file has a name or a type
   * (a `File`, or a `Blob` with a `type`), the name and media type. Adding the same bytes twice may give two references.
   * The store chooses the id, unless `options.id` is given (importing a project keeps the ids that text may refer to):
   * it must be a valid id (`invalid` otherwise) that no asset of the project has (`invalid` if it is taken).
   */
  putAsset(projectId: string, file: Blob, options?: { id?: string }): Promise<AssetRef>;

  /** Every asset of the project, in the order they were added. `not-found` if there is no such project. */
  listAssets(projectId: string): Promise<AssetRef[]>;

  /**
   * `original` is exactly the bytes that were added. `preview` is a copy that is cheaper to show: the one given to
   * `setAssetPreview`, or the original if none was. `not-found` if the project has no such asset.
   */
  getAsset(projectId: string, ref: AssetRef, variant: "preview" | "original"): Promise<Blob>;

  /**
   * Stores the preview copy of an asset (a smaller image made from the original), replacing an earlier one. The original is
   * not touched, and the project's `updatedAt` does not move: a preview can always be made again. `not-found` if the project
   * has no such asset.
   */
  setAssetPreview(projectId: string, assetId: string, preview: Blob): Promise<void>;
}
