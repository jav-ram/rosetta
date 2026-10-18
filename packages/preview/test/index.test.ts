// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addContents, BLANK_PAGE_SCRIPT, FILL_CONTENTS_SCRIPT, BOOK_MESSAGE_TYPE, buildBookDocument, buildDocument, createBookLayout, WAIT_FOR_IMAGES_SCRIPT, createPreview, defaultResolveImage, imageSources, PAGE_ART_SCRIPT, PAGE_NUMBERS_SCRIPT, PLACED_IMAGES_SCRIPT, SPREADS_SCRIPT, resolveImages, FILL_COLUMNS_SCRIPT, MESSAGE_TYPE, OVERSIZED_SCRIPT, PARITY_PAGE_SCRIPT, TABLE_HEADER_SCRIPT } from "../src/index";

const pagedUrl = "/paged.polyfill.js";
// jsdom has no layout; scrolling does nothing there.
Window.prototype.scrollTo = () => {};
const input = { html: "<h1>Title</h1><p>Text</p>", css: ".rosetta-document { color: red; }" };

describe("buildDocument", () => {
  const build = (i = input, extra = {}) => buildDocument(i, { pagedUrl, id: "r1", ...extra });

  test("has the HTML inside .rosetta-document, the CSS, and Paged.js", () => {
    const doc = build();
    expect(doc).toContain('<div class="rosetta-document"><div class="rosetta-chapter-start"></div><h1>Title</h1><p>Text</p></div>');
    expect(doc).toContain(".rosetta-document { color: red; }");
    expect(doc).toContain('<script src="/paged.polyfill.js"></script>');
    expect(doc).toContain("window.PagedConfig = { auto: false }");
  });

  test("frames and idle callbacks are replaced before Paged.js loads", () => {
    const doc = build();
    expect(doc.indexOf("window.requestAnimationFrame =")).toBeGreaterThan(-1);
    expect(doc.indexOf("window.requestIdleCallback =")).toBeGreaterThan(-1);
    expect(doc.indexOf("window.requestAnimationFrame =")).toBeLessThan(doc.indexOf('<script src="/paged.polyfill.js">'));
  });

  test("Paged.js is started by the document itself and reports with the render id", () => {
    const doc = build();
    expect(doc).toContain('var id = "r1"');
    expect(doc).toContain("PagedPolyfill.preview()");
    expect(doc).toContain(MESSAGE_TYPE);
  });

  test("CSS cannot close the style tag", () => {
    const doc = build({ html: "", css: "a{} </style><script>alert(1)</script>" });
    expect(doc).not.toContain("</style><script>alert");
  });

  test("images that are not absolute become a placeholder, others are kept", () => {
    const doc = build({ html: '<img src="assets/a.png" alt="A"><img src="https://x.test/b.png"><img src="data:image/png;base64,AAA">', css: "" });
    expect(doc).not.toContain('src="assets/a.png"'); // loaded as a placeholder; the name stays as data-source for the checks after layout
    expect(doc).toContain('data-source="assets/a.png"');
    expect(doc).toContain('alt="A"');
    expect(doc).toContain("https://x.test/b.png");
    expect(doc).toContain("data:image/png;base64,AAA");
    expect(defaultResolveImage("assets/a.png")).toMatch(/^data:image\/svg/);
  });

  test("a resolver can supply the URL", () => {
    const doc = build({ html: '<img src="assets/a.png">', css: "" }, { resolveImage: (s: string) => `blob:${s}` });
    expect(doc).toContain("blob:assets/a.png");
  });

  test("HTML without images is not reparsed", () => {
    expect(build({ html: "<p>a &amp; b</p>", css: "" })).toContain("<p>a &amp; b</p>");
  });
});

describe("createPreview", () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  const frames = () => [...host.querySelectorAll("iframe")];
  /** What the document in the iframe would send when Paged.js is done. */
  const reply = (iframe: HTMLIFrameElement, data: object) => {
    const id = /var id = "(r\d+)"/.exec(iframe.srcdoc)![1];
    window.dispatchEvent(new MessageEvent("message", { data: { type: MESSAGE_TYPE, id, ...data }, source: iframe.contentWindow }));
  };

  test("a render adds a hidden iframe, and shows it when the pages are done", async () => {
    const preview = createPreview(host, { pagedUrl });
    const done = preview.render(input);
    const [frame] = frames();
    expect(frame!.style.visibility).toBe("hidden");
    expect(frame!.srcdoc).toContain("<h1>Title</h1>");
    reply(frame!, { pages: 12, layoutMs: 140 });
    expect(await done).toEqual({ pages: 12, layoutMs: 140, oversized: [], spreads: [], images: [] });
    expect(frame!.style.visibility).toBe("visible");
  });

  test("the old pages stay until the new ones are ready, then are replaced", async () => {
    const preview = createPreview(host, { pagedUrl });
    const first = preview.render(input);
    reply(frames()[0]!, { pages: 1, layoutMs: 1 });
    await first;
    const second = preview.render({ ...input, html: "<p>Changed</p>" });
    expect(frames()).toHaveLength(2);
    expect(frames()[0]!.style.visibility).toBe("visible");
    expect(frames()[1]!.style.visibility).toBe("hidden");
    reply(frames()[1]!, { pages: 2, layoutMs: 1 });
    await second;
    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.srcdoc).toContain("Changed");
  });

  test("a render overtaken by a newer one resolves null and its iframe is removed", async () => {
    const preview = createPreview(host, { pagedUrl });
    const slow = preview.render({ ...input, html: "<p>old</p>" });
    const fast = preview.render({ ...input, html: "<p>new</p>" });
    expect(await slow).toBeNull();
    expect(frames()).toHaveLength(1);
    reply(frames()[0]!, { pages: 3, layoutMs: 5 });
    expect(await fast).toEqual({ pages: 3, layoutMs: 5, oversized: [], spreads: [], images: [] });
    expect(frames()[0]!.srcdoc).toContain("new");
  });

  test("messages from other renders or other windows are ignored", async () => {
    const preview = createPreview(host, { pagedUrl });
    const done = preview.render(input);
    const [frame] = frames();
    window.dispatchEvent(new MessageEvent("message", { data: { type: MESSAGE_TYPE, id: "r999", pages: 9, layoutMs: 1 }, source: frame!.contentWindow }));
    window.dispatchEvent(new MessageEvent("message", { data: { type: MESSAGE_TYPE, id: "r1", pages: 9, layoutMs: 1 }, source: window }));
    expect(frame!.style.visibility).toBe("hidden");
    reply(frame!, { pages: 4, layoutMs: 2 });
    expect((await done)?.pages).toBe(4);
  });

  test("a failure in Paged.js rejects, and the previous pages are kept", async () => {
    const preview = createPreview(host, { pagedUrl });
    const ok = preview.render(input);
    reply(frames()[0]!, { pages: 1, layoutMs: 1 });
    await ok;
    const bad = preview.render(input);
    const rejected = expect(bad).rejects.toThrow("Paged.js did not load");
    reply(frames()[1]!, { error: "Paged.js did not load" });
    await rejected;
    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.style.visibility).toBe("visible");
  });

  test("a render that takes too long is rejected", async () => {
    vi.useFakeTimers();
    const preview = createPreview(host, { pagedUrl, timeoutMs: 1000 });
    const slow = preview.render(input);
    const rejected = expect(slow).rejects.toThrow(/more than 1000 ms/);
    await vi.advanceTimersByTimeAsync(1001);
    await rejected;
    expect(frames()).toHaveLength(0);
  });

  test("destroy removes everything and later renders do nothing", async () => {
    const preview = createPreview(host, { pagedUrl });
    const pending = preview.render(input);
    preview.destroy();
    expect(await pending).toBeNull();
    expect(frames()).toHaveLength(0);
    expect(await preview.render(input)).toBeNull();
    expect(frames()).toHaveLength(0);
  });
});

