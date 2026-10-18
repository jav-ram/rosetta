// Real picture files for the benchmark books: PNGs the size of an A4 page at 300 dpi, made without any library (zlib is in Node).
// The placeholder SVGs are a few hundred bytes, which says nothing about what an illustrated book costs in memory and print time;
// these are about two megabytes each, like a scan or a piece of art.
import { crc32, deflateSync } from "node:zlib";

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

/** A PNG (8-bit RGB) from a function that writes the pixels of one row. */
export function png(width, height, row) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  let above = Buffer.alloc(stride);
  let current = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    raw[at] = 2; // filter "Up": each byte is the difference from the one above it, so a smooth picture compresses far better
    row(y, current);
    for (let i = 0; i < stride; i++) raw[at + 1 + i] = (current[i] - above[i]) & 255;
    [above, current] = [current, above];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

const hsl = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min((n + h / 30) % 12 - 3, 9 - ((n + h / 30) % 12), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

/**
 * Illustration number `n`: a gradient in its own color, a frame and two diagonals, and a little noise (the same on all three
 * channels, so the file is about two megabytes, not twelve). The same number always gives the same bytes.
 */
export function illustration(n, width = 2480, height = 1754) {
  const hue = (n * 47) % 360;
  const [r0, g0, b0] = hsl(hue, 0.4, 0.78);
  const [r1, g1, b1] = hsl(hue, 0.4, 0.35);
  let seed = (n * 2654435761) >>> 0 || 1;
  const rand = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), (seed >>> 0) / 4294967296);
  const frame = Math.round(width * 0.016);
  return png(width, height, (y, out) => {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const noise = (rand() - 0.5) * 3.5;
      let r = r0 + (r1 - r0) * t + noise;
      let g = g0 + (g1 - g0) * t + noise;
      let b = b0 + (b1 - b0) * t + noise;
      const onFrame = x < frame || y < frame || x >= width - frame || y >= height - frame;
      const onDiagonal = Math.abs(y - (x * height) / width) < 3 || Math.abs(y - (height - (x * height) / width)) < 3;
      if (onFrame || onDiagonal) (r *= 0.55), (g *= 0.55), (b *= 0.55);
      const i = x * 3;
      out[i] = Math.max(0, Math.min(255, r));
      out[i + 1] = Math.max(0, Math.min(255, g));
      out[i + 2] = Math.max(0, Math.min(255, b));
    }
  });
}
