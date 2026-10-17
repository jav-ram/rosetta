/// <reference lib="webworker" />
// Makes the preview copies of images, away from the page: decoding and shrinking a large picture takes long enough to be felt.

import { MAX_PREVIEW_EDGE, PREVIEW_QUALITY, PREVIEW_TYPE } from "./preview-size";

export interface PreviewRequest {
  id: number;
  file: Blob;
}
export interface PreviewReply {
  id: number;
  /** The smaller copy, or null when the original should be shown: it is small already, or it could not be read as an image. */
  preview: Blob | null;
  /** Pixel size of the original, when it could be read. */
  width?: number;
  height?: number;
  error?: string;
}

async function makePreview(file: Blob): Promise<Omit<PreviewReply, "id">> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
    if (scale === 1) return { preview: null, width, height };
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await canvas.convertToBlob({ type: PREVIEW_TYPE, quality: PREVIEW_QUALITY });
    return { preview, width, height };
  } finally {
    bitmap.close();
  }
}

// One picture at a time: several decoded large pictures at once would be a lot of memory.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<PreviewRequest>) => {
  const { id, file } = e.data;
  queue = queue.then(async () => {
    let reply: PreviewReply;
    try {
      reply = { id, ...(await makePreview(file)) };
    } catch (error) {
      reply = { id, preview: null, error: error instanceof Error ? error.message : String(error) };
    }
    (self as unknown as Worker).postMessage(reply);
  });
};