describe("repeated table headers", () => {
  type Fn = (clone: Element, source: Element) => void;
  /** Runs the script with fake Paged.js hooks, and gives back what it registered. */
  function install() {
    const hooks: Record<string, Fn[]> = { onPageLayout: [], renderNode: [] };
    const fake = (name: string) => ({ register: (fn: Fn) => hooks[name]!.push(fn) });
    const run = new Function(`${TABLE_HEADER_SCRIPT}; return installTableHeaderRepeat;`)() as (h: object) => void;
    run({ onPageLayout: fake("onPageLayout"), renderNode: fake("renderNode") });
    return { newPage: () => hooks.onPageLayout!.forEach((f) => f(document.body, document.body)), render: (c: Element, s: Element) => hooks.renderNode!.forEach((f) => f(c, s)) };
  }

  /** The source table, and the pieces Paged.js builds for a page that starts at a given row: an empty table and tbody around a clone of the row. */
  function tables() {
    const source = document.createElement("div");
    source.innerHTML = `<table><thead><tr data-ref="h"><th data-ref="th">Name</th></tr></thead><tbody><tr data-ref="r1"><td>1</td></tr><tr data-ref="r2"><td>2</td></tr></tbody></table>`;
    const rows = [...source.querySelectorAll("tbody tr")];
    const page = document.createElement("div");
    page.innerHTML = "<table><tbody></tbody></table>";
    return { source, rows, page, tbody: page.querySelector("tbody")! };
  }

  test("the script is part of the preview document, before Paged.js starts", () => {
    const doc = buildDocument(input, { pagedUrl, id: "r1" });
    expect(doc).toContain("installTableHeaderRepeat(window.PagedPolyfill.chunker.hooks)");
    expect(doc.indexOf("function installTableHeaderRepeat")).toBeLessThan(doc.indexOf("PagedPolyfill.preview()"));
  });

  test("a page that starts in the middle of a table gets a copy of the header", () => {
    const { rows, page, tbody } = tables();
    const hooks = install();
    hooks.newPage();
    const clone = rows[1]!.cloneNode(true) as Element;
    tbody.append(clone);
    hooks.render(clone, rows[1]!);
    const head = page.querySelector("thead");
    expect(head).not.toBeNull();
    expect(head!.hasAttribute("data-repeated-header")).toBe(true);
    expect(head!.textContent).toBe("Name");
    expect(page.querySelector("table")!.firstElementChild).toBe(head);
    expect(head!.querySelector("[data-ref]")).toBeNull();
  });

  test("only the first node of a page is looked at", () => {
    const { rows, page, tbody } = tables();
    const hooks = install();
    hooks.newPage();
    const first = rows[0]!.cloneNode(true) as Element;
    tbody.append(first);
    hooks.render(first, rows[0]!); // not a continuation of anything: the header is added, as the table has none here
    page.querySelector("thead")?.remove();
    const second = rows[1]!.cloneNode(true) as Element;
    tbody.append(second);
    hooks.render(second, rows[1]!);
    expect(page.querySelector("thead")).toBeNull();
  });

  test("a table that already has its header is left alone, and so are other nodes", () => {
    const { source, rows, page, tbody } = tables();
    const hooks = install();
    hooks.newPage();
    page.querySelector("table")!.prepend(source.querySelector("thead")!.cloneNode(true));
    const clone = rows[1]!.cloneNode(true) as Element;
    tbody.append(clone);
    hooks.render(clone, rows[1]!);
    expect(page.querySelectorAll("thead")).toHaveLength(1);

    const p = document.createElement("p");
    hooks.newPage();
    hooks.render(p.cloneNode() as Element, p);
    expect(page.querySelectorAll("thead")).toHaveLength(1);
  });
});

describe("oversized components", () => {
  const load = () => new Function(`${OVERSIZED_SCRIPT}; return { numberBlocks, findOversized };`)() as {
    numberBlocks: (doc: Document) => void;
    findOversized: (doc: Document) => { index: number; name: string; heightMm: number; columnMm: number }[];
  };
  const mm = (px: number) => Math.round((px * 25.4) / 96);

  /** Pages with `areaPx` of text area; each part is a component fragment `[index, name, breakable, heightPx]`. jsdom has no layout, so the heights are given. */
  function pages(areaPx: number, parts: [number, string, boolean, number][][]) {
    const doc = document.implementation.createHTMLDocument("t");
    for (const page of parts) {
      const p = doc.createElement("div");
      p.className = "pagedjs_page";
      const area = doc.createElement("div");
      area.className = "pagedjs_page_content";
      area.getBoundingClientRect = () => ({ height: areaPx }) as DOMRect;
      p.append(area);
      for (const [index, name, breakable, height] of page) {
        const el = doc.createElement("div");
        el.setAttribute("data-block", String(index));
        el.setAttribute("data-component", name);
        el.setAttribute("data-breakable", String(breakable));
        el.getBoundingClientRect = () => ({ height }) as DOMRect;
        area.append(el);
      }
      doc.body.append(p);
    }
    return doc;
  }

  test("components are numbered in document order, nested ones after their parent", () => {
    const doc = document.implementation.createHTMLDocument("t");
    doc.body.innerHTML = '<div data-component="a"><p>x</p><div data-component="b"></div></div><div data-component="c"></div>';
    load().numberBlocks(doc);
    expect([...doc.querySelectorAll("[data-component]")].map((e) => `${e.getAttribute("data-component")}${e.getAttribute("data-block")}`)).toEqual(["a0", "b1", "c2"]);
  });

  test("an unbreakable component that fits is fine", () => {
    expect(load().findOversized(pages(900, [[[0, "statblock", false, 400]]]))).toEqual([]);
  });

  test("one taller than the text area is found, in millimetres", () => {
    const found = load().findOversized(pages(960, [[[2, "statblock", false, 1200]]]));
    expect(found).toEqual([{ index: 2, name: "statblock", heightMm: mm(1200), columnMm: mm(960) }]);
  });

  test("one that was split across pages is too tall, with the parts added up", () => {
    const doc = pages(960, [[[1, "statblock", false, 700]], [[1, "statblock", false, 500]]]);
    const found = load().findOversized(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.heightMm).toBe(mm(1200));
  });

  test("the parts on the page are marked with the message, and nothing else is", () => {
    const doc = pages(960, [[[0, "statblock", false, 300], [1, "statblock", false, 1100]], [[1, "statblock", false, 200]]]);
    load().findOversized(doc);
    const marked = [...doc.querySelectorAll("[data-layout-warning]")];
    expect(marked.map((e) => e.getAttribute("data-block"))).toEqual(["1", "1"]);
    expect(marked[0]!.getAttribute("data-layout-warning")).toMatch(/^A "statblock" is taller than a column \(\d+ mm; a column is \d+ mm\)$/);
  });

  test("breakable components may be taller than a column", () => {
    expect(load().findOversized(pages(960, [[[0, "readaloud", true, 3000]]]))).toEqual([]);
  });

  test("results are in document order", () => {
    const found = load().findOversized(pages(500, [[[5, "statblock", false, 900]], [[1, "statblock", false, 900]]]));
    expect(found.map((f) => f.index)).toEqual([1, 5]);
  });

  test("the preview document numbers the components before Paged.js starts and reports what it found", () => {
    const doc = buildDocument(input, { pagedUrl, id: "r1" });
    expect(doc.indexOf("numberBlocks(document)")).toBeLessThan(doc.indexOf("PagedPolyfill.preview()"));
    expect(doc).toContain("findOversized(document)");
  });
});

describe("what the preview reports", () => {
  test("the oversized components come with the result", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const preview = createPreview(host, { pagedUrl });
    const done = preview.render(input);
    const frame = host.querySelector("iframe")!;
    const id = /var id = "(r\d+)"/.exec(frame.srcdoc)![1];
    const oversized = [{ index: 1, name: "statblock", heightMm: 461, columnMm: 253 }];
    window.dispatchEvent(new MessageEvent("message", { data: { type: MESSAGE_TYPE, id, pages: 3, layoutMs: 9, oversized }, source: frame.contentWindow }));
    expect(await done).toEqual({ pages: 3, layoutMs: 9, oversized, spreads: [], images: [] });
    preview.destroy();
    host.remove();
  });
});

