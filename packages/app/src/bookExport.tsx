import { BrowserPrintExporter } from "@rosetta/exporter-browser";
import { ExportError, type ExportProgress, type Exporter, type ProjectStore } from "@rosetta/contracts";
import { useCallback, useRef, useState } from "react";
import { parser } from "./parser";
import { createAppBookLayout } from "./preview";
import { bookCss } from "./theme";

/** The exporter the app uses: the whole book through the browser's print dialog. */
export const createBookExporter = (store: ProjectStore): Exporter =>
  new BrowserPrintExporter({ store, parse: (markdown) => parser.parse(markdown), createLayout: () => createAppBookLayout(document.body), css: bookCss });

export type BookExportState =
  | { state: "idle" }
  | { state: "working"; title: string; progress: ExportProgress | null }
  | { state: "done"; title: string; pages: number; warnings: string[] }
  | { state: "error"; title: string; message: string };

/**
 * Exports a book as a PDF, through the print dialog, and says how it is going. `start` takes the project and, if the caller has
 * something to write first (the editor's waiting changes), a step to do before reading the book.
 */
export function useBookExport(store: ProjectStore, createExporter: (store: ProjectStore) => Exporter = createBookExporter) {
  const [status, setStatus] = useState<BookExportState>({ state: "idle" });
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(
    async (projectId: string, title: string, before?: () => Promise<void>) => {
      if (controller.current) return; // one at a time
      const mine = new AbortController();
      controller.current = mine;
      setStatus({ state: "working", title, progress: null });
      try {
        await before?.();
        const result = await createExporter(store).exportBook(projectId, { signal: mine.signal, onProgress: (progress) => setStatus({ state: "working", title, progress }) });
        setStatus({ state: "done", title, pages: result.pages, warnings: result.warnings });
      } catch (e) {
        if (e instanceof ExportError && e.code === "cancelled") setStatus({ state: "idle" });
        else setStatus({ state: "error", title, message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.current = null;
      }
    },
    [store, createExporter],
  );
  const cancel = useCallback(() => controller.current?.abort(), []);
  const close = useCallback(() => setStatus({ state: "idle" }), []);
  return { status, start, cancel, close };
}

/** The window over the editor while the book is being made, and when it is done. */
export function BookExportDialog({ status, onCancel, onClose }: { status: BookExportState; onCancel: () => void; onClose: () => void }) {
  if (status.state === "idle") return null;
  const progress = status.state === "working" ? status.progress : null;
  const printing = progress?.stage === "printing";
  return (
    <div className="export-overlay">
      <div className="export-dialog" role="dialog" aria-modal="true" aria-label="Export as PDF">
        <h2>Export “{status.title}” as PDF</h2>
        {status.state === "working" && (
          <>
            <p role="status" aria-live="polite">
              {progress?.message ?? "Starting…"}
            </p>
            <progress max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.done : undefined} aria-label="Progress" />
            <p className="hint">
              {printing
                ? "In the print dialog, choose “Save as PDF” as the destination. Leave margins on Default, and turn on Background graphics if it is off."
                : "The whole book is laid out first, which takes a few seconds for a book of a hundred pages. Please keep this tab open and in front: a tab that is in the background is laid out many times more slowly."}
            </p>
            <div className="export-actions">
              <button type="button" onClick={onCancel} disabled={printing}>
                Cancel
              </button>
            </div>
          </>
        )}
        {status.state === "done" && (
          <>
            <p role="status">
              Done: the book has {status.pages} page{status.pages === 1 ? "" : "s"}. If the print dialog was closed without saving, export again.
            </p>
            {status.warnings.length > 0 && (
              <ul className="export-warnings" aria-label="Things to know">
                {status.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <div className="export-actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
        {status.state === "error" && (
          <>
            <p role="alert" className="export-error">
              The PDF could not be made: {status.message}
            </p>
            <div className="export-actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
