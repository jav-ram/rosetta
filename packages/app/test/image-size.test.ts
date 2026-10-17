import type { AssetRef } from "@rosetta/contracts";
import type { PlacedImage } from "@rosetta/preview";
import { describe, expect, test } from "vitest";
import { imageSize, readImageSize } from "../src/images/imageSize";
import { effectiveDpi, GOOD_PRINT_DPI, lowResolution, MIN_PRINT_DPI } from "../src/images/resolution";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

const png = (w: number, h: number) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), ascii("IHDR"), be32(w), be32(h), [8, 6, 0, 0, 0]);
const gif = (w: number, h: number) => bytes(ascii("GIF89a"), le16(w), le16(h), [0, 0, 0]);
/** A JPEG: the start of image, some segments in front (blocks like EXIF, of the given size in all; one holds at most 60,000 bytes), then the frame header. */
const jpeg = (w: number, h: number, exifSize = 0, marker = 0xc0) =>
  bytes([0xff, 0xd8], ...Array.from({ length: Math.ceil(exifSize / 60_000) }, (_, i) => { const n = Math.min(60_000, exifSize - i * 60_000); return [0xff, 0xe1, ...be16(n + 2), ...new Array<number>(n).fill(0)]; }), [0xff, marker, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const webpLossy = (w: number, h: number) => bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii("VP8 "), [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0]);
const webpExtended = (w: number, h: number) => bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii("VP8X"), [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1));
const webpLossless = (w: number, h: number) => {
  const wm = w - 1;
  const hm = h - 1;
  return bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii("VP8L"), [0, 0, 0, 0], [0x2f], [wm & 255, ((wm >> 8) & 0x3f) | ((hm & 3) << 6), (hm >> 2) & 255, (hm >> 10) & 15], new Array<number>(8).fill(0));
};

