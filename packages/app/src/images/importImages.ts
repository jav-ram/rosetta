import type { AssetRef, ProjectStore } from "@rosetta/contracts";
import type { MakePreview } from "./previewMaker";

export interface ImportProgress {
  /** Images to add. */
  total: number;
  /** Stored so far. */
  stored: number;
  /** Preview copies done (or found not to be needed) so far. */
  previewed: number;
}

export interface ImportOptions {
  makePreview: MakePreview;
  onProgress?: (progress: ImportProgress) => void;
  /** Called as soon as an image is stored: it can be listed and used before its preview copy is ready. */
  onAdded?: (ref: AssetRef) => void;
  /** Called when the preview copy of an image is stored. */
  onPreview?: (ref: AssetRef) => void;
}

export interface ImportResult {
  added: AssetRef[];
  /** Files that are not images, or could not be stored, with the reason. */
  skipped: { name: string; reason: string }[];
}

const isImage = (file: File) => file.type.startsWith("image/");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Adds images to a project. The original is stored first, one at a time, and each preview copy is made meanwhile
 * (in a worker) and stored when it is ready, so a long list does not hold anything up. A preview that cannot be made
 * is not an error: the original is shown instead.
 */
export async function importImages(store: ProjectStore, projectId: string, files: File[], options: ImportOptions): Promise<ImportResult> {
  const images = files.filter(isImage);
  const result: ImportResult = { added: [], skipped: files.filter((f) => !isImage(f)).map((f) => ({ name: f.name, reason: "not an image" })) };
  const progress: ImportProgress = { total: images.length, stored: 0, previewed: 0 };
  const report = () => options.onProgress?.({ ...progress });
  report();

  const previews: Promise<void>[] = [];
  for (const file of images) {
    let ref: AssetRef;
    try {
      ref = await store.putAsset(projectId, file);
    } catch (e) {
      result.skipped.push({ name: file.name, reason: message(e) });
      progress.total--;
      report();
      continue;
    }
    result.added.push(ref);
    progress.stored++;
    options.onAdded?.(ref);
    report();
    previews.push(
      (async () => {
        try {
          const preview = await options.makePreview(file);
          if (preview) {
            await store.setAssetPreview(projectId, ref.id, preview);
            options.onPreview?.(ref);
          }
        } catch {
          // The original is shown instead.
        }
        progress.previewed++;
        report();
      })(),
    );
  }
  await Promise.all(previews);
  return result;
}
