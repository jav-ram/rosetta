import type { AssetRef } from "@rosetta/contracts";
import type { PlacedImage } from "@rosetta/preview";
import { findAsset } from "./resolveImage";
import type { PixelSize } from "./imageSize";

/** Below this many dots per inch an image looks soft in print: it is warned about. */
export const MIN_PRINT_DPI = 150;
/** What print is usually made for; said in the warning, not checked. */
export const GOOD_PRINT_DPI = 300;

const CSS_PX_PER_INCH = 96;

/**
 * How many dots per inch the image has where it was placed. Its box is `widthPx` by `heightPx` CSS pixels. The image fills the
 * box (stretched, or enlarged until it covers it and cropped), so the smaller of the two ratios is the one that is short of pixels.
 * The shape of the image as the preview showed it (it is the right way up) says whether the stored size is the right way round.
 */
export function effectiveDpi(placed: PlacedImage, original: PixelSize): number {
  let { width, height } = original;
  const shownLandscape = placed.naturalWidth > placed.naturalHeight;
  const storedLandscape = width > height;
  if (placed.naturalWidth !== placed.naturalHeight && width !== height && shownLandscape !== storedLandscape) [width, height] = [height, width];
  return Math.min((CSS_PX_PER_INCH * width) / placed.widthPx, (CSS_PX_PER_INCH * height) / placed.heightPx);
}

export interface ResolutionWarning {
  /** The component that shows the image, to mark in the editor; null for a Markdown image. */
  index: number | null;
  message: string;
}

/**
 * The images that are below print quality where they are placed. `sizes` gives an asset's pixel size (null when it is not known,
 * for example an SVG, which has none); images that are not assets of the project are not judged.
 */
export function lowResolution(placed: readonly PlacedImage[], assets: readonly AssetRef[], sizes: (asset: AssetRef) => PixelSize | null | undefined, startPage = 1): ResolutionWarning[] {
  const found: ResolutionWarning[] = [];
  for (const image of placed) {
    const asset = findAsset(assets, image.source);
    const size = asset && sizes(asset);
    if (!asset || !size) continue;
    const dpi = effectiveDpi(image, size);
    if (dpi >= MIN_PRINT_DPI) continue;
    const name = asset.name ?? asset.id;
    found.push({
      index: image.index,
      message: `“${name}” is ${size.width} × ${size.height} pixels, about ${Math.round(dpi)} dpi at the size it has on page ${startPage + image.page - 1}. Print needs at least ${MIN_PRINT_DPI} dpi (${GOOD_PRINT_DPI} is best): use a larger image, or give it less room.`,
    });
  }
  return found;
}