describe("reading the size of an image from its start", () => {
  test("PNG, GIF, WebP in its three kinds", () => {
    expect(readImageSize(png(1240, 1754))).toEqual({ width: 1240, height: 1754 });
    expect(readImageSize(gif(300, 200))).toEqual({ width: 300, height: 200 });
    expect(readImageSize(webpLossy(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(readImageSize(webpExtended(4000, 3000))).toEqual({ width: 4000, height: 3000 });
    expect(readImageSize(webpLossless(2480, 3508))).toEqual({ width: 2480, height: 3508 });
    expect(readImageSize(webpLossless(1, 1))).toEqual({ width: 1, height: 1 });
  });
  test("JPEG, baseline and progressive, with segments in front of the frame", () => {
    expect(readImageSize(jpeg(6000, 4000))).toEqual({ width: 6000, height: 4000 });
    expect(readImageSize(jpeg(800, 600, 0, 0xc2))).toEqual({ width: 800, height: 600 });
    expect(readImageSize(jpeg(3000, 2000, 20_000))).toEqual({ width: 3000, height: 2000 });
  });
  test("a JPEG whose frame is further in than the bytes given says so", () => {
    expect(readImageSize(jpeg(3000, 2000, 20_000).subarray(0, 5000))).toBe("more");
    expect(readImageSize(jpeg(3000, 2000).subarray(0, 8))).toBe("more");
  });
  test("anything else, or a size of nothing, is null", () => {
    expect(readImageSize(bytes(ascii("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")))).toBeNull();
    expect(readImageSize(new Uint8Array(0))).toBeNull();
    expect(readImageSize(png(0, 5))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0]))).toBeNull(); // no frame at all
    expect(readImageSize(bytes([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(readImageSize(bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii("XXXX"), new Array<number>(20).fill(0)))).toBeNull();
  });
  test("a file: the start is enough, the whole file when it is not", async () => {
    expect(await imageSize(new Blob([png(640, 480)]))).toEqual({ width: 640, height: 480 });
    const farther = jpeg(5000, 3000, 100_000); // the frame is after 64 kB
    expect(await imageSize(new Blob([farther]))).toEqual({ width: 5000, height: 3000 });
    expect(await imageSize(new Blob(["not an image"]))).toBeNull();
    expect(await imageSize(new Blob([jpeg(5000, 3000, 100_000).subarray(0, 70_000)]))).toBeNull(); // cut off: nothing to find
  });
});

const placed = (over: Partial<PlacedImage> = {}): PlacedImage => ({ source: "a.png", index: 0, page: 1, widthPx: 96, heightPx: 96, naturalWidth: 100, naturalHeight: 100, ...over });
const asset = (id: string, name: string, mediaType = "image/png"): AssetRef => ({ id, name, mediaType, size: 1 });

describe("dots per inch where an image is placed", () => {
  test("pixels over inches: 300 pixels in a box 1 inch wide are 300 dpi", () => {
    expect(effectiveDpi(placed({ widthPx: 96, heightPx: 96 }), { width: 300, height: 300 })).toBe(300);
    expect(effectiveDpi(placed({ widthPx: 192, heightPx: 192 }), { width: 300, height: 300 })).toBe(150);
  });
  test("an image that is cropped to its box is as sharp as its shorter side allows", () => {
    // 2000 × 800 pixels covering a page of 8.27 × 11.69 in: the height is what runs short
    expect(Math.round(effectiveDpi(placed({ widthPx: 794, heightPx: 1123, naturalWidth: 1600, naturalHeight: 640 }), { width: 2000, height: 800 }))).toBe(68);
  });
  test("an image that is turned by its EXIF orientation is judged the way it is shown", () => {
    // stored 4000 × 3000 but shown upright, 3000 × 4000, in a box 6 × 8 in
    const shown = placed({ widthPx: 576, heightPx: 768, naturalWidth: 750, naturalHeight: 1000 });
    expect(Math.round(effectiveDpi(shown, { width: 4000, height: 3000 }))).toBe(500);
    expect(Math.round(effectiveDpi(shown, { width: 3000, height: 4000 }))).toBe(500);
  });
  test("a square image has no turned way", () => {
    expect(effectiveDpi(placed({ widthPx: 96, heightPx: 96, naturalWidth: 10, naturalHeight: 10 }), { width: 150, height: 150 })).toBe(150);
  });
});

describe("images below print quality", () => {
  const assets = [asset("id-1", "map.png"), asset("id-2", "logo.svg", "image/svg+xml")];
  const sizes = (a: AssetRef) => (a.id === "id-1" ? { width: 300, height: 300 } : null);

  test("is warned about with its name, size, dpi, page and what to do", () => {
    const [w] = lowResolution([placed({ source: "map.png", widthPx: 384, heightPx: 384, page: 2, index: 5 })], assets, sizes, 8);
    expect(w).toEqual({ index: 5, message: `“map.png” is 300 × 300 pixels, about 75 dpi at the size it has on page 9. Print needs at least ${MIN_PRINT_DPI} dpi (${GOOD_PRINT_DPI} is best): use a larger image, or give it less room.` });
  });
  test("exactly the minimum is fine, one less is not", () => {
    expect(lowResolution([placed({ source: "map.png", widthPx: 192, heightPx: 192 })], assets, sizes)).toEqual([]);
    expect(lowResolution([placed({ source: "map.png", widthPx: 193, heightPx: 193 })], assets, sizes)).toHaveLength(1);
  });
  test("an image with no known size (an SVG, an unreadable file), or that is not an asset, is not judged", () => {
    expect(lowResolution([placed({ source: "logo.svg", widthPx: 9999, heightPx: 9999 }), placed({ source: "https://x.test/a.png", widthPx: 9999, heightPx: 9999 }), placed({ source: "gone.png", widthPx: 9999, heightPx: 9999 })], assets, sizes)).toEqual([]);
  });
  test("a Markdown image has no component to mark; the same image twice is two warnings", () => {
    const small = placed({ source: "map.png", widthPx: 960, heightPx: 960, index: null });
    const warnings = lowResolution([small, { ...small, page: 2 }], assets, sizes);
    expect(warnings.map((w) => w.index)).toEqual([null, null]);
  });
});
