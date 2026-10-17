import { isId, validateAssetRef, validateManifest, type AssetRef, type Manifest, type ProjectStore, type ProjectSummary } from "@rosetta/contracts";
import { strFromU8, strToU8, unzip, zip, type AsyncZippable, type Unzipped } from "fflate";

/**
 * A project in one file: `.rosetta`, a zip.
 *
 * ```
 * manifest.json                  the manifest, as it is stored (chapter ids, titles, start rules, page counts)
 * chapters/01-introduction.md    each chapter's Rosetta Markdown, in book order: 01, 02, ...; the name after the number is the title
 * assets/assets.json             the list of assets, as `AssetRef`s
 * assets/originals/<id>.<ext>    the bytes of each asset
 * ```
 *
 * A chapter's file is the one whose number is its position in `manifest.chapters`, so ids survive without being in file
 * names, and renaming or reordering chapters in a file by hand does not need the manifest changed.
 * Preview copies of images are not in the file: they are made from the originals.
 *
 * The same project always gives the same bytes (fixed file dates), so exporting an imported file gives the file back.
 */

/** A problem with a `.rosetta` file that its owner can understand: not a project file, a part missing, too large. */
export class RosettaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosettaFileError";
  }
}

/** The largest a file may unpack to, as a guard against a file made to fill the memory. */
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

const FIXED_DATE = new Date(1980, 0, 1);
const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
};
/** Already compressed: storing them as they are is faster and no bigger. */
const COMPRESSED = new Set(["png", "jpg", "gif", "webp", "avif", "pdf", "woff2", "woff"]);

const extensionOf = (mediaType: string) => MEDIA_EXTENSIONS[mediaType] ?? "bin";
const assetPath = (ref: AssetRef) => `assets/originals/${ref.id}.${extensionOf(ref.mediaType)}`;

/** A file name made from a chapter's title: lower case letters and digits joined by hyphens. */
export function slug(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "chapter";
}

/** `chapters/01-`: how the file of the chapter at `index` starts. The number is the position, with as many digits as the project needs (at least two). */
export function chapterPrefix(index: number, count: number): string {
  return `chapters/${String(index + 1).padStart(Math.max(2, String(count).length), "0")}-`;
}

/** `chapters/01-title.md` */
export const chapterPath = (index: number, count: number, title: string) => `${chapterPrefix(index, count)}${slug(title)}.md`;

const zipAsync = (files: AsyncZippable) =>
  new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, data) => (error ? reject(error) : resolve(data))));

/** Everything in the project, as the bytes of a `.rosetta` file. */
export async function exportProject(store: ProjectStore, projectId: string): Promise<Uint8Array> {
  const manifest = await store.loadManifest(projectId);
  const files: AsyncZippable = {};
  const add = (path: string, data: Uint8Array, level?: 0 | 6) => (files[path] = [data, { mtime: FIXED_DATE, level: level ?? 6 }]);

  add("manifest.json", strToU8(`${JSON.stringify(manifest, null, 2)}\n`));
  for (const [i, chapter] of manifest.chapters.entries()) {
    add(chapterPath(i, manifest.chapters.length, chapter.title), strToU8(await store.loadChapter(projectId, chapter.id)));
  }
  const refs = await store.listAssets(projectId);
  add("assets/assets.json", strToU8(`${JSON.stringify(refs, null, 2)}\n`));
  for (const ref of refs) {
    const bytes = new Uint8Array(await (await store.getAsset(projectId, ref, "original")).arrayBuffer());
    add(assetPath(ref), bytes, COMPRESSED.has(extensionOf(ref.mediaType)) ? 0 : 6);
  }
  return zipAsync(files);
}

const unzipAsync = (data: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) => {
    let total = 0;
    unzip(
      data,
      {
        filter: (file) => {
          total += file.originalSize;
          if (total > MAX_UNPACKED_BYTES) throw new RosettaFileError("This file unpacks to more than 1 GB, which is more than Rosetta opens.");
          return true;
        },
      },
      (error, files) => (error ? reject(error) : resolve(files)),
    );
  }).catch((e: unknown) => {
    if (e instanceof RosettaFileError) throw e;
    throw new RosettaFileError("This is not a Rosetta project file: it could not be opened as a zip.");
  });

function json<T>(files: Unzipped, path: string): T {
  const data = files[path];
  if (!data) throw new RosettaFileError(`This is not a Rosetta project file: ${path} is missing.`);
  try {
    return JSON.parse(strFromU8(data)) as T;
  } catch {
    throw new RosettaFileError(`${path} is not valid JSON.`);
  }
}

/**
 * Makes a new project in `store` from the bytes of a `.rosetta` file. The project gets a new id; chapter and asset ids are kept.
 * If anything is wrong with the file nothing is left behind: the project is removed again and a `RosettaFileError` says what.
 */
export async function importProject(store: ProjectStore, bytes: Uint8Array): Promise<ProjectSummary> {
  const files = await unzipAsync(bytes);

  // Read and check the whole file before the store is touched.
  const manifest = json<Manifest>(files, "manifest.json");
  const checked = validateManifest(manifest);
  if (!checked.valid) throw new RosettaFileError(`manifest.json is not a valid manifest: ${checked.errors.slice(0, 3).join("; ")}.`);

  const count = manifest.chapters.length;
  const texts = manifest.chapters.map((chapter, i) => {
    const prefix = chapterPrefix(i, count);
    const path = Object.keys(files).find((name) => name.startsWith(prefix) && name.endsWith(".md"));
    if (!path) throw new RosettaFileError(`The file for chapter ${i + 1}, “${chapter.title}”, is missing (${prefix}….md).`);
    return strFromU8(files[path]!);
  });

  const refs = files["assets/assets.json"] ? json<AssetRef[]>(files, "assets/assets.json") : [];
  if (!Array.isArray(refs)) throw new RosettaFileError("assets/assets.json is not a list of assets.");
  const seen = new Set<string>();
  const assets = refs.map((ref) => {
    const valid = validateAssetRef(ref);
    if (!valid.valid || !isId(ref.id)) throw new RosettaFileError(`assets/assets.json has an asset that is not valid: ${valid.errors[0] ?? "its id"}.`);
    if (seen.has(ref.id)) throw new RosettaFileError(`assets/assets.json lists the asset ${ref.id} twice.`);
    seen.add(ref.id);
    const data = files[assetPath(ref)];
    if (!data) throw new RosettaFileError(`The asset ${ref.id} is listed but ${assetPath(ref)} is missing.`);
    return { ref, data };
  });
  const cover = manifest.cover?.image;
  if (cover && !seen.has(cover.id)) throw new RosettaFileError(`The cover image ${cover.id} is not among the assets.`);

  // Then write it; take it all back if that fails.
  const summary = await store.createProject(manifest);
  try {
    for (const [i, chapter] of manifest.chapters.entries()) await store.saveChapter(summary.id, chapter.id, texts[i]!);
    for (const { ref, data } of assets) {
      // A File carries the name; a Blob does not, so an asset that had no name has none again.
      const file = ref.name ? new File([data as BlobPart], ref.name, { type: ref.mediaType }) : new Blob([data as BlobPart], { type: ref.mediaType });
      await store.putAsset(summary.id, file, { id: ref.id });
    }
  } catch (e) {
    await store.deleteProject(summary.id).catch(() => {});
    throw e;
  }
  return (await store.listProjects()).find((p) => p.id === summary.id) ?? summary;
}
