import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { declarations, lintCss } from "../lint.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const theme = JSON.parse(read("theme.json"));
const css = read("theme.css");

test("the theme's CSS has no hardcoded fonts, colors, borders or spacing", () => {
  assert.deepEqual(lintCss(css), []);
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
