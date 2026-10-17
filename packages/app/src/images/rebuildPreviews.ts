import type { ProjectStore } from "@rosetta/contracts";
import type { MakePreview } from "./previewMaker";

/**
 * Makes the preview copy of every image of a project from its original. A `.rosetta` file carries only the originals,
 * so a project that was imported from one has none until this has run. Never rejects: what fails keeps showing its original.
 */
export async function rebuildPreviews(store: ProjectStore, projectId: string, makePreview: MakePreview): Promise<void> {
  try {
    for (const ref of await store.listAssets(projectId)) {
      if (!ref.mediaType.startsWith("image/")) continue;
      try {
        const preview = await makePreview(await store.getAsset(projectId, ref, "original"));
        if (preview) await store.setAssetPreview(projectId, ref.id, preview);
      } catch {
        // The original is shown instead.
      }
    }
  } catch {
    // The project is gone (deleted meanwhile): nothing to do.
  }
}