describe("filling columns in order", () => {
  const fill = new Function(`${FILL_COLUMNS_SCRIPT}; return fillColumns;`)() as (doc: Document) => void;
  const doc = (pages: string[]) => {
    const d = document.implementation.createHTMLDocument("t");
    d.body.innerHTML = pages.map((p) => `<div class="pagedjs_page">${p}</div>`).join("");
    return d;
  };

  test("every page is marked, so the theme can fill its columns left to right", () => {
    const d = doc(["<p>a</p>", '<div data-component="statblock"></div>']);
    fill(d);
    expect([...d.querySelectorAll(".pagedjs_page")].map((p) => p.classList.contains("rosetta-filled"))).toEqual([true, true]);
  });

  test("a page with an oversized component stays balanced, because that component runs past the bottom of the page", () => {
    const d = doc(['<div data-layout-warning="too tall"></div>', "<p>b</p>"]);
    fill(d);
    expect([...d.querySelectorAll(".pagedjs_page")].map((p) => p.classList.contains("rosetta-filled"))).toEqual([false, true]);
  });

  test("it runs after the oversize check, and Paged.js lays the pages out before either", () => {
    const html = buildDocument({ html: "<p>x</p>", css: "" }, { pagedUrl: "paged.js", id: "t" });
    expect(html.indexOf("findOversized(document)")).toBeGreaterThan(html.indexOf("preview().then"));
    expect(html.indexOf("fillColumns(document)")).toBeGreaterThan(html.indexOf("findOversized(document)"));
  });
});

describe("chapter starts", () => {
  const doc = (input: Partial<Parameters<typeof buildDocument>[0]> = {}) =>
    buildDocument({ html: "<p>x</p>", css: "", ...input }, { pagedUrl: "paged.js", id: "t" });
  const css = (html: string) => /<style>([^<]*rosetta-chapter-start[^<]*)<\/style>/.exec(html)![1]!;

  test("a chapter on the first page needs nothing: no spare page, no blank page, numbering from 1", () => {
    const html = doc();
    expect(html).not.toContain('class="rosetta-parity-page"');
    expect(html).toContain('<div class="rosetta-chapter-start"></div>');
    expect(html).toContain("startPageNumbers(document, 1)");
  });

  test("a chapter that starts on a right-hand (odd) page is numbered from there, with no spare page", () => {
    const html = doc({ startPage: 7, startOn: "right-page" });
    expect(html).not.toContain('class="rosetta-parity-page"');
    expect(html).toContain('class="rosetta-chapter-start rosetta-start-right"');
    expect(html).toContain("startPageNumbers(document, 7)");
  });

  test("a chapter that starts on a left-hand (even) page gets a spare first page, so Paged.js sees the right sides", () => {
    const html = doc({ startPage: 8 });
    expect(html.indexOf('class="rosetta-parity-page"')).toBeLessThan(html.indexOf('class="rosetta-chapter-start'));
    expect(html).toContain("startPageNumbers(document, 8)"); // no blank page: the chapter's first page is page 8
  });

  test("a right-page chapter that would start on a left-hand page has a blank page before it, which counts: the chapter is numbered one later", () => {
    const html = doc({ startPage: 8, startOn: "right-page" });
    expect(html).toContain('class="rosetta-chapter-start rosetta-start-right"');
    expect(html).toContain("startPageNumbers(document, 8)"); // the blank page is page 8 and shows no number; the chapter starts on 9
    expect(css(html)).not.toContain("counter-reset"); // see chapterStartCss
  });

  test("a start page that is not a whole number of at least 1 counts as 1", () => {
    for (const startPage of [0, -3, 2.5, Number.NaN]) {
      const html = doc({ startPage });
      expect(html, String(startPage)).not.toContain('class="rosetta-parity-page"');
      expect(html, String(startPage)).toContain("startPageNumbers(document, 1)");
    }
  });

  test("the break rules are on the page, not in the theme: a zero-height element each", () => {
    const rules = css(doc());
    expect(rules).toMatch(/\.rosetta-parity-page, \.rosetta-blank-page \{[^}]*break-after: page/);
    expect(rules).toMatch(/\.rosetta-chapter-start\.rosetta-start-right \{[^}]*break-before: right/);
  });

  describe("hiding the spare page", () => {
    const hide = new Function(`${PARITY_PAGE_SCRIPT}; return hideParityPage;`)() as (d: Document) => number;
    test("only the page with the spare element is hidden, and counted", () => {
      const d = document.implementation.createHTMLDocument("t");
      d.body.innerHTML = '<div class="pagedjs_page"><div class="rosetta-parity-page"></div></div><div class="pagedjs_page"><p>a</p></div><div class="pagedjs_page"><p>b</p></div>';
      expect(hide(d)).toBe(1);
      expect([...d.querySelectorAll<HTMLElement>(".pagedjs_page")].map((p) => p.style.display)).toEqual(["none", "", ""]);
    });
    test("with no spare element nothing is hidden", () => {
      const d = document.implementation.createHTMLDocument("t");
      d.body.innerHTML = '<div class="pagedjs_page"><p>a</p></div>';
      expect(hide(d)).toBe(0);
    });
    test("the page count that is reported leaves the spare page out", () => {
      expect(doc()).toContain("pages: flow.total - parity");
    });
  });
});

describe("images in the HTML", () => {
  const html = '<p>x</p><figure><img src="a.png" alt=""><img src="https://x.test/b.png"></figure><img>';
  test("imageSources lists every src as written, repeats included", () => {
    expect(imageSources(html + '<img src="a.png">')).toEqual(["a.png", "https://x.test/b.png", "", "a.png"]);
    expect(imageSources("<p>no pictures</p>")).toEqual([]);
  });
  test("resolveImages gives each image the URL the resolver says, and leaves the rest alone", () => {
    const out = resolveImages(html, (src) => (src === "a.png" ? "blob:one" : src));
    expect(out).toContain('src="blob:one"');
    expect(out).toContain('src="https://x.test/b.png"');
    expect(out).toContain("<p>x</p>");
    expect(resolveImages("<p>none</p>", () => "never")).toBe("<p>none</p>");
  });
});

describe("page numbers", () => {
  /** A stand-in document: `counterReset` is what the browser says Paged.js left on the pages element. */
  function run(counterReset: string, first: number) {
    const pages = { style: { counterReset: "" } };
    const doc = { querySelector: () => pages, defaultView: { getComputedStyle: () => ({ counterReset }) } };
    (new Function(`${PAGE_NUMBERS_SCRIPT}; return startPageNumbers;`)() as (d: object, n: number) => void)(doc, first);
    return pages.style.counterReset;
  }
  test("the page counter starts one before the first page, and the other counters are kept", () => {
    expect(run("page 0 pages 4 footnote 0 footnote-marker 0", 1)).toBe("page 0 pages 4 footnote 0 footnote-marker 0");
    expect(run("page 0 pages 4 footnote 0", 9)).toBe("page 8 pages 4 footnote 0");
  });
  test("no page counter yet, or none at all", () => {
    expect(run("pages 4", 3)).toBe("pages 4 page 2");
    expect(run("none", 3)).toBe("page 2");
  });
  test("a counter whose name only ends in page is left alone", () => {
    expect(run("subpage 5 page 0", 4)).toBe("subpage 5 page 3");
  });
  test("the preview document numbers the pages after layout, from the chapter's first page", () => {
    const html = buildDocument(input, { pagedUrl, id: "r1", ...{} });
    expect(html.indexOf("startPageNumbers(document, 1)")).toBeGreaterThan(html.indexOf("PagedPolyfill.preview()"));
  });
});

