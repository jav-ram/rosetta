import { findAsset, type AssetRef } from "@rosetta/contracts";
import { defaultResolveImage } from "@rosetta/preview";

export { findAsset };

/** What the preview and the editor load for an image: the project's own file when `src` names one, otherwise as the preview does by default. */
export function imageResolver(assets: readonly AssetRef[], urls: ReadonlyMap<string, string>) {
  return (src: string): string => {
    const asset = findAsset(assets, src);
    return (asset && urls.get(asset.id)) || defaultResolveImage(src);
  };
}

/** The name to write in a chapter for an asset: its file name, or its id when another asset has the same name. */
export function referenceFor(asset: AssetRef, assets: readonly AssetRef[]): string {
  if (!asset.name) return asset.id;
  return assets.filter((a) => a.name === asset.name).length === 1 ? asset.name : asset.id;
}
