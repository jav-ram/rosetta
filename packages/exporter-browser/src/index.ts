import { ExportError, findAsset, type AssetRef, type ExportOptions, type ExportProgress, type ExportResult, type Exporter, type ProjectStore } from "@rosetta/contracts";

export const name = "@rosetta/exporter-browser";

/**
 * What the exporter needs from the layout of a whole book. `@rosetta/preview` has an implementation (`createBookLayout`); this package
 * does not import it, because packages only know `contracts`: the app gives it.
 */
export interface BookLayout {
  render(
    input: { cover?: { title: string; art?: string }; chapters: { html: string; startOn?: "next-page" | "right-page" }[]; css: string },
    options?: { resolveImage?: (src: string) => string | undefined; onPage?: (pages: number) => void; onImages?: (loaded: number, total: number) => void; signal?: AbortSignal },
  ): Promise<{ pages: number; layoutMs: number; oversized: unknown[] }>;
  print(): Promise<void>;
  destroy(): void;
}

export interface BrowserPrintDependencies {
  store: ProjectStore;
  /** The parser: a chapter's Rosetta Markdown in, its HTML out. */
  parse(markdown: string): Promise<{ html: string }>;
  /** A new layout of a book (it is destroyed when the export ends). */
  createLayout(): BookLayout;
  /** The theme's CSS, with `@page` variables already written in. */
  css: string;
}

const isAbort = (e: unknown) => (e instanceof DOMException || e instanceof Error) && e.name === "AbortError";

/** The images a chapter's HTML shows: `<img src>` of Markdown images and figures, and the `data-art` of pages of art. */
function sourcesOf(html: string): string[] {
  if (!html.includes("<img") && !html.includes("data-art=")) return [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return [...doc.querySelectorAll("img, [data-art]")].map((el) => (el.nodeName === "IMG" ? el.getAttribute("src") : el.getAttribute("data-art")) ?? "");
}
const isAbsolute = (src: string) => /^(https?:|data:|blob:)/i.test(src.trim());

/**
 * Prints the whole book from the browser: every chapter is read, converted, and laid out as one document in a frame that is not
 * seen, with the original images (not the smaller copies the editor shows), and then the browser's print dialog is opened, where
 * "Save as PDF" makes the file. Nothing leaves the computer.
 */
export class BrowserPrintExporter implements Exporter {
  constructor(private readonly deps: BrowserPrintDependencies) {}

  async exportBook(projectId: string, options: ExportOptions = {}): Promise<ExportResult> {
    const { store, parse, css } = this.deps;
    const { signal } = options;
    const progress = (p: ExportProgress) => options.onProgress?.(p);
    const check = () => {
      if (signal?.aborted) throw new ExportError("cancelled", "The export was cancelled");
    };
    const urls = new Map<string, string>(); // asset id -> address of its original
    const layout = this.deps.createLayout();
    try {
      // 1. The text of every chapter, in book order.
      check();
      const manifest = await store.loadManifest(projectId);
      const texts: string[] = [];
      for (const [i, chapter] of manifest.chapters.entries()) {
        progress({ stage: "reading", message: `Reading “${chapter.title}”`, done: i, total: manifest.chapters.length });
        texts.push(await store.loadChapter(projectId, chapter.id));
        check();
      }
      if (manifest.chapters.length === 0 || texts.every((t) => t.trim() === "")) throw new ExportError("empty", "There is nothing to export: the book has no text yet");

      // 2. Each chapter through the parser.
      const htmls: string[] = [];
      for (const [i, text] of texts.entries()) {
        progress({ stage: "converting", message: `Converting “${manifest.chapters[i]!.title}”`, done: i, total: texts.length });
        htmls.push((await parse(text)).html);
        check();
      }

      // 3. The originals of the images the book uses, and only those.
      const assets = await store.listAssets(projectId);
      const warnings: string[] = [];
      const wanted = new Map<string, AssetRef>();
      const missing = new Set<string>();
      for (const src of htmls.flatMap(sourcesOf)) {
        if (!src || isAbsolute(src)) continue;
        const asset = findAsset(assets, src);
        if (asset) wanted.set(asset.id, asset);
        else missing.add(src);
      }
      // The cover: the book's title (or the one set for the cover) and, if there is one, its picture, which is one of the project's images.
      let cover: { title: string; art?: string } | undefined;
      if (manifest.cover) {
        cover = { title: manifest.cover.title?.trim() || manifest.title };
        const picture = manifest.cover.image;
        if (picture) {
          const asset = assets.find((a) => a.id === picture.id);
          if (asset) {
            wanted.set(asset.id, asset);
            cover.art = asset.id;
          } else warnings.push("The cover image is not in the project, so the cover is printed without it.");
        }
      }
      for (const src of missing) warnings.push(`The image “${src}” is not in the project, so a gray placeholder is printed in its place.`);

      let n = 0;
      for (const asset of wanted.values()) {
        progress({ stage: "images", message: `Loading ${asset.name ?? asset.id}`, done: n++, total: wanted.size });
        urls.set(asset.id, URL.createObjectURL(await store.getAsset(projectId, asset, "original")));
        check();
      }

      // 4. The whole book, laid out.
      progress({ stage: "layout", message: "Laying out the pages", done: 0, total: 0 });
      const result = await layout.render(
        { cover, chapters: htmls.map((html, i) => ({ html, startOn: manifest.chapters[i]!.start })), css },
        {
          signal,
          resolveImage: (src) => {
            const asset = findAsset(assets, src);
            return asset ? urls.get(asset.id) : undefined;
          },
          onPage: (pages) => progress({ stage: "layout", message: `Laying out page ${pages}`, done: pages, total: 0 }),
          onImages: (loaded, total) => progress({ stage: "images", message: `Loading images (${loaded} of ${total})`, done: loaded, total }),
        },
      );
      check();
      if (result.oversized.length) warnings.push(`${result.oversized.length} component${result.oversized.length === 1 ? " is" : "s are"} taller than a column and will not fit on a page.`);

      // 5. The print dialog.
      progress({ stage: "printing", message: "Opening the print dialog: choose Save as PDF", done: result.pages, total: result.pages });
      await layout.print();
      return { pages: result.pages, warnings };
    } catch (e) {
      if (e instanceof ExportError) throw e;
      if (isAbort(e) || signal?.aborted) throw new ExportError("cancelled", "The export was cancelled");
      throw new ExportError("failed", e instanceof Error ? e.message : String(e));
    } finally {
      layout.destroy();
      for (const url of urls.values()) URL.revokeObjectURL(url);
    }
  }
}
