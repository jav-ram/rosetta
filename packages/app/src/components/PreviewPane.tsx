import type { Preview } from "@rosetta/preview";
import { useEffect, useRef, useState } from "react";
import { createAppPreview } from "../preview";
import { bookCss } from "../theme";
import type { Parsed } from "../useParsed";

type Layout = { state: "idle" } | { state: "working" } | { state: "done"; pages: number; ms: number } | { state: "error"; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The chapter as pages (Paged.js, in an iframe). It is drawn again whenever the parser gives new HTML, which already waits
 * until typing stops; the pages on screen stay until the new ones are ready.
 */
export function PreviewPane({ parsed, createPreview = createAppPreview }: { parsed: Parsed; createPreview?: (host: HTMLElement) => Preview }) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
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
    preview.current.render({ html: parsed.html, css: bookCss }).then(
      (r) => r && setLayout({ state: "done", pages: r.pages, ms: Math.round(performance.now() - started) }),
      (e: Error) => setLayout({ state: "error", message: e.message }),
    );
  }, [parsed]);

  const warnings = parsed.state === "ready" ? plural(parsed.warnings.length, "warning") : "";
  return (
    <section className="pane preview" aria-label="Preview">
      <header>
        <h2>Preview</h2>
        <span className="hint" role="status">
          {parsed.state === "loading" && "loading the parser…"}
          {parsed.state === "error" && "parser error"}
          {parsed.state === "ready" && layout.state === "working" && "laying out the pages…"}
          {parsed.state === "ready" && layout.state === "done" && `${plural(layout.pages, "page")} · ${layout.ms} ms · ${warnings}`}
          {parsed.state === "ready" && layout.state === "error" && "preview error"}
          {parsed.state === "ready" && layout.state === "idle" && warnings}
        </span>
      </header>
      {parsed.state === "error" && <p className="error">{parsed.message}</p>}
      {layout.state === "error" && <p className="error">{layout.message}</p>}
      <div className="preview-host" ref={host} />
    </section>
  );
}
