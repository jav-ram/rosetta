import type { AssetRef } from "./generated/types";

/**
 * The asset a chapter refers to. In a chapter an image is named by its file name or its id (`::figure{src="tavern.png"}`, an
 * `assets/` in front is allowed, and a URL-encoded name works). An id wins over a name; when two assets have the same name the
 * one added first is used (assets are given in the order they were added).
 */
export function findAsset(assets: readonly AssetRef[], src: string): AssetRef | undefined {
  let wanted = src.trim().replace(/^assets\//, "");
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    // not a URL-encoded name: use it as it is
  }
  return assets.find((a) => a.id === wanted) ?? assets.find((a) => a.name === wanted);
}