describe("art on pages", () => {
  type Fn = (page: object, content: Element | DocumentFragment, token?: { node: Node }) => void;
  function install() {
    const hooks: Fn[] = [];
    (new Function(`${PAGE_ART_SCRIPT}; return installPageArt;`)() as (h: object) => void)({ beforePageLayout: { register: (f: Fn) => hooks.push(f) } });
    return hooks[0]!;
  }
  const page = () => {
    const element = document.createElement("div");
    const pagebox = document.createElement("div");
    element.append(pagebox);
    return { element, pagebox };
  };
  const content = (html: string) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  };
  const marker = '<div class="rosetta-page" data-template="art-full" data-art="x" data-art-src="blob:art"></div>';

  test("the script is part of the preview document, before Paged.js starts", () => {
    const doc = buildDocument(input, { pagedUrl, id: "r1" });
    expect(doc).toContain("installPageArt(window.PagedPolyfill.chunker.hooks)");
    expect(doc.indexOf("function installPageArt")).toBeLessThan(doc.indexOf("PagedPolyfill.preview()"));
  });
  test("a page that starts at a marker gets the template's class and a band with the image", () => {
    const run = install();
    const p = page();
    const c = content(`<div class="rosetta-document">${marker}<p>after</p></div>`);
    run(p, c, { node: c.querySelector(".rosetta-page")! });
    expect(p.element.classList.contains("has-art-full")).toBe(true);
    const img = p.pagebox.querySelector(".rosetta-art-band img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:art");
  });
  test("a marker inside what the page starts at (a layout's element) is found", () => {
    const run = install();
    const p = page();
    const c = content(`<div class="rosetta-layout"><div class="wrap">${marker}</div></div>`);
    run(p, c, { node: c.querySelector(".rosetta-layout")! });
    expect(p.element.classList.contains("has-art-full")).toBe(true);
  });
  test("a page that starts at text gets nothing", () => {
    const run = install();
    const p = page();
    const c = content(`<div class="rosetta-document"><p>text</p>${marker}</div>`);
    run(p, c, { node: c.querySelector("p")! });
    expect(p.element.className).toBe("");
    expect(p.pagebox.children.length).toBe(0); // no band
  });
  test("the first page has no break token: it starts at the first element after the chapter's spacer", () => {
    const run = install();
    const p = page();
    run(p, content(`<div class="rosetta-document"><div class="rosetta-chapter-start"></div>${marker}<h1>T</h1></div>`));
    expect(p.element.classList.contains("has-art-full")).toBe(true);
    const q = page();
    run(q, content(`<div class="rosetta-document"><div class="rosetta-chapter-start"></div><h1>T</h1>${marker}</div>`));
    expect(q.element.className).toBe("");
  });
  test("the spare page that keeps left/right parity gets no art", () => {
    const run = install();
    const p = page();
    run(p, content(`<div class="rosetta-document"><div class="rosetta-parity-page"></div><div class="rosetta-chapter-start"></div>${marker}</div>`));
    expect(p.element.className).toBe("");
  });
  test("the page after a blank page starts at the spacer, and so at the marker that follows it", () => {
    const run = install();
    const p = page();
    const c = content(`<div class="rosetta-document"><div class="rosetta-chapter-start rosetta-start-right"></div>${marker}</div>`);
    run(p, c, { node: c.querySelector(".rosetta-chapter-start")! });
    expect(p.element.classList.contains("has-art-full")).toBe(true);
  });
  describe("bands", () => {
    /** jsdom has no layout: the page box is 1000 high, and the band is wherever the test says (the theme's CSS decides that in a browser). */
    function withLayout(band: { top: number; height: number }) {
      const original = Element.prototype.getBoundingClientRect;
      const seen: { height?: string } = {};
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const r = this.classList.contains("rosetta-art-band") ? { top: band.top, height: (this as HTMLElement).style.height.endsWith("px") ? parseFloat((this as HTMLElement).style.height) : band.height } : { top: 0, height: 1000 };
        if (this.classList.contains("rosetta-art-band")) seen.height = (this as HTMLElement).style.height;
        return { ...r, bottom: r.top + r.height, left: 0, right: 100, width: 100, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
      };
      return { seen, restore: () => (Element.prototype.getBoundingClientRect = original) };
    }
    const run = (template: string, attrs: string, band: { top: number; height: number }) => {
      const env = withLayout(band);
      try {
        const hook = install();
        const p = page();
        const c = content(`<div class="rosetta-page" data-template="${template}" data-art-src="blob:a" ${attrs}></div>`);
        hook(p, c, { node: c.firstElementChild! });
        return { p, band: p.pagebox.querySelector(".rosetta-art-band") as HTMLElement, seen: env.seen };
      } finally {
        env.restore();
      }
    };

    test("a band at the top pushes the top margin down to its height", () => {
      const { p } = run("art-top", "", { top: 0, height: 300 });
      expect(p.element.style.getPropertyValue("--pagedjs-margin-top")).toBe("300px");
      expect(p.element.style.getPropertyValue("--pagedjs-margin-bottom")).toBe("");
    });
    test("a band at the bottom pushes the bottom margin up to its height", () => {
      const { p } = run("art-bottom", "", { top: 700, height: 300 });
      expect(p.element.style.getPropertyValue("--pagedjs-margin-bottom")).toBe("300px");
      expect(p.element.style.getPropertyValue("--pagedjs-margin-top")).toBe("");
    });
    test("a band over the whole page leaves the margins alone", () => {
      const { p } = run("art-full", "", { top: 0, height: 1000 });
      expect(p.element.style.getPropertyValue("--pagedjs-margin-top")).toBe("");
      expect(p.element.style.getPropertyValue("--pagedjs-margin-bottom")).toBe("");
    });
    test("a height is a length or a percentage, and replaces the theme's; anything else is ignored", () => {
      for (const ok of ["40%", "90mm", "3.5in", "120px", "10pt", "5cm"]) expect(run("art-top", `data-height="${ok}"`, { top: 0, height: 200 }).band.style.height, ok).toBe(ok);
      for (const bad of ["tall", "40", "-5mm", "calc(1px+2px)", "40% 50%", ""]) expect(run("art-top", `data-height="${bad}"`, { top: 0, height: 200 }).band.style.height, bad).toBe("");
    });
    test("a band that would leave no room for text is made shorter", () => {
      const { p, band } = run("art-top", 'data-height="95%"', { top: 0, height: 950 });
      expect(band.style.height).toBe("800px");
      expect(p.element.style.getPropertyValue("--pagedjs-margin-top")).toBe("800px");
    });
  });

  test("a page with no content (Paged.js's blank page) is left alone", () => {
    const run = install();
    const p = page();
    expect(() => run(p, undefined as never)).not.toThrow();
    expect(p.element.className).toBe("");
  });
  test("a marker with no template does nothing; one with no image still marks the page", () => {
    const run = install();
    const p = page();
    run(p, content('<div class="rosetta-document"><div class="rosetta-page"></div></div>'));
    expect(p.element.className).toBe("");
    const q = page();
    run(q, content('<div class="rosetta-document"><div class="rosetta-page" data-template="art-full"></div></div>'));
    expect(q.element.classList.contains("has-art-full")).toBe(true);
    expect(q.pagebox.querySelector("img")).toBeNull();
  });
  test("resolveImages writes the address of a page's art next to its name; imageSources lists it", () => {
    const html = '<div class="rosetta-page" data-template="art-full" data-art="dragon.png"></div>';
    const out = resolveImages(html, (s) => `blob:${s}`);
    expect(out).toContain('data-art="dragon.png"');
    expect(out).toContain('data-art-src="blob:dragon.png"');
    expect(imageSources(html)).toEqual(["dragon.png"]);
  });
  test("a marker straight after the chapter's spacer has no break before it (written after the theme's CSS, which Paged.js reads in order)", () => {
    const doc = buildDocument({ ...input, css: ".rosetta-document .rosetta-page { break-before: page; }" }, { pagedUrl, id: "r1" });
    expect(doc.indexOf("break-before: auto")).toBeGreaterThan(doc.indexOf("break-before: page"));
  });
});

