import { defaultResolveImage, type OversizedBlock, type PlacedImage, type Preview, type UnpairedSpread } from "@rosetta/preview";
import { useEffect, useRef, useState } from "react";
import { createAppPreview } from "../preview";
import { bookCss } from "../theme";
import type { Parsed } from "../useParsed";

type Layout = { state: "idle" } | { state: "working" } | { state: "done"; pages: number; ms: number; oversized: OversizedBlock[]; spreads: UnpairedSpread[]; images: PlacedImage[] } | { state: "error"; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Props {
  parsed: Parsed;
  /** Called after each layout with the text that was laid out, the components that do not fit in a column, and how many pages it came to (with the first page number it was laid out with, the pages of art that should be a spread and are not, and the images as they were placed). */
  onLayout?: (markdown: string, oversized: OversizedBlock[], result: { pages: number; startPage: number; spreads: UnpairedSpread[]; images: PlacedImage[] }) => void;
  /** The book's page number of this chapter's first page (default 1), and how the chapter starts. See `PreviewInput`. */
  startPage?: number;
  startOn?: "next-page" | "right-page";
  /** The page numbers may be out of date: a chapter before this one changed since they were worked out. */
  stale?: boolean;
  /** Problems with the images in the chapter that only the app can see (too small for print), listed with the layout problems. */
  imageProblems?: string[];
  /** The URL to load for an image in the chapter (see `PreviewOptions.resolveImage`). */
  resolveImage?: (src: string) => string;
  /** Changes when an image the chapter shows becomes available or changes, so the pages are laid out again. */
  imagesKey?: string;
  createPreview?: (host: HTMLElement, resolveImage?: (src: string) => string) => Preview;
}

/** What the author sees for a component that is taller than a column. */
export const oversizedMessage = (b: OversizedBlock) =>
  `A "${b.name}" is taller than a column (${b.heightMm} mm; a column is ${b.columnMm} mm). It cannot fit on a page: shorten it or split it in two.`;

/** What the author sees for pages of art that were meant to be a spread: where they are in the book, and what to do. */
export const spreadMessage = (s: UnpairedSpread, startPage = 1) => {
  const first = startPage + s.page - 1;
  const pages = s.count === 2 ? `Pages ${first} and ${first + 1}` : `Pages ${first} to ${first + s.count - 1}`;
  return `${pages} are pages of art in a row, but ${first} is a right-hand page, so they do not face each other when the book is printed. Add side="left" to the first one to put it on a left-hand page.`;
};

/**
 * The chapter as pages (Paged.js, in an iframe). It is drawn again whenever the parser gives new HTML, which already waits
 * until typing stops; the pages on screen stay until the new ones are ready.
 */
export function PreviewPane({ parsed, onLayout, startPage, startOn, stale, resolveImage, imagesKey, imageProblems = [], createPreview = createAppPreview }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const resolveRef = useRef(resolveImage);
  resolveRef.current = resolveImage;
  const [layout, setLayout] = useState<Layout>({ state: "idle" });

  useEffect(() => {
    preview.current = createPreview(host.current!, (src) => (resolveRef.current ?? defaultResolveImage)(src));
    return () => {
      preview.current?.destroy();
      preview.current = null;
    };
  }, [createPreview]);

  useEffect(() => {
    if (parsed.state !== "ready" || !preview.current) return;
    const started = performance.now();
    setLayout({ state: "working" });
    preview.current.render({ html: parsed.html, css: bookCss, startPage, startOn }).then(
      (r) => {
        if (!r) return;
        setLayout({ state: "done", pages: r.pages, ms: Math.round(performance.now() - started), oversized: r.oversized, spreads: r.spreads, images: r.images });
        onLayoutRef.current?.(parsed.markdown, r.oversized, { pages: r.pages, startPage: startPage ?? 1, spreads: r.spreads, images: r.images });
      },
      (e: Error) => setLayout({ state: "error", message: e.message }),
    );
  }, [parsed, startPage, startOn, imagesKey]);

  const warnings = parsed.state === "ready" ? plural(parsed.warnings.length, "warning") : "";
  const oversized = layout.state === "done" ? layout.oversized : [];
  const spreads = layout.state === "done" ? layout.spreads : [];
  const problems = oversized.length + spreads.length + (layout.state === "done" ? imageProblems.length : 0);
  return (
    <section className="pane preview" aria-label="Preview">
      <header>
        <h2>Preview</h2>
        <span className="hint" role="status">
          {parsed.state === "loading" && "loading the parser…"}
          {parsed.state === "error" && "parser error"}
          {parsed.state === "ready" && layout.state === "working" && "laying out the pages…"}
          {parsed.state === "ready" && layout.state === "done" && `${plural(layout.pages, "page")}${startPage && startPage > 1 ? ` (from page ${startPage})` : ""} · ${layout.ms} ms · ${warnings}${problems ? ` · ${plural(problems, "layout problem")}` : ""}`}
          {parsed.state === "ready" && layout.state === "error" && "preview error"}
          {parsed.state === "ready" && layout.state === "idle" && warnings}
        </span>
      </header>
      {stale && (
        <p className="stale-pages" role="note">
          ⚠ Page numbers may be out of date: a chapter before this one changed, or has not been laid out yet. Open the chapters before it to update them.
        </p>
      )}
      {parsed.state === "error" && <p className="error">{parsed.message}</p>}
      {layout.state === "error" && <p className="error">{layout.message}</p>}
      {problems > 0 && (
        <ul className="layout-warnings" aria-label="Layout problems">
          {oversized.map((b) => (
            <li key={b.index}>{oversizedMessage(b)}</li>
          ))}
          {spreads.map((sp) => (
            <li key={`spread-${sp.index}`}>{spreadMessage(sp, startPage)}</li>
          ))}
          {layout.state === "done" && imageProblems.map((m, i) => <li key={`image-${i}`}>{m}</li>)}
        </ul>
      )}
      <div className="preview-host" ref={host} />
    </section>
  );
}
