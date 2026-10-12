/**
 * Paged.js preview: shows a chapter as pages, in an iframe.
 *
 * `createPreview(host, { pagedUrl })` puts an iframe in `host`. `render({ html, css })` builds a new document (the parser's
 * HTML inside `.rosetta-document`, plus the theme's CSS), runs Paged.js in it, and swaps it in when it is done. The old pages
 * stay on screen until then, and the scroll position is kept. A render that is overtaken by a newer one is dropped.
 *
 * This package knows nothing about themes or the parser: it is given HTML and CSS.
 */

export interface PreviewOptions {
  /** URL of Paged.js's `paged.polyfill.js`. The package does not bundle it. */
  pagedUrl: string;
  /**
   * Gives the URL to load for an image in the HTML. By default, images that are not absolute (`http:`, `https:`, `data:`, `blob:`)
   * are shown as a plain placeholder, so a missing file does not stall the layout.
   */
  resolveImage?: (src: string) => string;
  /** Milliseconds before a render is given up. */
  timeoutMs?: number;
}

export interface PreviewInput {
  /** The parser's HTML for the chapter. */
  html: string;
  /** The theme's CSS, with `@page` variables already written in. */
  css: string;
}

export interface PreviewResult {
  pages: number;
  /** Time Paged.js took to lay out the pages. */
  layoutMs: number;
}

export interface Preview {
  /** Resolves when the pages are on screen, or with `null` if a newer render replaced this one. Rejects if Paged.js fails. */
  render(input: PreviewInput): Promise<PreviewResult | null>;
  destroy(): void;
}

export const MESSAGE_TYPE = "rosetta-preview";

/** What the pages look like on screen: a gray desk with the pages in a column. Not part of the theme. */
const SCREEN_CSS = `
html { background: #6f7480; }
body { margin: 0; }
.pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
.pagedjs_page { flex: none; background: #fff; box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4); }
`;

/**
 * Paged.js lays out one page per animation frame and idle callback. Browsers stop or slow those down for a frame that is not
 * being painted (a background tab, a hidden frame), which made a 36-page chapter take 20 seconds instead of a third of a second.
 * Layout does not need frames, so inside the preview document both are run from a message channel, which is not throttled.
 */
const SCHEDULER = `(function () {
  var channel = new MessageChannel();
  var queue = [];
  channel.port1.onmessage = function () { var run = queue.shift(); if (run) run(); };
  function later(run) { queue.push(run); channel.port2.postMessage(0); }
  window.requestAnimationFrame = function (callback) { later(function () { callback(performance.now()); }); return 0; };
  window.requestIdleCallback = function (callback) { later(function () { callback({ didTimeout: false, timeRemaining: function () { return 50; } }); }); return 0; };
})();`;

/**
 * Paged.js splits a table across pages but does not repeat its header row. When a page starts in the middle of a table, a copy
 * of the table's `thead` is put at the top of the table's part on that page, before the page is measured (so it is part of
 * the layout). Installed on the layout hooks; exported as source so it can run inside the preview document.
 *
 * Not done: when a table runs from one column into the next on the same page, the header is not repeated. The columns are
 * the browser's multi-column layout, which does not repeat table headers, and rows inserted at a column start cannot be
 * placed reliably because the columns move when Paged.js removes what overflows the page.
 */
export const TABLE_HEADER_SCRIPT = `function installTableHeaderRepeat(hooks) {
  var startsPage = false;
  hooks.onPageLayout.register(function () { startsPage = true; });
  hooks.renderNode.register(function (clone, source) {
    if (!startsPage || clone.nodeType !== 1) return;
    startsPage = false;
    if (source.nodeName !== "TR" || (source.parentNode && source.parentNode.nodeName === "THEAD")) return;
    var table = clone.closest("table");
    var original = source.closest("table");
    var head = original && original.querySelector(":scope > thead");
    if (!table || !head || table.querySelector(":scope > thead")) return;
    var copy = head.cloneNode(true);
    copy.setAttribute("data-repeated-header", "");
    copy.removeAttribute("data-ref");
    copy.querySelectorAll("[data-ref]").forEach(function (e) { e.removeAttribute("data-ref"); });
    table.insertBefore(copy, table.firstChild);
  });
}`;

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#d9d9d9"/></svg>');

const isLoadable = (src: string) => /^(https?:|data:|blob:)/i.test(src.trim());
export const defaultResolveImage = (src: string) => (isLoadable(src) ? src : PLACEHOLDER);

function mapImages(html: string, resolve: (src: string) => string): string {
  if (!html.includes("<img")) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const img of doc.querySelectorAll("img")) img.setAttribute("src", resolve(img.getAttribute("src") ?? ""));
  return doc.body.innerHTML;
}