describe("spreads", () => {
  const leftArt = '<div class="rosetta-page" data-component="page" data-template="art-full" data-art="a" data-side="left"></div><div class="rosetta-page" data-template="art-full" data-art="b"></div><p>text</p>';
  const build = (i: object) => buildDocument({ ...input, ...i } as never, { pagedUrl, id: "r1" });

  test("a chapter that begins with art on a left-hand page and would begin on a right-hand one has a blank page of its own first", () => {
    const html = build({ html: leftArt, startPage: 1 });
    expect(html).toContain('<div class="rosetta-blank-page"></div><div class="rosetta-chapter-start">');
    expect(html).not.toContain('class="rosetta-parity-page"');
    expect(build({ html: leftArt, startPage: 7 })).toContain('class="rosetta-blank-page"');
  });
  test("one that would begin on a left-hand page already is: the spare page keeps the sides, and there is no blank page", () => {
    const html = build({ html: leftArt, startPage: 8 });
    expect(html).toContain('class="rosetta-parity-page"');
    expect(html).not.toContain('class="rosetta-blank-page"');
  });
  test("the art decides: the chapter's right-page start rule is not applied", () => {
    expect(build({ html: leftArt, startPage: 1, startOn: "right-page" })).not.toContain('class="rosetta-chapter-start rosetta-start-right"');
    expect(build({ html: "<p>x</p>", startPage: 1, startOn: "right-page" })).toContain('class="rosetta-chapter-start rosetta-start-right"');
  });
  test("only a first page of art with side=left counts: not later art, not another side, not art with no template", () => {
    const art = (attrs: string) => `<div class="rosetta-page" ${attrs}></div>`;
    expect(build({ html: `<p>text</p>${art('data-template="art-full" data-side="left"')}` })).not.toContain('<div class="rosetta-blank-page">');
    expect(build({ html: art('data-template="art-full"') })).not.toContain('<div class="rosetta-blank-page">');
    expect(build({ html: art('data-side="left"') })).not.toContain('<div class="rosetta-blank-page">');
    expect(build({ html: `<div class="rosetta-layout">${art('data-template="art-top" data-side="left"')}</div>` })).toContain('<div class="rosetta-blank-page">'); // inside a layout's element, any template
  });
  test("the page the chapter makes for itself gets the blank-page class, so the theme's blank page rules apply", () => {
    document.body.innerHTML = '<div class="pagedjs_page"><div class="rosetta-blank-page"></div></div><div class="pagedjs_page"><p>a</p></div>';
    (new Function(`${BLANK_PAGE_SCRIPT}; return markBlankPages;`)() as (d: Document) => void)(document);
    expect([...document.querySelectorAll(".pagedjs_page")].map((p) => p.classList.contains("pagedjs_blank_page"))).toEqual([true, false]);
  });
  test("the preview document asks for the check after layout", () => {
    const html = build({});
    expect(html.indexOf("findUnpairedSpreads(document)")).toBeGreaterThan(html.indexOf("PagedPolyfill.preview()"));
    expect(html).toContain("spreads: spreads");
  });

  describe("finding art that does not face", () => {
    const find = (pagesHtml: string) => {
      document.body.innerHTML = pagesHtml;
      return (new Function(`${SPREADS_SCRIPT}; return findUnpairedSpreads;`)() as (d: Document) => unknown)(document);
    };
    const page = (side: "left" | "right", art: boolean, block = 0, extra = "") =>
      `<div class="pagedjs_page pagedjs_${side}_page${art ? " has-art-full" : ""}">${art ? `<div data-block="${block}" data-component="page"></div>` : "<p>text</p>"}${extra}</div>`;

    test("two in a row that start on a right-hand page are reported once, at the first", () => {
      expect(find(page("left", false) + page("right", true, 3) + page("left", true, 4) + page("right", false))).toEqual([{ index: 3, page: 2, count: 2 }]);
    });
    test("two in a row that start on a left-hand page face each other", () => {
      expect(find(page("right", false) + page("left", true, 1) + page("right", true, 2))).toEqual([]);
    });
    test("art that is alone is not a spread, on either side", () => {
      expect(find(page("right", true, 1) + page("left", false) + page("left", true, 2) + page("right", false))).toEqual([]);
    });
    test("a row of three that starts on the left is fine, one that starts on the right is reported once with its length", () => {
      expect(find(page("left", true, 1) + page("right", true, 2) + page("left", true, 3))).toEqual([]);
      expect(find(page("right", true, 1) + page("left", true, 2) + page("right", true, 3))).toEqual([{ index: 1, page: 1, count: 3 }]);
    });
    test("a blank page between them is not a row", () => {
      expect(find(page("right", true, 1) + page("left", false) + page("right", true, 2))).toEqual([]);
    });
    test("the spare page that keeps the sides is not a page of the chapter, so pages count without it", () => {
      const spare = `<div class="pagedjs_page pagedjs_right_page"><div class="rosetta-parity-page"></div></div>`;
      expect(find(spare + page("left", true, 5) + page("right", true, 6))).toEqual([]);
      expect(find(spare + page("left", false) + page("right", true, 5) + page("left", true, 6))).toEqual([{ index: 5, page: 2, count: 2 }]);
    });
  });
});

describe("art hook and the chapter's own blank page", () => {
  type Fn = (page: object, content: Element | DocumentFragment, token?: { node: Node }) => void;
  test("neither the blank first page nor the spare page gets art, and the page after the blank page does", () => {
    const hooks: Fn[] = [];
    (new Function(`${PAGE_ART_SCRIPT}; return installPageArt;`)() as (h: object) => void)({ beforePageLayout: { register: (f: Fn) => hooks.push(f) } });
    const marker = '<div class="rosetta-page" data-template="art-full" data-art-src="blob:a"></div>';
    const page = () => ({ element: document.createElement("div"), pagebox: document.createElement("div") });
    const content = (html: string) => Object.assign(document.createElement("div"), { innerHTML: html });
    const first = page();
    hooks[0]!(first, content(`<div class="rosetta-document"><div class="rosetta-blank-page"></div><div class="rosetta-chapter-start"></div>${marker}</div>`));
    expect(first.element.className).toBe("");
    const second = page();
    const c = content(`<div class="rosetta-document"><div class="rosetta-blank-page"></div><div class="rosetta-chapter-start"></div>${marker}</div>`);
    hooks[0]!(second, c, { node: c.querySelector(".rosetta-chapter-start")! });
    expect(second.element.classList.contains("has-art-full")).toBe(true);
  });
});

