import type { AssetRef, ProjectStore } from "@rosetta/contracts";
import type { PlacedImage } from "@rosetta/preview";
import { useEffect, useRef, useState } from "react";
import { imageSize, type PixelSize } from "./imageSize";
import { lowResolution, type ResolutionWarning } from "./resolution";
import { findAsset } from "./resolveImage";

/**
 * The images placed in the chapter that are too small for print. The pixel size of each original is read once from its file (just
 * the start of it, see `imageSize`) and remembered; SVGs have none and are not judged.
 */
export function useResolutionWarnings(store: ProjectStore, projectId: string, assets: readonly AssetRef[], placed: readonly PlacedImage[], startPage: number): ResolutionWarning[] {
  const [warnings, setWarnings] = useState<ResolutionWarning[]>([]);
  const sizes = useRef(new Map<string, PixelSize | null>());
  // Another project has other assets.
  const project = useRef(projectId);
  if (project.current !== projectId) {
    project.current = projectId;
    sizes.current.clear();
  }

  useEffect(() => {
    let current = true;
    const wanted = new Map<string, AssetRef>();
    for (const image of placed) {
      const asset = findAsset(assets, image.source);
      if (asset && asset.mediaType.startsWith("image/") && asset.mediaType !== "image/svg+xml" && !sizes.current.has(asset.id)) wanted.set(asset.id, asset);
    }
    void (async () => {
      for (const asset of wanted.values()) {
        try {
          sizes.current.set(asset.id, await imageSize(await store.getAsset(projectId, asset, "original")));
        } catch {
          sizes.current.set(asset.id, null); // not judged
        }
      }
      if (current) setWarnings(lowResolution(placed, assets, (a) => sizes.current.get(a.id), startPage));
    })();
    return () => {
      current = false;
    };
  }, [store, projectId, assets, placed, startPage]);

  return warnings;
}
