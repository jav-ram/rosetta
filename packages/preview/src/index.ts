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
  /**
   * The book's page number of this chapter's first page (default 1). Page numbers count from it, and whether that page is a
   * left or a right page (even or odd) decides whether `startOn: "right-page"` needs a blank page first.
   */
  startPage?: number;
  /**
   * How the chapter starts. Every chapter starts on a new page (its own first page); `"right-page"` also makes it start on a
   * right-hand (odd) page, with a blank page before it when it would otherwise start on a left-hand one. Default `"next-page"`.
   */
  startOn?: "next-page" | "right-page";
}

/** An unbreakable component that is taller than a column, so it cannot fit on any page. */
export interface OversizedBlock {
  /** Position among all components in the chapter, in document order (the first component is 0). The editor has the same order. */
  index: number;
  /** The component's name, such as `statblock`. */
  name: string;
  /** How tall it is, and how tall a column is, in millimetres. */
  heightMm: number;
  columnMm: number;
}

/** Two or more pages of full art in a row whose first page is a right-hand page, so they do not face each other in print. */
export interface UnpairedSpread {
  /** The `page` component that makes the first of them, among all components in the chapter in document order (as for `OversizedBlock`). */
  index: number;
  /** Which page of the chapter the first of them is, counting from 1 (a blank page counts). */
  page: number;
  /** How many pages of art there are in the row. */
  count: number;
}

/** An image as it was placed on a page, for judging its resolution (the pixel size of the original is the app's to know). */
export interface PlacedImage {
  /** The image's `src` (or a page's `art`) as written in the chapter, before it was resolved to a file. */
  source: string;
  /** The component that shows it, among all components in the chapter in document order (as for `OversizedBlock`); null for a Markdown image. */
  index: number | null;
  /** Which page of the chapter it is on, counting from 1 (a blank page counts). */
  page: number;
  /** The size of the box it fills, in CSS pixels (96 to the inch). */
  widthPx: number;
  heightPx: number;
  /** The size of the image the preview loaded (it can be a smaller copy of the original; the shape is the original's, turned the right way up). */
  naturalWidth: number;
  naturalHeight: number;
}

