import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// The preview's art hook uses names that belong to Paged.js and are not a documented interface (only `beforePageLayout` is).
// They are checked here against the Paged.js that is installed, so an upgrade that renames them fails here, not in a book.
// pagedjs only exports its sources, so its files are reached by path (as the app does for the browser build).
const root = new URL("../node_modules/pagedjs/", import.meta.url).pathname;
const source = readFileSync(`${root}dist/paged.polyfill.js`, "utf8");
const version = (JSON.parse(readFileSync(`${root}package.json`, "utf8")) as { version: string }).version;

describe(`Paged.js ${version}, what the preview's hooks rely on`, () => {
  test("it is the version the app pins", () => {
    expect(version).toBe("0.4.3");
  });
  test("the hooks the preview installs on exist, and the page box and element are given to beforePageLayout", () => {
    for (const hook of ["beforePageLayout", "onPageLayout", "renderNode"]) expect(source, hook).toContain(hook);
    expect(source).toMatch(/hooks\.beforePageLayout\.trigger\(page, /);
    expect(source).toMatch(/this\.pagebox\s*=/);
  });
  test("the page margins are CSS variables on the page, which the layout reads after the hook", () => {
    for (const side of ["top", "bottom", "left", "right"]) expect(source, side).toContain(`--pagedjs-margin-${side}`);
  });
  test("pages are counted by the CSS counter that starts at 0 on .pagedjs_pages", () => {
    expect(source).toMatch(/\.pagedjs_pages \{ counter-reset: [^`]*page 0 pages var\(--pagedjs-page-count\)/);
    expect(source).toMatch(/\.pagedjs_page \{\s*counter-increment: page var\(--pagedjs-page-counter-increment\)/);
  });
  test("a blank page, and the classes the theme styles", () => {
    for (const name of ["pagedjs_blank_page", "pagedjs_margin-top", "pagedjs_margin-bottom-center", "pagedjs_margin-content", "pagedjs_page_content"]) expect(source, name).toContain(name);
  });
});
