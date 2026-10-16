/** The editor page is one column of the book wide, so text wraps as it will in print. The page is scaled up as a whole to fill the pane. */
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 1.6;
/** Space left on each side of the page, in pixels (before scaling). */
export const GUTTER = 24;

/** The scale at which a page `pageWidth` px wide fills a pane `paneWidth` px wide, between MIN_ZOOM and MAX_ZOOM. */
export function fitZoom(paneWidth: number, pageWidth: number): number {
  if (!(paneWidth > 0) || !(pageWidth > 0)) return 1;
  const zoom = (paneWidth - 2 * GUTTER) / pageWidth;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

/**
 * Keeps `--editor-zoom` on `host` fitted to its width. The page's width is read from the theme (`--page-column-width`)
 * plus the editor's own padding, so a theme with another column width needs no change here.
 * Returns a function that stops watching.
 */
export function watchEditorZoom(host: HTMLElement, padding = 48): () => void {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:0;width:var(--page-column-width, 83mm)";
  host.append(probe);
  const update = () => {
    const column = probe.getBoundingClientRect().width;
    host.style.setProperty("--editor-zoom", String(fitZoom(host.clientWidth, column + padding)));
  };
  const observer = new ResizeObserver(update);
  observer.observe(host);
  update();
  return () => {
    observer.disconnect();
    probe.remove();
  };
}