export interface PreviewResult {
  pages: number;
  /** Time Paged.js took to lay out the pages. */
  layoutMs: number;
  /** Unbreakable components that do not fit in a column. */
  oversized: OversizedBlock[];
  /** Pages of art that were meant to be a spread (two in a row) but do not face each other. Empty when there are none. */
  spreads: UnpairedSpread[];
  /** Every image on the pages (not the spare page), as placed. */
  images: PlacedImage[];
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
/* A component that does not fit in a column: outlined, with a label. Only on screen; it does not change the layout. */
[data-layout-warning] { outline: 2px solid #c0392b; outline-offset: 2px; position: relative; }
[data-layout-warning]::before { content: "\\26A0  " attr(data-layout-warning); position: absolute; top: 0; right: 0; z-index: 10; max-width: 90%; padding: 2px 6px; background: #c0392b; color: #fff; font: 11px/1.3 system-ui, sans-serif; }
`;

/**
 * Chapter starts. A chapter is laid out alone, but its pages belong to a book: its first page is book page `startPage`.
 *
 * - Left and right: Paged.js decides whether a page is a left or a right page from its position in the document, as if the
 *   document began on page 1, a right page. When the chapter begins on an even (left) page, a zero-height element with
 *   `break-after: page` is put first, so the chapter's first page is the document's second page, a left one. That first
 *   page is not part of the chapter: it is hidden after layout, and not counted.
 * - `right-page`: the chapter's zero-height first element has `break-before: right`. Paged.js then inserts a blank page
 *   (`pagedjs_blank_page`, which the theme styles with `@page :blank`) when the chapter would start on a left page.
 * - A chapter that begins with a page of art that must be a left-hand page (`side="left"`) starts on a left-hand page whatever its
 *   own start rule says. Paged.js does not break before the very first page, so when the chapter would start on a right-hand
 *   page a zero-height element with `break-after: page` makes a blank first page of its own (`BLANK_PAGE_SCRIPT` gives it the
 *   class Paged.js gives its blank pages, so the theme's `@page :blank` applies). When the chapter starts on a left-hand page
 *   it already has the spare page above, and its first page is a left-hand one.
 * - Page numbers: see `PAGE_NUMBERS_SCRIPT`. The blank page, if there is one, shows no number but counts.
 *   (A `counter-reset: page N` on the first element does not work: Paged.js turns it into a reset on the first page alone,
 *   and the second page then shows the same number again.)
 */
const chapterStartCss = () => `
.rosetta-parity-page, .rosetta-blank-page { break-after: page; height: 0; margin: 0; padding: 0; }
.rosetta-chapter-start { height: 0; margin: 0; padding: 0; }
.rosetta-chapter-start.rosetta-start-right { break-before: right; }
`;

/**
 * Written after the theme's CSS: Paged.js applies break rules in the order it reads them, not by specificity, so a rule that
 * has to win over the theme's goes last. A page marker (the page component) that is first in the chapter is the chapter's first
 * page, not a page after it, so it has no break before it.
 */
const chapterStartLateCss = `
.rosetta-document > .rosetta-chapter-start + .rosetta-page { break-before: auto; }
`;

/** Whether the chapter's first page is a left-hand page: an even page number. */
const startsLeft = (input: PreviewInput) => firstPage(input) % 2 === 0;

/** Whether the chapter begins with a page of art that must be a left-hand page (`side="left"`), looking inside layouts' elements. */
function startsWithLeftArt(html: string): boolean {
  if (!html.includes("data-side=")) return false;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const first = [...doc.body.querySelectorAll("*")].find((e) => !e.firstElementChild);
  return !!first && first.classList.contains("rosetta-page") && first.getAttribute("data-side") === "left" && !!first.getAttribute("data-template");
}

/** The page number a chapter's first page has, as a whole number of at least 1. */
const firstPage = (input: PreviewInput) => (Number.isInteger(input.startPage) && input.startPage! >= 1 ? input.startPage! : 1);

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

/**
 * Art on a page (the `page` component). The marker is an empty element that starts a page; this hook looks at where each page
 * starts and, when that is a marker, gives the page what the marker says: the class `has-<template>` (the theme styles it: a
 * full-page band, no header, the page number over the art), and a band element holding the image (`data-art-src`, the address
 * `resolveImages` wrote) in the page box, behind the text. It knows no template names: the theme's CSS puts the band where it
 * goes and gives it a default height, and a `data-height` (a length or a percentage of the page) replaces that height. A band
 * that does not cover the page then pushes the page's margin on its side (top if it is at the top, otherwise bottom) to its own
 * height, so the text area is the rest of the page: Paged.js measures it after this hook runs. The margin is set through
 * `--pagedjs-margin-top` and `--pagedjs-margin-bottom`, which are Paged.js's own variables (pinned version; a test fails if a
 * band stops shrinking the text area).
 *
 * Where a page starts: pages after the first start at the break token's node (the marker, or what holds it). The first page
 * has no break token, so it starts at the first element of the content that is not a chapter-start spacer, and the spare
 * page that keeps left/right parity (see `chapterStartCss`) starts nothing. A page that begins at a chapter-start spacer (after a
 * blank page) starts at what follows it. Installed on the layout hooks; exported as source.
 */
export const PAGE_ART_SCRIPT = `function installPageArt(hooks) {
  function isSpare(el) { return el.classList.contains("rosetta-parity-page") || el.classList.contains("rosetta-blank-page"); }
  function isSpacer(el) { return el.classList.contains("rosetta-chapter-start") || isSpare(el); }
  function firstOf(content) {
    if (!content || !content.querySelectorAll) return null; // a blank page has no content
    var all = content.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (isSpare(el)) return null;
      if (isSpacer(el) || el.firstElementChild) continue;
      return el;
    }
    return null;
  }
  hooks.beforePageLayout.register(function (page, content, breakToken) {
    var start = breakToken && breakToken.node ? breakToken.node : firstOf(content);
    while (start && start.nodeType === 1 && start.classList.contains("rosetta-chapter-start") && start.nextElementSibling) start = start.nextElementSibling;
    while (start && start.nodeType === 1 && !start.classList.contains("rosetta-page") && start.firstElementChild) start = start.firstElementChild;
    if (!start || start.nodeType !== 1 || !start.classList.contains("rosetta-page")) return;
    var template = start.getAttribute("data-template");
    if (!template) return;
    page.element.classList.add("has-" + template);
    var band = document.createElement("div");
    band.className = "rosetta-art-band";
    var art = start.getAttribute("data-art-src");
    if (start.hasAttribute("data-block")) band.setAttribute("data-block", start.getAttribute("data-block"));
    if (art) {
      var img = document.createElement("img");
      img.alt = "";
      img.src = art;
      img.setAttribute("data-source", start.getAttribute("data-art") || "");
      band.appendChild(img);
    }
    var height = (start.getAttribute("data-height") || "").trim();
    if (/^\\d+(\\.\\d+)?(%|mm|cm|in|pt|px)$/.test(height)) band.style.height = height;
    page.pagebox.appendChild(band);
    // A band that does not cover the page takes its room from the text: the margin on its side grows to the band's height, which
    // Paged.js sees when it measures the page's text area just after this hook. A band that would leave no room is made shorter.
    var box = page.pagebox.getBoundingClientRect();
    var rect = band.getBoundingClientRect();
    if (rect.height > 0 && rect.height < box.height - 1) {
      var most = box.height * 0.8;
      if (rect.height > most) { band.style.height = most + "px"; rect = band.getBoundingClientRect(); }
      var side = rect.top - box.top < 1 ? "top" : "bottom";
      page.element.style.setProperty("--pagedjs-margin-" + side, rect.height + "px");
    }
  });
}`;

/**
 * After layout: finds the unbreakable components (`data-breakable="false"`) that are taller than a column. Paged.js moves an
 * unbreakable element to the next page when it does not fit, and only splits it, or lets it run off the page, when it would not
 * fit on an empty one. So a component is too tall if it was split, or if it is taller than the page's text area, which is as
 * tall as a column. Components are numbered in document order before layout (`data-block`), so the editor can find them.
 * Each one found is also marked on the page with `data-layout-warning` (outline and label; nothing moves).
 * Runs in the preview document, before the pages are scaled. Exported as source.
 */
export const OVERSIZED_SCRIPT = `function numberBlocks(doc) {
  doc.querySelectorAll("[data-component]").forEach(function (e, i) { e.setAttribute("data-block", String(i)); });
}
function findOversized(doc) {
  var MM = 25.4 / 96;
  var blocks = {};
  doc.querySelectorAll(".pagedjs_page").forEach(function (page) {
    var area = page.querySelector(".pagedjs_page_content");
    var limit = area ? area.getBoundingClientRect().height : 0;
    page.querySelectorAll('[data-block][data-breakable="false"]').forEach(function (el) {
      var index = Number(el.getAttribute("data-block"));
      var b = blocks[index] || (blocks[index] = { index: index, name: el.getAttribute("data-component") || "", height: 0, limit: limit, parts: 0, elements: [] });
      b.height += el.getBoundingClientRect().height;
      b.limit = Math.max(b.limit, limit);
      b.parts += 1;
      b.elements.push(el);
    });
  });
  var found = [];
  Object.keys(blocks).forEach(function (key) {
    var b = blocks[key];
    if (b.limit <= 0 || (b.parts < 2 && b.height <= b.limit + 1)) return;
    var message = 'A "' + b.name + '" is taller than a column (' + Math.round(b.height * MM) + " mm; a column is " + Math.round(b.limit * MM) + " mm)";
    b.elements.forEach(function (el) { el.setAttribute("data-layout-warning", message); });
    found.push({ index: b.index, name: b.name, heightMm: Math.round(b.height * MM), columnMm: Math.round(b.limit * MM) });
  });
  return found.sort(function (a, b) { return a.index - b.index; });
}`;

/**
 * After layout: marks each page whose columns can fill one after the other with the class `rosetta-filled`, which the theme
 * uses to turn off column balancing (`column-fill: auto` at the height of the page).
 *
 * Paged.js cannot lay out with `column-fill: auto`: it finds where a page is full by looking at the height of the column box,
 * and a box of fixed height never looks full (the overflow goes into extra columns beside the page, which it does not see).
 * So the pages are laid out with balanced columns, which is what Paged.js needs, and filled left to right afterwards. The same
 * content always fits: filling in order is never worse than balancing the same content. A page with an oversized component is
 * left balanced, because that component runs past the bottom of the page and fixed-height columns would split it.
 * Runs in the preview document, after `findOversized`. Exported as source.
 */
export const FILL_COLUMNS_SCRIPT = `function fillColumns(doc) {
  doc.querySelectorAll(".pagedjs_page").forEach(function (page) {
    if (!page.querySelector("[data-layout-warning]")) page.classList.add("rosetta-filled");
  });
}`;

/**
 * After layout: hides the page that only keeps the left/right parity (see `chapterStartCss`) and says how many pages the
 * chapter has without it. Runs in the preview document. Exported as source.
 */
export const PARITY_PAGE_SCRIPT = `function hideParityPage(doc) {
  var hidden = 0;
  doc.querySelectorAll(".pagedjs_page").forEach(function (page) {
    if (page.querySelector(".rosetta-parity-page")) { page.style.display = "none"; page.setAttribute("data-parity-page", ""); hidden += 1; }
  });
  return hidden;
}`;

/**
 * After layout: numbers the pages from `first`. Paged.js counts pages with a CSS counter that starts at 0 on `.pagedjs_pages`, so
 * the counter is started at `first - 1` there (the pages show the counter, and a hidden page does not count). Runs in the preview
 * document. Exported as source.
 */
export const PAGE_NUMBERS_SCRIPT = `function startPageNumbers(doc, first) {
  var pages = doc.querySelector(".pagedjs_pages");
  if (!pages) return;
  var current = doc.defaultView.getComputedStyle(pages).counterReset;
  var start = "page " + (first - 1);
  pages.style.counterReset = /(^|\\s)page\\s+-?\\d+/.test(current) ? current.replace(/(^|\\s)page\\s+-?\\d+/, "$1" + start) : (current === "none" ? "" : current + " ") + start;
}`;

/**
 * After layout: gives the chapter's own blank first page (see `chapterStartCss`) the class Paged.js gives the blank pages it
 * inserts, so the theme's `@page :blank` (no running header, no page number) applies to it as well. Exported as source.
 */
export const BLANK_PAGE_SCRIPT = `function markBlankPages(doc) {
  doc.querySelectorAll(".pagedjs_page").forEach(function (page) {
    if (page.querySelector(".rosetta-blank-page")) page.classList.add("pagedjs_blank_page");
  });
}`;

/**
 * After layout: finds pages of full art that are meant to be a spread. Two or more such pages in a row make a spread only if the
 * first is a left-hand page (so that the second, a right-hand page, faces it). A row that starts on a right-hand page is
 * reported once, at its first page: `side="left"` on that page makes the row start on a left-hand one. Left and right are
 * Paged.js's own classes, which follow the book because the chapter's spare page keeps them in step (see `chapterStartCss`).
 * The spare page itself is not a page of the chapter. Runs in the preview document, after the layout. Exported as source.
 */
export const SPREADS_SCRIPT = `function findUnpairedSpreads(doc) {
  var pages = [].slice.call(doc.querySelectorAll(".pagedjs_page")).filter(function (p) { return !p.querySelector(".rosetta-parity-page"); });
  var found = [];
  var i = 0;
  while (i < pages.length) {
    if (!pages[i].classList.contains("has-art-full")) { i += 1; continue; }
    var j = i;
    while (j + 1 < pages.length && pages[j + 1].classList.contains("has-art-full")) j += 1;
    var marker = pages[i].querySelector('[data-block][data-component="page"]');
    if (j > i && pages[i].classList.contains("pagedjs_right_page") && marker) found.push({ index: Number(marker.getAttribute("data-block")), page: i + 1, count: j - i + 1 });
    i = j + 1;
  }
  return found;
}`;

/**
 * After layout: lists every image on the pages with the size of the box it fills (see `PlacedImage`), so the app can say which are
 * too small for print. Images (and the art bands, which load after layout) are given a moment to load, because the shape of the
 * image says which way up it is. Resolves with the list. Runs in the preview document. Exported as source.
 */
export const PLACED_IMAGES_SCRIPT = `function findPlacedImages(doc, waitMs) {
  var imgs = [].slice.call(doc.querySelectorAll(".pagedjs_page img[data-source]"));
  var loaded = Promise.all(imgs.map(function (img) {
    return img.complete ? 0 : new Promise(function (done) { img.addEventListener("load", done); img.addEventListener("error", done); });
  }));
  var limit = new Promise(function (done) { setTimeout(done, waitMs); });
  return Promise.race([loaded, limit]).then(function () {
    var pages = [].slice.call(doc.querySelectorAll(".pagedjs_page")).filter(function (p) { return !p.querySelector(".rosetta-parity-page"); });
    var found = [];
    imgs.forEach(function (img) {
      var page = img.closest(".pagedjs_page");
      var at = pages.indexOf(page);
      var rect = img.getBoundingClientRect();
      if (at < 0 || !img.naturalWidth || rect.width <= 0 || rect.height <= 0) return;
      var owner = img.closest("[data-block]");
      found.push({
        source: img.getAttribute("data-source") || "",
        index: owner ? Number(owner.getAttribute("data-block")) : null,
        page: at + 1,
        widthPx: rect.width,
        heightPx: rect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
    });
    return found;
  });
}`;

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#d9d9d9"/></svg>');

const isLoadable = (src: string) => /^(https?:|data:|blob:)/i.test(src.trim());
export const defaultResolveImage = (src: string) => (isLoadable(src) ? src : PLACEHOLDER);

/** The URL to load for each image in the HTML (see `PreviewOptions.resolveImage`). The editor shows components the same way. */
export function resolveImages(html: string, resolve: (src: string) => string): string {
  if (!html.includes("<img") && !html.includes("data-art=")) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const source = img.getAttribute("src") ?? "";
    img.setAttribute("data-source", source); // what the chapter says, for the checks after layout
    img.setAttribute("src", resolve(source));
  }
  // The art of a `page` component is its `data-art`; the address to load goes next to it, which keeps the name for showing.
  for (const el of doc.querySelectorAll("[data-art]")) el.setAttribute("data-art-src", resolve(el.getAttribute("data-art") ?? ""));
  return doc.body.innerHTML;
}

/** The `src` of every image in the HTML, and the `data-art` of every page's art, as written (in the order they appear, repeats included). */
export function imageSources(html: string): string[] {
  if (!html.includes("<img") && !html.includes("data-art=")) return [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return [...doc.querySelectorAll("img, [data-art]")].map((el) => (el.nodeName === "IMG" ? el.getAttribute("src") : el.getAttribute("data-art")) ?? "");
}

/** The text of a `<style>` or `<script>` cannot contain a closing tag. */
const safeInStyle = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

/** The document that goes in the iframe. Paged.js runs when it has loaded. */
export function buildDocument(input: PreviewInput, options: { pagedUrl: string; id: string; resolveImage?: (src: string) => string }): string {
  const html = resolveImages(input.html, options.resolveImage ?? defaultResolveImage);
  const id = JSON.stringify(options.id);
  const leftArt = startsWithLeftArt(input.html);
  const spare = startsLeft(input) ? '<div class="rosetta-parity-page"></div>' : leftArt ? '<div class="rosetta-blank-page"></div>' : "";
  const right = input.startOn === "right-page" && !leftArt;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${SCREEN_CSS}${chapterStartCss()}</style>
<style>${safeInStyle(input.css)}</style>
<style>${chapterStartLateCss}</style>
<script>${SCHEDULER}</script>
<script>window.PagedConfig = { auto: false };</script>
<script src="${options.pagedUrl.replace(/"/g, "&quot;")}"></script>
</head>
<body>
<div class="rosetta-document">${spare}<div class="rosetta-chapter-start${right ? " rosetta-start-right" : ""}"></div>${html}</div>
<script>
(function () {
  var id = ${id};
  function send(message) { message.type = ${JSON.stringify(MESSAGE_TYPE)}; message.id = id; parent.postMessage(message, "*"); }
  if (!window.PagedPolyfill) { send({ error: "Paged.js did not load" }); return; }
  ${OVERSIZED_SCRIPT}
  ${TABLE_HEADER_SCRIPT}
  ${PAGE_ART_SCRIPT}
  ${FILL_COLUMNS_SCRIPT}
  ${PARITY_PAGE_SCRIPT}
  ${PAGE_NUMBERS_SCRIPT}
  ${BLANK_PAGE_SCRIPT}
  ${SPREADS_SCRIPT}
  ${PLACED_IMAGES_SCRIPT}
  try { installTableHeaderRepeat(window.PagedPolyfill.chunker.hooks); } catch (e) { /* the pages are laid out without repeated headers */ }
  try { installPageArt(window.PagedPolyfill.chunker.hooks); } catch (e) { /* the pages are laid out without art */ }
  numberBlocks(document);
  var start = performance.now();
  window.PagedPolyfill.preview().then(
    function (flow) {
      var layoutMs = performance.now() - start;
      var oversized = [];
      try { oversized = findOversized(document); } catch (e) { /* the pages are shown without the check */ }
      try { fillColumns(document); } catch (e) { /* the columns stay balanced */ }
      var parity = 0;
      try { parity = hideParityPage(document); } catch (e) { /* the page stays */ }
      try { markBlankPages(document); } catch (e) { /* the page shows its header */ }
      try { startPageNumbers(document, ${firstPage(input)}); } catch (e) { /* the pages are numbered from 1 */ }
      var spreads = [];
      try { spreads = findUnpairedSpreads(document); } catch (e) { /* the pages are shown without the check */ }
      var report = function (images) { send({ pages: flow.total - parity, layoutMs: layoutMs, oversized: oversized, spreads: spreads, images: images }); };
      var found = null;
      try { found = findPlacedImages(document, 3000); } catch (e) { /* the pages are shown without the check */ }
      if (found) found.then(report, function () { report([]); }); else report([]);
    },
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
        const data = e.data as { type?: string; id?: string; pages?: number; layoutMs?: number; oversized?: OversizedBlock[]; spreads?: UnpairedSpread[]; images?: PlacedImage[]; error?: string } | null;
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
          resolve({ pages: data.pages ?? 0, layoutMs: data.layoutMs ?? 0, oversized: data.oversized ?? [], spreads: data.spreads ?? [], images: data.images ?? [] });
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

// ---------------------------------------------------------------------------------------------------------------------------
// The whole book, for printing.
//
// The preview lays a chapter out alone and works out where it sits in the book (`startPage`, a spare page to keep left and right
// in step). Printing needs one document for the whole book, and then Paged.js does all of that itself: chapters follow each other,
// pages are numbered from 1, and left and right are the real ones. What is left for the book is where each chapter starts.

/** A chapter of the book: the parser's HTML, and how it starts. */
export interface BookChapter {
  html: string;
  /** `right-page` starts the chapter on a right-hand page, with a blank page before it when needed. Default `next-page`. */
  startOn?: "next-page" | "right-page";
}

/** The front cover: the first page of the book. */
export interface BookCover {
  /** The title, printed over the cover. */
  title: string;
  /** The picture that fills the cover, as a chapter would name an image (a file name or an id). Without one the cover is a plain color. */
  art?: string;
}

export interface BookInput {
  /** The front cover, as the first page of the book, followed by a blank page so that the first chapter starts on page 1, a right-hand page, as in print. */
  cover?: BookCover;
  chapters: BookChapter[];
  /** The theme's CSS, with `@page` variables already written in. */
  css: string;
}

export interface BookResult {
  /** Pages in the book, a blank page counted. */
  pages: number;
  /** Time Paged.js took to lay out the pages. */
  layoutMs: number;
  /** Unbreakable components that do not fit in a column (they print as they are). */
  oversized: OversizedBlock[];
}

export interface BookRenderOptions {
  /** Gives the URL to load for an image in the book (the original, not a preview copy); undefined for one it does not know, which is then handled as the preview does by default. */
  resolveImage?: (src: string) => string | undefined;
  /** Called while the pages are being laid out, with how many there are so far. */
  onPage?: (pages: number) => void;
  /** Called once the layout is done, while the images are loading, with how many images are loaded of how many. */
  onImages?: (loaded: number, total: number) => void;
  /** Stops the layout: the promise rejects. */
  signal?: AbortSignal;
}

export interface BookLayout {
  /** Lays the whole book out in a frame that is not seen. Resolves when the pages are ready and every image has loaded. */
  render(input: BookInput, options?: BookRenderOptions): Promise<BookResult>;
  /** Opens the print dialog for the book that was laid out. Resolves when the dialog is closed (printed or not). */
  print(): Promise<void>;
  /** Removes the frame. */
  destroy(): void;
}

export interface BookLayoutOptions {
  /** URL of Paged.js's `paged.polyfill.js`. */
  pagedUrl: string;
  /** Milliseconds before the layout is given up (default 15 minutes: a book of hundreds of pages takes a while). */
  timeoutMs?: number;
  /** Milliseconds to wait for the images once the pages are laid out (default 2 minutes). */
  imageTimeoutMs?: number;
}

/**
 * Where each chapter starts, in the one document. Every chapter starts on a new page (`break-before: page`; none for the very first,
 * which is on page 1). `right-page` and a first page of art with `side="left"` ask for a right or a left page, and Paged.js inserts
 * a blank page when the chapter would otherwise start on the other side. A blank page that Paged.js cannot make (before the very
 * first page) is made by the chapter's own `rosetta-blank-page`, as in the preview.
 *
 * A cover is two pages before the book: the cover, and a blank page behind it, so that the first chapter is the third page, a
 * right-hand page, and the pages keep the sides they have in the editor's preview (chapter 1 starts on a right-hand page 1). The
 * pages of the book are numbered from the first chapter, so the cover and its blank page have no number and are not counted:
 * `startPageNumbers` starts the counter two pages early, and the table of contents subtracts them. The cover is a page of art for
 * the art hook (the template `cover`: the picture fills the page, the theme styles the rest).
 */
const bookCss = `
.rosetta-chapter-start { height: 0; margin: 0; padding: 0; break-before: page; }
.rosetta-chapter-start.rosetta-start-first { break-before: auto; }
.rosetta-chapter-start.rosetta-start-right { break-before: right; }
.rosetta-chapter-start.rosetta-start-left { break-before: left; }
.rosetta-blank-page { break-after: page; height: 0; margin: 0; padding: 0; }
.rosetta-cover { break-after: page; }
.rosetta-cover .rosetta-page { height: 0; margin: 0; padding: 0; border: none; overflow: hidden; }
/* What is on the screen is on the paper: the dialog's "background graphics" setting does not turn off the boxes and art. */
html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/**
 * After layout: waits for every image on the pages to load, so that none is missing from the paper. `report(loaded, total)` is
 * called as they come in. Resolves with the number of images that did not load. Runs in the book document. Exported as source.
 */
/**
 * After layout: gives each entry of a table of contents the number of the page its heading is on (`data-page`, which the theme
 * shows). Read from the laid-out pages once, not asked of Paged.js's `target-counter`, which looks every entry up on every page
 * (its cost grows with entries times pages: 1.8 times the whole layout time at 188 entries over 209 pages). The number is the page's
 * own (Paged.js numbers pages from 1, a blank page counted), which is what the page shows; `before` is how many pages at the start
 * are not counted (a cover and the blank page behind it). Returns how many entries were filled. Runs in the book document. Exported as source.
 */
export const FILL_CONTENTS_SCRIPT = `function fillContents(doc, before) {
  var pageOf = {};
  doc.querySelectorAll(".pagedjs_page").forEach(function (page) {
    var number = String(Number(page.getAttribute("data-page-number")) - (before || 0));
    page.querySelectorAll('[id^="rosetta-h"]').forEach(function (heading) { if (!pageOf[heading.id]) pageOf[heading.id] = number; });
  });
  var filled = 0;
  doc.querySelectorAll(".rosetta-contents a").forEach(function (link) {
    var number = pageOf[(link.getAttribute("href") || "").slice(1)];
    if (number) { link.setAttribute("data-page", number); filled += 1; }
  });
  return filled;
}`;

export const WAIT_FOR_IMAGES_SCRIPT = `function waitForImages(doc, waitMs, report) {
  var imgs = [].slice.call(doc.querySelectorAll("img"));
  var loaded = 0;
  var failed = 0;
  report(0, imgs.length);
  var each = imgs.map(function (img) {
    if (img.complete) { loaded += 1; if (!img.naturalWidth) failed += 1; return 0; }
    return new Promise(function (done) {
      function finish(ok) { loaded += 1; if (!ok) failed += 1; report(loaded, imgs.length); done(); }
      img.addEventListener("load", function () { finish(true); });
      img.addEventListener("error", function () { finish(false); });
    });
  });
  report(loaded, imgs.length);
  var limit = new Promise(function (done) { setTimeout(done, waitMs); });
  return Promise.race([Promise.all(each), limit]).then(function () { return failed + (imgs.length - loaded); });
}`;

/** One line of the table of contents: a heading of the book. */
export interface ContentsEntry {
  /** 1 for a `#` heading, 2 for `##`, 3 for `###`. */
  level: number;
  text: string;
  /** The id given to the heading, so that the entry can link to it and ask for its page. */
  id: string;
}

/**
 * Makes the tables of contents of a book. Every heading of the chapters (`#` to `###`, not those inside a component such as a
 * sidebar) gets an id; each `toc` component (`::toc`, an empty marker in the parser's HTML) is then replaced by the list of the
 * headings it asks for (`depth`, default 2) under its `title` (default "Contents"). Each entry is a link to its heading; the theme
 * shows the page of that heading with `target-counter`, which Paged.js works out once the pages are laid out. Returns the chapters'
 * HTML, changed only when the book has a `toc`.
 */
export function addContents(chapters: readonly string[]): { html: string[]; entries: ContentsEntry[] } {
  if (!chapters.some((html) => html.includes('data-component="toc"'))) return { html: [...chapters], entries: [] };
  const docs = chapters.map((html) => new DOMParser().parseFromString(`<body>${html}</body>`, "text/html"));
  const entries: ContentsEntry[] = [];
  for (const doc of docs) {
    for (const heading of doc.querySelectorAll("h1, h2, h3")) {
      const owner = heading.closest("[data-component]");
      if (owner && owner.getAttribute("data-component") !== "layout") continue; // a sidebar's title is not a section of the book
      const text = (heading.textContent ?? "").trim();
      if (!text) continue;
      const id = `rosetta-h${entries.length}`;
      heading.setAttribute("id", id);
      entries.push({ level: Number(heading.tagName[1]), text, id });
    }
  }
  for (const doc of docs) {
    for (const marker of doc.querySelectorAll('[data-component="toc"]')) {
      const asked = Number(marker.getAttribute("data-depth"));
      const depth = asked === 1 || asked === 2 || asked === 3 ? asked : 2;
      const nav = doc.createElement("nav");
      nav.className = "rosetta-contents";
      nav.setAttribute("data-component", "toc");
      nav.setAttribute("data-kind", "leaf");
      const title = doc.createElement("h2");
      title.className = "rosetta-contents-title";
      title.textContent = marker.getAttribute("data-title")?.trim() || "Contents";
      const list = doc.createElement("ol");
      for (const entry of entries.filter((e) => e.level <= depth)) {
        const item = doc.createElement("li");
        item.setAttribute("data-level", String(entry.level));
        const link = doc.createElement("a");
        link.setAttribute("href", `#${entry.id}`);
        const text = doc.createElement("span");
        text.className = "rosetta-contents-text";
        text.textContent = entry.text;
        const dots = doc.createElement("span");
        dots.className = "rosetta-contents-dots";
        link.append(text, dots);
        item.append(link);
        list.append(item);
      }
      nav.append(title, list);
      marker.replaceWith(nav);
    }
  }
  return { html: docs.map((doc) => doc.body.innerHTML), entries };
}

/** The cover page and the blank page behind it. */
function coverHtml(cover: BookCover, resolve: (src: string) => string): string {
  const art = cover.art ? ` data-art="${escapeAttribute(cover.art)}"` : "";
  const marker = `<div class="rosetta-page" data-component="page" data-kind="leaf" data-template="cover"${art}></div>`;
  const title = `<div class="rosetta-cover-title">${escapeText(cover.title)}</div>`;
  // `resolveImages` finds the picture the same way it finds a page's art.
  return `${resolveImages(`<div class="rosetta-cover">${marker}${title}</div>`, resolve)}<div class="rosetta-blank-page"></div>`;
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, "&quot;");

/** The document that holds the whole book. Paged.js runs when it has loaded. */
export function buildBookDocument(input: BookInput, options: { pagedUrl: string; id: string; resolveImage?: (src: string) => string | undefined; imageTimeoutMs?: number }): string {
  const resolve = (src: string) => options.resolveImage?.(src) ?? defaultResolveImage(src);
  const id = JSON.stringify(options.id);
  const first = input.chapters[0];
  const cover = input.cover;
  // With a cover, the first chapter does not start the document, so Paged.js can break before it like any other chapter.
  const blank = !cover && first && startsWithLeftArt(first.html) ? '<div class="rosetta-blank-page"></div>' : "";
  const withContents = addContents(input.chapters.map((c) => c.html)).html;
  const body = input.chapters
    .map((chapter, i) => {
      const left = startsWithLeftArt(chapter.html);
      const classes = ["rosetta-chapter-start", i === 0 && !cover ? "rosetta-start-first" : "", left ? "rosetta-start-left" : chapter.startOn === "right-page" ? "rosetta-start-right" : ""].filter(Boolean).join(" ");
      return `<div class="${classes}"></div>${resolveImages(withContents[i]!, resolve)}`;
    })
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${bookCss}</style>
<style>${safeInStyle(input.css)}</style>
<style>${chapterStartLateCss}</style>
<script>${SCHEDULER}</script>
<script>window.PagedConfig = { auto: false };</script>
<script src="${options.pagedUrl.replace(/"/g, "&quot;")}"></script>
</head>
<body>
<div class="rosetta-document">${cover ? coverHtml(cover, resolve) : ""}${blank}${body}</div>
<script>
(function () {
  var id = ${id};
  function send(message) { message.type = ${JSON.stringify(BOOK_MESSAGE_TYPE)}; message.id = id; parent.postMessage(message, "*"); }
  if (!window.PagedPolyfill) { send({ error: "Paged.js did not load" }); return; }
  ${OVERSIZED_SCRIPT}
  ${TABLE_HEADER_SCRIPT}
  ${PAGE_ART_SCRIPT}
  ${FILL_COLUMNS_SCRIPT}
  ${BLANK_PAGE_SCRIPT}
  ${FILL_CONTENTS_SCRIPT}
  ${PAGE_NUMBERS_SCRIPT}
  ${WAIT_FOR_IMAGES_SCRIPT}
  var hooks = window.PagedPolyfill.chunker.hooks;
  try { installTableHeaderRepeat(hooks); } catch (e) { /* laid out without repeated headers */ }
  try { installPageArt(hooks); } catch (e) { /* laid out without art */ }
  var pages = 0;
  hooks.afterPageLayout.register(function () { pages += 1; if (pages % 5 === 0) send({ progress: pages }); });
  numberBlocks(document);
  var start = performance.now();
  window.PagedPolyfill.preview().then(
    function (flow) {
      var layoutMs = performance.now() - start;
      var oversized = [];
      try { oversized = findOversized(document); } catch (e) { /* no check */ }
      try { fillColumns(document); } catch (e) { /* the columns stay balanced */ }
      try { markBlankPages(document); } catch (e) { /* the blank page shows its header */ }
${cover ? "      try { startPageNumbers(document, -1); } catch (e) { /* the cover would be numbered */ }\n" : ""}      try { fillContents(document, ${cover ? 2 : 0}); } catch (e) { /* the contents show no page numbers */ }
      send({ progress: flow.total });
      waitForImages(document, ${options.imageTimeoutMs ?? 120_000}, function (loaded, total) { send({ images: { loaded: loaded, total: total } }); }).then(
        function (missing) { send({ done: true, pages: flow.total, layoutMs: layoutMs, oversized: oversized, missingImages: missing }); },
        function (e) { send({ error: String((e && e.message) || e) }); }
      );
    },
    function (e) { send({ error: String((e && e.message) || e) }); }
  );
})();
</script>
</body>
</html>`;
}

export const BOOK_MESSAGE_TYPE = "rosetta-book";

/** The book's layout, in a frame that is not seen, and printing it. */
export function createBookLayout(host: HTMLElement, options: BookLayoutOptions): BookLayout {
  let frame: HTMLIFrameElement | null = null;
  let counter = 0;
  let cancelRender: (() => void) | null = null;

  const remove = () => {
    cancelRender?.();
    frame?.remove();
    frame = null;
  };

  function render(input: BookInput, renderOptions: BookRenderOptions = {}): Promise<BookResult> {
    remove();
    const id = `book${++counter}`;
    const iframe = document.createElement("iframe");
    iframe.className = "rosetta-book-frame";
    iframe.title = "Book";
    // Laid out at full size, away from the screen, so that Paged.js measures the real page area and the browser can print it. Not
    // `display: none` or `visibility: hidden`: a frame that is hidden that way can print as blank pages in some browsers.
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;height:900px;border:0";
    frame = iframe;

    return new Promise<BookResult>((resolve, reject) => {
      let finished = false;
      const finish = (action: () => void) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        renderOptions.signal?.removeEventListener("abort", onAbort);
        cancelRender = null;
        action();
      };
      const fail = (error: Error) => finish(() => (iframe.remove(), frame === iframe && (frame = null), reject(error)));
      const onAbort = () => fail(new DOMException("The export was cancelled", "AbortError"));

      function onMessage(e: MessageEvent) {
        const data = e.data as { type?: string; id?: string; error?: string; progress?: number; images?: { loaded: number; total: number }; done?: boolean; pages?: number; layoutMs?: number; oversized?: OversizedBlock[]; missingImages?: number } | null;
        if (!data || data.type !== BOOK_MESSAGE_TYPE || data.id !== id || e.source !== iframe.contentWindow) return;
        if (data.error !== undefined) return fail(new Error(data.error));
        if (data.progress !== undefined) renderOptions.onPage?.(data.progress);
        if (data.images) renderOptions.onImages?.(data.images.loaded, data.images.total);
        if (data.done) {
          if (data.missingImages) return fail(new Error(`${data.missingImages} image${data.missingImages === 1 ? "" : "s"} could not be loaded, so the book would print with gaps`));
          finish(() => resolve({ pages: data.pages ?? 0, layoutMs: data.layoutMs ?? 0, oversized: data.oversized ?? [] }));
        }
      }

      const timer = setTimeout(() => fail(new Error(`laying out the book took more than ${Math.round((options.timeoutMs ?? 900_000) / 60_000)} minutes`)), options.timeoutMs ?? 900_000);
      cancelRender = () => finish(() => (iframe.remove(), reject(new DOMException("The export was cancelled", "AbortError"))));
      if (renderOptions.signal?.aborted) return onAbort();
      renderOptions.signal?.addEventListener("abort", onAbort);
      window.addEventListener("message", onMessage);
      iframe.srcdoc = buildBookDocument(input, { pagedUrl: options.pagedUrl, id, resolveImage: renderOptions.resolveImage, imageTimeoutMs: options.imageTimeoutMs });
      host.append(iframe);
    });
  }

  function print(): Promise<void> {
    const win = frame?.contentWindow;
    if (!win) return Promise.reject(new Error("There is no book to print: lay it out first"));
    return new Promise<void>((resolve) => {
      win.addEventListener("afterprint", () => resolve(), { once: true });
      win.focus();
      win.print(); // Chrome waits here until the dialog is closed; the event says it was
    });
  }

  return { render, print, destroy: remove };
}
