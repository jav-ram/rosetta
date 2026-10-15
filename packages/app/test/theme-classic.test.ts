// @vitest-environment jsdom
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { URL as NodeURL } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import { validateTheme, type Theme } from "@rosetta/contracts";
import { compileTheme, inlinePageVariables, resolveTokens } from "@rosetta/theme-engine";
import themeJson from "@rosetta/theme-classic/theme.json";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";


const theme = themeJson as Theme;
const themeCss = readFileSync(createRequire(import.meta.url).resolve("@rosetta/theme-classic/theme.css"), "utf8");

describe("theme-classic with the theme engine", () => {
  test("the theme follows the theme schema", () => {
    expect(validateTheme(theme)).toEqual({ valid: true, errors: [] });
  });

  test("its tokens compile to CSS custom properties", () => {
    const css = compileTheme(theme);
    expect(css).toContain("--page-size: A4;");
    expect(css).toContain("--font-body: Georgia");
    expect(css).toContain("--border-statblock: 2pt solid var(--color-statblock-edge);");
  });

  test("page rules get their values written in, with no variables left", () => {
    const out = inlinePageVariables(themeCss, resolveTokens(theme));
    const pageRules = out.slice(out.indexOf("@page"), out.indexOf(".rosetta-document {"));
    expect(pageRules).not.toContain("var(");
    expect(pageRules).toContain("size: A4;");
    expect(pageRules).toContain("margin-top: 22mm;");
    expect(pageRules).toContain("border-bottom: 0.5pt solid #b58b5a;");
  });

  test("a book can change the page size and the body font without touching the CSS", () => {
    const book = { tokens: { "page.size": "letter", "font.body": "Lato, sans-serif" } };
    expect(inlinePageVariables(themeCss, resolveTokens(theme, book))).toContain("size: letter;");
    expect(compileTheme(theme, book)).toContain("--font-body: Lato, sans-serif;");
  });

  test("every token the CSS reads exists in the theme", () => {
    const names = new Set(Object.keys(resolveTokens(theme)).map((t) => `--${t.replace(/\./g, "-")}`));
    const used = [...themeCss.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(used.filter((u) => !names.has(u))).toEqual([]);
  });
});

describe("the layout test chapter", () => {
  const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
  let parser: RosettaParser;
  beforeAll(async () => {
    await import(dist("wasm_exec.js").href);
    parser = await instantiate(readFileSync(dist("rosetta.wasm")));
  });

  test("parses without warnings, and each layout holds what follows it, to the next layout", () => {
    const md = readFileSync(createRequire(import.meta.url).resolve("@rosetta/theme-classic/theme.json").replace("theme.json", "test-pages/layout.md"), "utf8");
    const { html, warnings } = parser.parse(md) as { html: string; warnings: unknown[] };
    expect(warnings).toEqual([]);
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
    const root = doc.getElementById("r")!;
    // The text before the first layout is not inside one; the three layouts are top-level and hold the headings after them.
    const layouts = [...root.children].filter((e) => e.classList.contains("rosetta-layout"));
    expect(layouts.map((e) => e.getAttribute("data-template"))).toEqual(["one-column", "two-column", "one-column"]);
    expect(layouts.map((e) => e.querySelector("h2")?.textContent)).toEqual(["One column", "Two columns again", "One column to finish"]);
    expect(root.firstElementChild!.tagName).toBe("H1");
    expect(root.querySelectorAll(".rosetta-layout .rosetta-layout")).toHaveLength(0);
  });
});

describe("the flow test chapter", () => {
  const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
  let parser: RosettaParser;
  beforeAll(async () => {
    await import(dist("wasm_exec.js").href);
    parser = await instantiate(readFileSync(dist("rosetta.wasm")));
  });

  const chapter = () => readFileSync(createRequire(import.meta.url).resolve("@rosetta/theme-classic/theme.json").replace("theme.json", "test-pages/flow.md"), "utf8");

  test("parses without warnings, and the HTML carries what the flow CSS reads", () => {
    const { html, warnings } = parser.parse(chapter()) as { html: string; warnings: unknown[] };
    expect(warnings).toEqual([]);
    expect(html).toMatch(/<div class="rosetta-statblock"[^>]* data-breakable="false"/);
    expect(html).toMatch(/<div class="rosetta-readaloud"[^>]* data-breakable="true"/);
    expect(html).toContain("<thead>");
    expect(html).toContain("<img ");
    expect(html.match(/<li>/g)!.length).toBeGreaterThan(20);
  });
});
