import { describe, expect, test } from "vitest";
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
