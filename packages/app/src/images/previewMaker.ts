import type { PreviewReply, PreviewRequest } from "./previewWorker";

/** Makes the smaller copy of an image to show in the editor. Null means the original will do. Never rejects. */
export type MakePreview = (file: Blob) => Promise<Blob | null>;

/** Asks a worker to do it, so the page stays responsive. Without Worker or OffscreenCanvas (an old browser, a test) the originals are used. */
export function createWorkerPreviewMaker(): MakePreview {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return async () => null;
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, (reply: PreviewReply) => void>();
  const start = () => {
    const w = new Worker(new URL("./previewWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<PreviewReply>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    // A worker that cannot start leaves every waiting image with its original.
    w.onerror = () => {
      for (const done of waiting.values()) done({ id: -1, preview: null, error: "The worker stopped" });
      waiting.clear();
      worker = null;
    };
    return w;
  };
  return (file) =>
    new Promise((resolve) => {
      worker ??= start();
      const id = next++;
      waiting.set(id, (reply) => resolve(reply.preview));
      worker.postMessage({ id, file } satisfies PreviewRequest);
    });
}

let shared: MakePreview | undefined;
/** The app's maker: one worker for the whole page, started when the first image needs it. */
export const makePreview: MakePreview = (file) => (shared ??= createWorkerPreviewMaker())(file);
