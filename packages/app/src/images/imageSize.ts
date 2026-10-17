export interface PixelSize {
  width: number;
  height: number;
}

const u16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const le16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const le24 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/**
 * The pixel size of an image, read from the start of its file without decoding it (PNG, JPEG, GIF and WebP).
 * `"more"` means the size is further into the file than these bytes go (a JPEG with a large thumbnail in front of it);
 * `null` means it is not one of those formats, or cannot be read. The size is as stored: a JPEG that is turned by its
 * EXIF orientation is still given the stored way round.
 */
export function readImageSize(b: Uint8Array): PixelSize | "more" | null {
  if (b.length >= 24 && u32(b, 0) === 0x89504e47 && u32(b, 4) === 0x0d0a1a0a) return u32(b, 16) > 0 && u32(b, 20) > 0 ? { width: u32(b, 16), height: u32(b, 20) } : null;
  if (b.length >= 10 && text(b, 0, 3) === "GIF") return { width: le16(b, 6), height: le16(b, 8) };
  if (b.length >= 30 && text(b, 0, 4) === "RIFF" && text(b, 8, 4) === "WEBP") {
    const kind = text(b, 12, 4);
    if (kind === "VP8 ") return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    if (kind === "VP8L") return { width: 1 + (((b[22]! & 0x3f) << 8) | b[21]!), height: 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)) };
    if (kind === "VP8X") return { width: 1 + le24(b, 24), height: 1 + le24(b, 27) };
    return null;
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    for (;;) {
      while (at < b.length && b[at] === 0xff && b[at + 1] === 0xff) at++; // fill bytes
      if (at + 4 > b.length) return "more";
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1]!;
      if (marker === 0xd9 || marker === 0xda) return null; // end of image, or the picture itself: no size was given
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        at += 2; // markers with no length
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        if (at + 9 > b.length) return "more";
        return u16(b, at + 5) > 0 && u16(b, at + 7) > 0 ? { width: u16(b, at + 7), height: u16(b, at + 5) } : null;
      }
      at += 2 + u16(b, at + 2);
    }
  }
  return null;
}

const HEAD = 64 * 1024;

/** The pixel size of an image file. Reads the first 64 kB, and the whole file when the size is not in them. Null when it cannot be told. */
export async function imageSize(file: Blob): Promise<PixelSize | null> {
  const first = readImageSize(new Uint8Array(await file.slice(0, HEAD).arrayBuffer()));
  if (first !== "more") return first;
  const all = readImageSize(new Uint8Array(await file.arrayBuffer()));
  return all === "more" ? null : all;
}