/** The text of a `<style>` or `<script>` cannot contain a closing tag. */
const safeInStyle = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

/** The document that goes in the iframe. Paged.js runs when it has loaded. */
export function buildDocument(input: PreviewInput, options: { pagedUrl: string; id: string; resolveImage?: (src: string) => string }): string {
  const html = mapImages(input.html, options.resolveImage ?? defaultResolveImage);
  const id = JSON.stringify(options.id);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${SCREEN_CSS}</style>
<style>${safeInStyle(input.css)}</style>
<script>${SCHEDULER}</script>
<script>window.PagedConfig = { auto: false };</script>
<script src="${options.pagedUrl.replace(/"/g, "&quot;")}"></script>
</head>
<body>
<div class="rosetta-document">${html}</div>
<script>
(function () {
  var id = ${id};
  function send(message) { message.type = ${JSON.stringify(MESSAGE_TYPE)}; message.id = id; parent.postMessage(message, "*"); }
  if (!window.PagedPolyfill) { send({ error: "Paged.js did not load" }); return; }
  ${TABLE_HEADER_SCRIPT}
  try { installTableHeaderRepeat(window.PagedPolyfill.chunker.hooks); } catch (e) { /* the pages are laid out without repeated headers */ }
  var start = performance.now();
  window.PagedPolyfill.preview().then(
    function (flow) { send({ pages: flow.total, layoutMs: performance.now() - start }); },
    function (e) { send({ error: String((e && e.message) || e) }); }
  );
})();
</script>
</body>
</html>`;
}

const GUTTER = 32; // the page padding in SCREEN_CSS, both sides

/** Shrinks the pages to the width of the iframe (never enlarges them). */
export function fitToWidth(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  const pages = doc?.querySelector<HTMLElement>(".pagedjs_pages");
  const first = doc?.querySelector<HTMLElement>(".pagedjs_page");
  if (!pages || !first) return;
  pages.style.setProperty("zoom", "1");
  const width = first.getBoundingClientRect().width;
  const available = iframe.clientWidth - GUTTER;
  if (width > 0 && available > 0) pages.style.setProperty("zoom", String(Math.min(1, available / width)));
}

export function createPreview(host: HTMLElement, options: PreviewOptions): Preview {
  const timeoutMs = options.timeoutMs ?? 30_000;
  let shown: HTMLIFrameElement | null = null;
  let latest = 0;
  let counter = 0;
  const pending = new Map<number, () => void>(); // render number -> cancel
  let destroyed = false;

  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => shown && fitToWidth(shown));
  resize?.observe(host);

  function render(input: PreviewInput): Promise<PreviewResult | null> {
    if (destroyed) return Promise.resolve(null);
    const mine = ++latest;
    for (const cancel of pending.values()) cancel();

    const id = `r${++counter}`;
    const iframe = document.createElement("iframe");
    iframe.className = "rosetta-preview-frame";
    iframe.title = "Preview";
    // Laid out at full size but not seen, so Paged.js measures the real page area.
    iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;visibility:hidden";

    return new Promise<PreviewResult | null>((resolve, reject) => {
      let finished = false;
      const finish = (action: () => void) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        pending.delete(mine);
        action();
      };
      const drop = () => finish(() => (iframe.remove(), resolve(null)));

      function onMessage(e: MessageEvent) {
        const data = e.data as { type?: string; id?: string; pages?: number; layoutMs?: number; error?: string } | null;
        if (!data || data.type !== MESSAGE_TYPE || data.id !== id || e.source !== iframe.contentWindow) return;
        if (data.error !== undefined) return finish(() => (iframe.remove(), reject(new Error(data.error))));
        finish(() => {
          if (mine !== latest || destroyed) {
            iframe.remove();
            return resolve(null);
          }
          const scroll = shown?.contentWindow?.scrollY ?? 0;
          fitToWidth(iframe);
          iframe.style.visibility = "visible";
          iframe.contentWindow?.scrollTo(0, scroll);
          shown?.remove();
          shown = iframe;
          resolve({ pages: data.pages ?? 0, layoutMs: data.layoutMs ?? 0 });
        });
      }

      const timer = setTimeout(() => finish(() => (iframe.remove(), reject(new Error(`the preview took more than ${timeoutMs} ms`)))), timeoutMs);
      pending.set(mine, drop);
      window.addEventListener("message", onMessage);
      iframe.srcdoc = buildDocument(input, { pagedUrl: options.pagedUrl, id, resolveImage: options.resolveImage });
      host.append(iframe);
    });
  }

  return {
    render,
    destroy() {
      destroyed = true;
      for (const cancel of [...pending.values()]) cancel();
      resize?.disconnect();
      shown?.remove();
      shown = null;
    },
  };
}