describe("placed images", () => {
  test("every image keeps what the chapter wrote as data-source, and a page's art band gets it from its marker, with the component's number", () => {
    const hooks: ((page: object, content: Element, token?: { node: Node }) => void)[] = [];
    (new Function(`${PAGE_ART_SCRIPT}; return installPageArt;`)() as (h: object) => void)({ beforePageLayout: { register: (f: (page: object, content: Element, token?: { node: Node }) => void) => hooks.push(f) } });
    const page = { element: document.createElement("div"), pagebox: document.createElement("div") };
    const content = Object.assign(document.createElement("div"), { innerHTML: '<div class="rosetta-page" data-block="4" data-template="art-full" data-art="dragon.png" data-art-src="blob:d"></div>' });
    hooks[0]!(page, content, { node: content.firstElementChild! });
    const img = page.pagebox.querySelector(".rosetta-art-band img")!;
    expect(img.getAttribute("data-source")).toBe("dragon.png");
    expect(page.pagebox.querySelector(".rosetta-art-band")!.getAttribute("data-block")).toBe("4");
  });

  describe("after layout", () => {
    const find = (html: string, size: Record<string, { w: number; h: number; natural?: [number, number] }>) => {
      document.body.innerHTML = html;
      const proto = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const s = size[this.getAttribute("data-source") ?? ""] ?? { w: 0, h: 0 };
        return { width: s.w, height: s.h, top: 0, left: 0, right: s.w, bottom: s.h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      };
      document.querySelectorAll("img").forEach((img) => {
        const s = size[img.getAttribute("data-source") ?? ""];
        Object.defineProperty(img, "complete", { value: true });
        Object.defineProperty(img, "naturalWidth", { value: s?.natural?.[0] ?? 100 });
        Object.defineProperty(img, "naturalHeight", { value: s?.natural?.[1] ?? 50 });
      });
      const run = new Function(`${PLACED_IMAGES_SCRIPT}; return findPlacedImages;`)() as (d: Document, ms: number) => Promise<unknown>;
      return run(document, 50).finally(() => (Element.prototype.getBoundingClientRect = proto));
    };

    test("lists each image with its box, its page, and the component that shows it", async () => {
      const html = `<div class="pagedjs_page"><p>text</p></div><div class="pagedjs_page"><figure data-block="2"><img data-source="map.png" src="blob:x"></figure><img data-source="plain.png" src="blob:y"></div>`;
      expect(await find(html, { "map.png": { w: 300, h: 200, natural: [1600, 1067] }, "plain.png": { w: 280, h: 90, natural: [400, 129] } })).toEqual([
        { source: "map.png", index: 2, page: 2, widthPx: 300, heightPx: 200, naturalWidth: 1600, naturalHeight: 1067 },
        { source: "plain.png", index: null, page: 2, widthPx: 280, heightPx: 90, naturalWidth: 400, naturalHeight: 129 },
      ]);
    });
    test("pages count without the spare page, and images that did not load, have no size, or are not the chapter's (no data-source) are left out", async () => {
      const html = `<div class="pagedjs_page"><div class="rosetta-parity-page"></div></div><div class="pagedjs_page"><img data-source="a.png"><img data-source="gone.png"><img src="blob:other"></div>`;
      const result = (await find(html, { "a.png": { w: 100, h: 50 }, "gone.png": { w: 0, h: 0 } })) as { source: string; page: number }[];
      expect(result.map((r) => [r.source, r.page])).toEqual([["a.png", 1]]);
    });
    test("an image that has not loaded is waited for, but not for long", async () => {
      document.body.innerHTML = `<div class="pagedjs_page"><img data-source="slow.png"></div>`;
      const img = document.querySelector("img")!;
      Object.defineProperty(img, "complete", { value: false });
      const run = new Function(`${PLACED_IMAGES_SCRIPT}; return findPlacedImages;`)() as (d: Document, ms: number) => Promise<unknown[]>;
      const started = Date.now();
      expect(await run(document, 60)).toEqual([]);
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });

  test("the preview document asks for the list after layout, and sends it with the result", () => {
    const html = buildDocument(input, { pagedUrl, id: "r1" });
    expect(html.indexOf("findPlacedImages(document")).toBeGreaterThan(html.indexOf("PagedPolyfill.preview()"));
    expect(html).toContain("images: images");
  });
});

describe("the whole book", () => {
  const bookInput = (chapters: { html: string; startOn?: "next-page" | "right-page" }[] = [{ html: "<h1>One</h1><p>a</p>" }, { html: "<h1>Two</h1>", startOn: "right-page" }, { html: "<h1>Three</h1>" }]) => ({ chapters, css: ".rosetta-document { color: red; }" });
  const build = (input = bookInput(), extra = {}) => buildBookDocument(input, { pagedUrl, id: "book1", ...extra });
  const body = (html: string) => /<div class="rosetta-document">([\s\S]*)<\/div>\n<script>/.exec(html)![1]!;

  test("is one document: the chapters follow each other, each with its own start", () => {
    const doc = body(build());
    expect(doc).toBe(
      '<div class="rosetta-chapter-start rosetta-start-first"></div><h1>One</h1><p>a</p>\n' +
        '<div class="rosetta-chapter-start rosetta-start-right"></div><h1>Two</h1>\n' +
        '<div class="rosetta-chapter-start"></div><h1>Three</h1>',
    );
  });
  test("has the theme's CSS and Paged.js, and none of the preview's screen styling (grey desk, pages shrunk to fit)", () => {
    const html = build();
    expect(html).toContain(".rosetta-document { color: red; }");
    expect(html).toContain('<script src="/paged.polyfill.js"></script>');
    expect(html).not.toContain("#6f7480");
    expect(html).not.toContain("fitToWidth");
  });
  test("every chapter starts on a new page, the first on page 1, a right-page chapter on a right-hand page", () => {
    const html = build();
    expect(html).toMatch(/\.rosetta-chapter-start \{[^}]*break-before: page/);
    expect(html).toMatch(/\.rosetta-start-first \{ break-before: auto/);
    expect(html).toMatch(/\.rosetta-start-right \{ break-before: right/);
    expect(html).toMatch(/\.rosetta-start-left \{ break-before: left/);
  });
  test("a chapter that opens with art that must be a left-hand page asks for one, whatever its own rule says; the very first needs a blank page of its own", () => {
    const art = '<div class="rosetta-page" data-template="art-full" data-art="a" data-side="left"></div><h1>T</h1>';
    const doc = body(build(bookInput([{ html: art, startOn: "right-page" }, { html: "<p>x</p>" }, { html: art }])));
    expect(doc.startsWith('<div class="rosetta-blank-page"></div><div class="rosetta-chapter-start rosetta-start-first rosetta-start-left"></div>')).toBe(true);
    expect([...doc.matchAll(/<div class="(rosetta-chapter-start[^"]*)"><\/div>/g)].map((m) => m[1])).toEqual(["rosetta-chapter-start rosetta-start-first rosetta-start-left", "rosetta-chapter-start", "rosetta-chapter-start rosetta-start-left"]);
    expect(doc.match(/rosetta-blank-page/g)).toHaveLength(1);
  });
  test("a marker that follows a chapter's start has no break before it (written after the theme's CSS)", () => {
    const html = build();
    expect(html.indexOf("break-before: auto; }\n</style>")).toBeGreaterThan(html.indexOf(".rosetta-document { color: red; }"));
  });
  test("images are given the address the caller says, or as in the preview when it says nothing", () => {
    const html = build(bookInput([{ html: '<img src="map.png"><img src="x.png"><div data-art="a.png"></div>' }]), { resolveImage: (s: string) => (s === "map.png" ? "blob:original" : undefined) });
    expect(html).toContain('src="blob:original"');
    expect(html).toContain("data:image/svg"); // x.png: a placeholder
    expect(html).toContain('data-art-src="data:image/svg');
  });
  test("what is on the screen is printed: backgrounds are not left to the dialog's settings", () => {
    expect(build()).toContain("print-color-adjust: exact");
  });
  test("the book is laid out with the same helpers as the preview, and reports progress and when the images are in", () => {
    const html = build();
    for (const fn of ["installTableHeaderRepeat", "installPageArt", "findOversized", "fillColumns", "markBlankPages", "waitForImages"]) expect(html, fn).toContain(`function ${fn}`);
    expect(html).toContain("afterPageLayout.register");
    expect(html.indexOf("waitForImages(document")).toBeGreaterThan(html.indexOf("PagedPolyfill.preview()"));
    expect(html).not.toContain("startPageNumbers(document"); // Paged.js numbers the pages from 1 itself (only a cover moves the start)
    expect(html).not.toContain("hideParityPage"); // and keeps left and right in step
  });

  describe("waiting for the images", () => {
    const run = (waitMs: number, report: (l: number, t: number) => void) => (new Function(`${WAIT_FOR_IMAGES_SCRIPT}; return waitForImages;`)() as (d: Document, ms: number, r: typeof report) => Promise<number>)(document, waitMs, report);
    const image = (state: "loaded" | "broken" | "pending") => {
      const img = document.createElement("img");
      Object.defineProperty(img, "complete", { value: state !== "pending" });
      Object.defineProperty(img, "naturalWidth", { value: state === "loaded" ? 10 : 0 });
      document.body.append(img);
      return img;
    };
    beforeEach(() => (document.body.innerHTML = ""));
    afterEach(() => (document.body.innerHTML = ""));

    test("no images: nothing to wait for", async () => {
      expect(await run(50, () => {})).toBe(0);
    });
    test("images that are in already, and one that is broken, are counted", async () => {
      image("loaded");
      image("broken");
      expect(await run(50, () => {})).toBe(1);
    });
    test("one that is still loading is waited for, and reported when it arrives", async () => {
      const seen: string[] = [];
      const pending = image("pending");
      const done = run(1000, (l, t) => seen.push(`${l}/${t}`));
      pending.dispatchEvent(new Event("load"));
      expect(await done).toBe(0);
      expect(seen).toEqual(["0/1", "0/1", "1/1"]);
    });
    test("one that never arrives is given up on after the time given, and counts as missing", async () => {
      image("pending");
      const started = Date.now();
      expect(await run(40, () => {})).toBe(1);
      expect(Date.now() - started).toBeLessThan(1000);
    });
  });

  describe("createBookLayout", () => {
    let host: HTMLElement;
    beforeEach(() => {
      host = document.createElement("div");
      document.body.append(host);
    });
    afterEach(() => host.remove());
    const frame = () => host.querySelector("iframe") as HTMLIFrameElement | null;
    const say = (iframe: HTMLIFrameElement, data: object) => {
      const id = /var id = "(book\d+)"/.exec(iframe.srcdoc)![1];
      window.dispatchEvent(new MessageEvent("message", { data: { type: BOOK_MESSAGE_TYPE, id, ...data }, source: iframe.contentWindow }));
    };

    test("lays the book out in a frame that is off the screen but has its full size, and resolves when it is all there", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const pages: number[] = [];
      const images: string[] = [];
      const done = layout.render(bookInput(), { onPage: (n) => pages.push(n), onImages: (l, t) => images.push(`${l}/${t}`) });
      expect(frame()!.style.cssText).toContain("left: -10000px");
      expect(frame()!.srcdoc).toContain("<h1>Two</h1>");
      say(frame()!, { progress: 5 });
      say(frame()!, { progress: 12 });
      say(frame()!, { images: { loaded: 1, total: 2 } });
      say(frame()!, { done: true, pages: 12, layoutMs: 300, oversized: [], missingImages: 0 });
      expect(await done).toEqual({ pages: 12, layoutMs: 300, oversized: [] });
      expect(pages).toEqual([5, 12]);
      expect(images).toEqual(["1/2"]);
      expect(frame()).not.toBeNull(); // kept for printing
    });
    test("messages from another render or another window are ignored", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const done = layout.render(bookInput());
      window.dispatchEvent(new MessageEvent("message", { data: { type: BOOK_MESSAGE_TYPE, id: "book1", done: true, pages: 99 }, source: window }));
      window.dispatchEvent(new MessageEvent("message", { data: { type: BOOK_MESSAGE_TYPE, id: "other", done: true, pages: 98 }, source: frame()!.contentWindow }));
      say(frame()!, { done: true, pages: 3, layoutMs: 1 });
      expect((await done).pages).toBe(3);
    });
    test("a failure in Paged.js rejects, and the frame is removed", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const done = layout.render(bookInput());
      say(frame()!, { error: "Paged.js did not load" });
      await expect(done).rejects.toThrow("Paged.js did not load");
      expect(frame()).toBeNull();
    });
    test("images that did not load are a failure: the book would print with gaps", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const done = layout.render(bookInput());
      say(frame()!, { done: true, pages: 3, layoutMs: 1, missingImages: 2 });
      await expect(done).rejects.toThrow("2 images could not be loaded");
    });
    test("cancelling rejects with an abort and removes the frame; a signal that is already aborted does not start", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const controller = new AbortController();
      const done = layout.render(bookInput(), { signal: controller.signal });
      controller.abort();
      await expect(done).rejects.toMatchObject({ name: "AbortError" });
      expect(frame()).toBeNull();
      const again = new AbortController();
      again.abort();
      await expect(layout.render(bookInput(), { signal: again.signal })).rejects.toMatchObject({ name: "AbortError" });
    });
    test("takes too long: rejects", async () => {
      vi.useFakeTimers();
      const layout = createBookLayout(host, { pagedUrl, timeoutMs: 120_000 });
      const done = layout.render(bookInput());
      const failed = expect(done).rejects.toThrow("took more than 2 minutes");
      await vi.advanceTimersByTimeAsync(120_001);
      await failed;
      vi.useRealTimers();
    });
    test("a new render replaces the frame of the one before", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const first = layout.render(bookInput());
      const settled = expect(first).rejects.toMatchObject({ name: "AbortError" });
      void layout.render(bookInput());
      await settled;
      expect(host.querySelectorAll("iframe")).toHaveLength(1);
    });
    test("printing opens the dialog of the laid-out book, and resolves when it is closed; with no book it says so", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      await expect(layout.print()).rejects.toThrow("no book to print");
      const done = layout.render(bookInput());
      say(frame()!, { done: true, pages: 2, layoutMs: 1 });
      await done;
      const win = frame()!.contentWindow!;
      const calls: string[] = [];
      win.print = () => {
        calls.push("print");
        win.dispatchEvent(new Event("afterprint"));
      };
      win.focus = () => void calls.push("focus");
      await layout.print();
      expect(calls).toEqual(["focus", "print"]);
    });
    test("destroy removes the frame", async () => {
      const layout = createBookLayout(host, { pagedUrl });
      const done = layout.render(bookInput());
      say(frame()!, { done: true, pages: 2, layoutMs: 1 });
      await done;
      layout.destroy();
      expect(frame()).toBeNull();
    });
  });
});

