import type { OversizedBlock, Preview } from "@rosetta/preview";
import { useEffect, useRef, useState } from "react";
import { createAppPreview } from "../preview";
import { bookCss } from "../theme";
import type { Parsed } from "../useParsed";

type Layout = { state: "idle" } | { state: "working" } | { state: "done"; pages: number; ms: number; oversized: OversizedBlock[] } | { state: "error"; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Props {
  parsed: Parsed;
  /** Called after each layout with the text that was laid out, the components that do not fit in a column, and how many pages it came to (with the first page number it was laid out with). */
  onLayout?: (markdown: string, oversized: OversizedBlock[], result: { pages: number; startPage: number }) => void;
  /** The book's page number of this chapter's first page (default 1), and how the chapter starts. See `PreviewInput`. */
  startPage?: number;
  startOn?: "next-page" | "right-page";
  /** The page numbers may be out of date: a chapter before this one changed since they were worked out. */
  stale?: boolean;
  createPreview?: (host: HTMLElement) => Preview;
}

/** What the author sees for a component that is taller than a column. */
export const oversizedMessage = (b: OversizedBlock) =>
  `A "${b.name}" is taller than a column (${b.heightMm} mm; a column is ${b.columnMm} mm). It cannot fit on a page: shorten it or split it in two.`;

/**
 * The chapter as pages (Paged.js, in an iframe). It is drawn again whenever the parser gives new HTML, which already waits
 * until typing stops; the pages on screen stay until the new ones are ready.
 */
export function PreviewPane({ parsed, onLayout, startPage, startOn, stale, createPreview = createAppPreview }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const [layout, setLayout] = useState<Layout>({ state: "idle" });

  useEffect(() => {
    preview.current = createPreview(host.current!);
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
        setLayout({ state: "done", pages: r.pages, ms: Math.round(performance.now() - started), oversized: r.oversized });
        onLayoutRef.current?.(parsed.markdown, r.oversized, { pages: r.pages, startPage: startPage ?? 1 });
      },
      (e: Error) => setLayout({ state: "error", message: e.message }),
    );
  }, [parsed, startPage, startOn]);

  const warnings = parsed.state === "ready" ? plural(parsed.warnings.length, "warning") : "";
  const oversized = layout.state === "done" ? layout.oversized : [];
  return (
    <section className="pane preview" aria-label="Preview">
      <header>
        <h2>Preview</h2>
        <span className="hint" role="status">
          {parsed.state === "loading" && "loading the parser…"}
          {parsed.state === "error" && "parser error"}
          {parsed.state === "ready" && layout.state === "working" && "laying out the pages…"}
          {parsed.state === "ready" && layout.state === "done" && `${plural(layout.pages, "page")}${startPage && startPage > 1 ? ` (from page ${startPage})` : ""} · ${layout.ms} ms · ${warnings}${oversized.length ? ` · ${plural(oversized.length, "layout problem")}` : ""}`}
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
      {oversized.length > 0 && (
        <ul className="layout-warnings" aria-label="Layout problems">
          {oversized.map((b) => (
            <li key={b.index}>{oversizedMessage(b)}</li>
          ))}
        </ul>
      )}
      <div className="preview-host" ref={host} />
    </section>
  );
}
