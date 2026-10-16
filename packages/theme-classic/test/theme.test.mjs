import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { declarations, lintCss } from "../lint.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const theme = JSON.parse(read("theme.json"));
// content.css is how things look (also in the editor); pages.css is pagination (preview and export only).
const content = read("content.css");
const pages = read("pages.css");
const css = `${pages}\n${content}`;

test("the theme's CSS has no hardcoded fonts, colors, borders or spacing", () => {
  assert.deepEqual(lintCss(content), []);
  assert.deepEqual(lintCss(pages), []);
});

test("content.css can be used on screen: no page or flow rules, which belong to pages.css", () => {
  assert.doesNotMatch(content, /@page|break-(before|after|inside)|string-set|column-(span|count)|orphans|widows|page:/);
});

test("the lint does catch hardcoded values", () => {
  const bad = [
    "p { color: #333 }",
    "p { color: red }",
    "p { background: rgb(0 0 0) }",
    "p { font-family: Georgia, serif }",
    "p { font-size: 12pt }",
    "p { border: 1px solid var(--color-rule) }",
    "p { border-top: 2pt }",
    "p { margin-bottom: 8px }",
    "p { padding: var(--spacing-block) 4px }",
    "p { color: var(--color-text, #000) }",
    "@page { margin-top: 20mm }",
    "@page { @top-center { color: #888 } }",
    "p { box-shadow: 0 0 4px var(--color-text) }",
    "p { --color-text: #000 }",
  ];
  for (const rule of bad) assert.notDeepEqual(lintCss(rule), [], rule);
  const good = [
    "p { color: var(--color-text) }",
    "p { border: none; margin: 0; padding: 0 }",
    "p { border-top: var(--border-rule); padding: var(--spacing-cell) }",
    '@page { size: var(--page-size); @bottom-center { content: counter(page); color: var(--color-muted) } }',
    'p::after { content: "#fff 12px" }',
    "p { break-after: avoid; orphans: 2 }",
  ];
  for (const rule of good) assert.deepEqual(lintCss(rule), [], rule);
});

test("declarations are found inside rules, @page and margin boxes", () => {
  const found = declarations("/* c */ @page { size: A4; @top-center { content: 'x' } } p { color: red; margin: 0 }");
  assert.deepEqual(found.map((d) => d.property), ["size", "content", "color", "margin"]);
});

test("every token the CSS reads is defined by the theme", () => {
  const used = new Set([...css.matchAll(/var\(\s*--([a-z0-9-]+)\s*\)/g)].map((m) => m[1]));
  const defined = new Set(Object.keys(theme.tokens).map((t) => t.replace(/\./g, "-")));
  const missing = [...used].filter((u) => !defined.has(u));
  assert.deepEqual(missing, []);
});

test("every token the theme defines is used, by the CSS or by another token", () => {
  const text = css + JSON.stringify(theme.tokens);
  const unused = Object.keys(theme.tokens).filter((t) => !text.includes(`var(--${t.replace(/\./g, "-")})`));
  assert.deepEqual(unused, []);
});

test("the page is A4 with two columns", () => {
  assert.equal(theme.tokens["page.size"], "A4");
  assert.equal(theme.tokens["page.columns"], "2");
});

test("there are styles for every M1 component and for the running header and page number", () => {
  for (const name of ["rosetta-statblock", "rosetta-readaloud", "rosetta-sidebar", "rosetta-pagebreak"]) assert.ok(css.includes(`.${name}`), name);
  assert.ok(css.includes("@top-center") && css.includes("string(chapter)"));
  assert.ok(css.includes("@bottom-center") && css.includes("counter(page)"));
});

test("flow: unbreakable components, images and rows never split, headings stay with what follows, orphans and widows come from tokens", () => {
  // The declarations of every rule whose selector list contains `selector` as one of its selectors.
  const rule = (selector) => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
    let found = "";
    for (const block of plain.split("}")) {
      const [selectors, body] = block.split("{");
      if (body !== undefined && selectors.split(",").some((sel) => sel.trim() === selector)) found += body;
    }
    return found;
  };
  assert.match(rule('.rosetta-document [data-breakable="false"]'), /break-inside:\s*avoid/);
  for (const el of ["img", "figure", "li", "tr"]) assert.match(rule(`.rosetta-document ${el}`), /break-inside:\s*avoid/, el);
  assert.match(rule(".rosetta-document h1"), /break-after:\s*avoid/);
  assert.match(rule(".rosetta-document"), /orphans:\s*var\(--page-orphans\)/);
  assert.match(rule(".rosetta-document"), /widows:\s*var\(--page-widows\)/);
  assert.equal(theme.tokens["page.orphans"], "2");
  assert.equal(theme.tokens["page.widows"], "2");
});

test("the flow test chapter has every case the flow rules are about", () => {
  const md = read("test-pages/flow.md");
  assert.match(md, /^\| d100 \|/m); // a table, with a header
  assert.ok((md.match(/^\|\s*\d+ \|/gm) ?? []).length >= 50); // long enough to split
  assert.ok((md.match(/^:::statblock/gm) ?? []).length >= 3);
  assert.ok((md.match(/^!\[/gm) ?? []).length >= 3);
  assert.match(md, /^:::readaloud/m);
  assert.match(md, /^:::sidebar/m);
  assert.match(md, /^- /m);
});

test("page templates: a named page and a layout rule for each template the layout component offers", () => {
  const defs = JSON.parse(readFileSync(new URL("../../contracts/definitions/m1-components.json", import.meta.url), "utf8"));
  const templates = defs.find((d) => d.name === "layout").attributes.find((a) => a.name === "template").values;
  assert.deepEqual(templates, ["one-column", "two-column"]);
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const t of templates) {
    assert.ok(plain.includes(`@page ${t} {`), `@page ${t}`);
    assert.match(plain, new RegExp(`\\.rosetta-document > \\.rosetta-layout\\[data-template="${t}"\\]\\s*\\{[^}]*page:\\s*${t};`), `page: ${t}`);
  }
  // a layout always starts a new page, and only a top-level one counts
  assert.match(plain, /\.rosetta-document > \.rosetta-layout\s*\{[^}]*break-before:\s*page/);
  // the columns of a page come from its template
  assert.match(plain, /\.pagedjs_one-column_page \.rosetta-document\s*\{[^}]*column-count:\s*var\(--page-columns-single\)/);
  assert.match(plain, /(^|\n)\.rosetta-document\s*\{[^}]*column-count:\s*var\(--page-columns\)/);
  assert.equal(theme.tokens["page.columns-single"], "1");
});

test("the layout test chapter switches layout mid-chapter, and back", () => {
  const md = read("test-pages/layout.md");
  assert.deepEqual([...md.matchAll(/^::layout\{template="([a-z-]+)"\}$/gm)].map((m) => m[1]), ["one-column", "two-column", "one-column"]);
});