describe("the table of contents", () => {
  const toc = (attrs = "") => `<div class="rosetta-toc" data-component="toc" data-kind="leaf"${attrs}>\n</div>`;
  const chapters = [`<h1>Contents</h1>${toc()}`, '<h1>The Crypt</h1><p>x</p><h2>Rats</h2><h3>Big rats</h3>', '<div class="rosetta-layout" data-component="layout"><h1>Epilogue</h1><h2>The end</h2></div>'];
  const listed = (html: string) => {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    return [...doc.querySelectorAll(".rosetta-contents li")].map((li) => `${li.getAttribute("data-level")}:${li.textContent}`);
  };

  test("a book with no toc is left exactly as it is", () => {
    const html = ["<h1>One</h1><p>a</p>", "<h2>Two</h2>"];
    expect(addContents(html)).toEqual({ html, entries: [] });
  });
  test("the toc is replaced by the headings of every chapter in book order, to the depth asked for (default 2)", () => {
    const result = addContents(chapters);
    expect(listed(result.html[0]!)).toEqual(["1:Contents", "1:The Crypt", "2:Rats", "1:Epilogue", "2:The end"]);
    expect(result.entries.map((e) => `${e.level}:${e.text}`)).toEqual(["1:Contents", "1:The Crypt", "2:Rats", "3:Big rats", "1:Epilogue", "2:The end"]);
    expect(listed(addContents([toc(' data-depth="1"'), ...chapters.slice(1)]).html[0]!)).toEqual(["1:The Crypt", "1:Epilogue"]);
    expect(listed(addContents([toc(' data-depth="3"'), ...chapters.slice(1)]).html[0]!)).toEqual(["1:The Crypt", "2:Rats", "3:Big rats", "1:Epilogue", "2:The end"]);
  });
  test("a depth that is not 1 to 3 is read as 2, and a missing or empty title as Contents", () => {
    expect(listed(addContents([toc(' data-depth="9"'), "<h3>Deep</h3><h2>Shallow</h2>"]).html[0]!)).toEqual(["2:Shallow"]);
    expect(new DOMParser().parseFromString(addContents([toc(' data-title="  "'), "<h1>A</h1>"]).html[0]!, "text/html").querySelector(".rosetta-contents-title")!.textContent).toBe("Contents");
    expect(new DOMParser().parseFromString(addContents([toc(' data-title="Table of Contents"'), "<h1>A</h1>"]).html[0]!, "text/html").querySelector(".rosetta-contents-title")!.textContent).toBe("Table of Contents");
  });
  test("every entry links to its heading, which has that id", () => {
    const result = addContents(chapters);
    const all = new DOMParser().parseFromString(`<body>${result.html.join("")}</body>`, "text/html");
    for (const a of all.querySelectorAll(".rosetta-contents a")) expect(all.querySelector(a.getAttribute("href")!), a.textContent!).not.toBeNull();
    expect(all.querySelector("#rosetta-h1")!.textContent).toBe("The Crypt");
    expect(new Set(result.entries.map((e) => e.id)).size).toBe(result.entries.length);
  });
  test("headings inside a component (a sidebar's title, read-aloud text) are not sections of the book; an empty heading is not listed", () => {
    const html = ['<h1>A</h1><div class="rosetta-sidebar" data-component="sidebar"><h3 class="rosetta-title">Variant</h3></div><h2></h2>', toc()];
    expect(listed(addContents(html).html[1]!)).toEqual(["1:A"]);
  });
  test("what an author wrote as a title cannot add markup to the page", () => {
    const html = ["<h1>&lt;img src=x onerror=alert(1)&gt;</h1>", toc()];
    const out = addContents(html).html[1]!;
    expect(out).not.toContain("<img");
    expect(listed(out)).toEqual(["1:<img src=x onerror=alert(1)>"]);
  });
  test("two tables of contents are both made", () => {
    const out = addContents([toc(), "<h1>A</h1>", toc(' data-depth="1"')]).html;
    expect(listed(out[0]!)).toEqual(["1:A"]);
    expect(listed(out[2]!)).toEqual(["1:A"]);
  });
  describe("the page numbers", () => {
    const run = (html: string) => {
      document.body.innerHTML = html;
      const filled = (new Function(`${FILL_CONTENTS_SCRIPT}; return fillContents;`)() as (d: Document) => number)(document);
      return { filled, numbers: [...document.querySelectorAll(".rosetta-contents a")].map((a) => a.getAttribute("data-page")) };
    };
    const page = (n: number, inner: string) => `<div class="pagedjs_page" data-page-number="${n}">${inner}</div>`;
    const link = (id: string) => `<li><a href="#${id}">x</a></li>`;

    test("each entry gets the number of the page its heading is on, wherever the list itself is", () => {
      const { filled, numbers } = run(page(1, `<nav class="rosetta-contents"><ol>${link("rosetta-h1")}${link("rosetta-h2")}${link("rosetta-h3")}</ol></nav>`) + page(2, '<h1 id="rosetta-h1">A</h1>') + page(3, '<h2 id="rosetta-h2">B</h2>') + page(7, '<h1 id="rosetta-h3">C</h1>'));
      expect(filled).toBe(3);
      expect(numbers).toEqual(["2", "3", "7"]);
    });
    test("a list that runs over two pages is filled on both, and a heading that is not there is left without a number", () => {
      const { filled, numbers } = run(page(1, `<nav class="rosetta-contents"><ol>${link("rosetta-h1")}</ol></nav>`) + page(2, `<nav class="rosetta-contents"><ol>${link("rosetta-h1")}${link("rosetta-h9")}</ol></nav>`) + page(3, '<h1 id="rosetta-h1">A</h1>'));
      expect(filled).toBe(2);
      expect(numbers).toEqual(["3", "3", null]);
    });
    test("a heading that is on two pages (split) counts for the first", () => {
      expect(run(page(1, `<nav class="rosetta-contents"><ol>${link("rosetta-h1")}</ol></nav>`) + page(4, '<h1 id="rosetta-h1">A</h1>') + page(5, '<h1 id="rosetta-h1">A</h1>')).numbers).toEqual(["4"]);
    });
    test("the book's document asks for it after layout", () => {
      const doc = buildBookDocument({ chapters: [{ html: "<h1>A</h1>" }], css: "" }, { pagedUrl, id: "book1" });
      expect(doc.indexOf("fillContents(document, 0)")).toBeGreaterThan(doc.indexOf("PagedPolyfill.preview()"));
    });
  });

  test("the book's document has the list, with the headings' ids, and no marker left", () => {
    const doc = buildBookDocument({ chapters: chapters.map((html) => ({ html })), css: "" }, { pagedUrl, id: "book1" });
    expect(doc).toContain('<nav class="rosetta-contents"');
    expect(doc).toContain('<a href="#rosetta-h1">');
    expect(doc).toContain('<h1 id="rosetta-h1">The Crypt</h1>');
    expect(doc).not.toContain('class="rosetta-toc"');
  });
});

