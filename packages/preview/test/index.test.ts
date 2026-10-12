// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildDocument, createPreview, defaultResolveImage, MESSAGE_TYPE, TABLE_HEADER_SCRIPT } from "../src/index";

const pagedUrl = "/paged.polyfill.js";
// jsdom has no layout; scrolling does nothing there.
Window.prototype.scrollTo = () => {};
const input = { html: "<h1>Title</h1><p>Text</p>", css: ".rosetta-document { color: red; }" };

describe("buildDocument", () => {
  const build = (i = input, extra = {}) => buildDocument(i, { pagedUrl, id: "r1", ...extra });

  test("has the HTML inside .rosetta-document, the CSS, and Paged.js", () => {
    const doc = build();
    expect(doc).toContain('<div class="rosetta-document"><h1>Title</h1><p>Text</p></div>');
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
    expect(doc).not.toContain("assets/a.png");
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
    expect(await done).toEqual({ pages: 12, layoutMs: 140 });
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
    expect(await fast).toEqual({ pages: 3, layoutMs: 5 });
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