describe("the front cover", () => {
  const chapters = [{ html: "<h1>One</h1>" }, { html: "<h1>Two</h1>", startOn: "right-page" as const }];
  const build = (cover: { title: string; art?: string } | undefined, resolveImage?: (s: string) => string | undefined, list = chapters) => buildBookDocument({ cover, chapters: list, css: "" }, { pagedUrl, id: "book1", resolveImage });
  const bodyOf = (html: string) => /<div class="rosetta-document">([\s\S]*)<\/div>\n<script>/.exec(html)![1]!;

  test("is the first page: a page of art with the title, then a blank page behind it, then the chapters", () => {
    const doc = bodyOf(build({ title: "The Warcaller", art: "dragon.png" }, (s) => (s === "dragon.png" ? "blob:cover" : undefined)));
    expect(doc.startsWith('<div class="rosetta-cover"><div class="rosetta-page" data-component="page" data-kind="leaf" data-template="cover" data-art="dragon.png" data-art-src="blob:cover"></div><div class="rosetta-cover-title">The Warcaller</div></div><div class="rosetta-blank-page"></div><div class="rosetta-chapter-start">')).toBe(true);
  });
  test("with no picture it is the title on a plain page", () => {
    const doc = bodyOf(build({ title: "Plain" }));
    expect(doc).toContain('data-template="cover"></div><div class="rosetta-cover-title">Plain</div>');
    expect(doc).not.toContain("data-art");
  });
  test("a title cannot add markup, and a name with quotes stays in its attribute", () => {
    const doc = bodyOf(build({ title: "<img src=x onerror=1> & more", art: 'a "b".png' }));
    expect(doc).toContain("&lt;img src=x onerror=1&gt; &amp; more");
    expect(doc).not.toContain("<img src=x");
    expect(doc).toContain('data-art="a &quot;b&quot;.png"');
  });
  test("the first chapter is not the start of the document any more, so it breaks like the others", () => {
    const withCover = bodyOf(build({ title: "T" }));
    expect(withCover).toContain('<div class="rosetta-chapter-start"></div><h1>One</h1>');
    expect(withCover).not.toContain("rosetta-start-first");
    expect(bodyOf(build(undefined))).toContain("rosetta-start-first");
  });
  test("a first chapter that opens with a left-hand page of art needs no blank page of its own: it breaks to the left like the others", () => {
    const art = '<div class="rosetta-page" data-template="art-full" data-art="a" data-side="left"></div><h1>T</h1>';
    const doc = bodyOf(build({ title: "T" }, undefined, [{ html: art }]));
    expect(doc).toContain('<div class="rosetta-chapter-start rosetta-start-left"></div>');
    expect(doc.match(/rosetta-blank-page/g)).toHaveLength(1); // only the one behind the cover
  });
  test("the cover and its blank page are not counted: the pages are numbered from the first chapter, and the contents agree", () => {
    const html = build({ title: "T" });
    expect(html).toContain("startPageNumbers(document, -1)");
    expect(html).toContain("fillContents(document, 2)");
    const without = build(undefined);
    expect(without).not.toContain("startPageNumbers(document");
    expect(without).toContain("fillContents(document, 0)");
  });
  test("the contents' page numbers skip the cover and its blank page", () => {
    document.body.innerHTML = `<div class="pagedjs_page" data-page-number="1"><nav class="rosetta-contents"><ol><li><a href="#rosetta-h0">A</a></li></ol></nav></div><div class="pagedjs_page" data-page-number="3"><h1 id="rosetta-h0">A</h1></div>`;
    (new Function(`${FILL_CONTENTS_SCRIPT}; return fillContents;`)() as (d: Document, before: number) => number)(document, 2);
    expect(document.querySelector("a")!.getAttribute("data-page")).toBe("1");
  });
  test("the art hook gives the cover page its class", () => {
    const hooks: ((page: object, content: Element) => void)[] = [];
    (new Function(`${PAGE_ART_SCRIPT}; return installPageArt;`)() as (h: object) => void)({ beforePageLayout: { register: (f: (page: object, content: Element) => void) => hooks.push(f) } });
    const page = { element: document.createElement("div"), pagebox: document.createElement("div") };
    const content = Object.assign(document.createElement("div"), { innerHTML: bodyOf(build({ title: "T", art: "a.png" }, () => "blob:c")) });
    hooks[0]!(page, content);
    expect(page.element.classList.contains("has-cover")).toBe(true);
    expect((page.pagebox.querySelector(".rosetta-art-band img") as HTMLImageElement).getAttribute("src")).toBe("blob:c");
  });
});
