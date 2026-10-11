import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Theme } from "@rosetta/contracts";
import { compileTheme, inlinePageVariables, propertyName, resolveTokens } from "../src/index";

const theme: Theme = {
  name: "Test",
  tokens: { "font.body": "Georgia, serif", "color.text": "#111", "color.accent": "#a00", "page.size": "A4" },
  components: { readaloud: { "font.body": "Garamond, serif", "color.text": "#333" } },
};

describe("resolveTokens", () => {
  test("the theme's defaults when nothing overrides them", () => {
    expect(resolveTokens(theme)).toEqual(theme.tokens);
  });

  test("book overrides theme defaults", () => {
    const t = resolveTokens(theme, { tokens: { "font.body": "Lato, sans-serif" } });
    expect(t["font.body"]).toBe("Lato, sans-serif");
    expect(t["color.text"]).toBe("#111");
  });

  test("a component's override wins over the book's and the theme's defaults", () => {
    const book = { tokens: { "font.body": "Lato, sans-serif" } };
    expect(resolveTokens(theme, book, "readaloud")["font.body"]).toBe("Garamond, serif");
    // another component has no override of its own, so the book's font reaches it
    expect(resolveTokens(theme, book, "sidebar")["font.body"]).toBe("Lato, sans-serif");
  });

  test("the book can override a single component, which beats the theme's override for it", () => {
    const book = { components: { readaloud: { "font.body": "Cinzel, serif" } } };
    expect(resolveTokens(theme, book, "readaloud")["font.body"]).toBe("Cinzel, serif");
    expect(resolveTokens(theme, book, "readaloud")["color.text"]).toBe("#333");
    expect(resolveTokens(theme, book)["font.body"]).toBe("Georgia, serif");
  });
});

describe("compileTheme", () => {
  test("token names become custom properties", () => {
    expect(propertyName("font.body")).toBe("--font-body");
    expect(propertyName("border.frame-top")).toBe("--border-frame-top");
  });

  test("a token file compiles to CSS", () => {
    expect(compileTheme(theme)).toBe(`:root {
  --font-body: Georgia, serif;
  --color-text: #111;
  --color-accent: #a00;
  --page-size: A4;
}

[data-component="readaloud"] {
  --font-body: Garamond, serif;
  --color-text: #333;
}
`);
  });

  test("the sample theme from contracts compiles", () => {
    const sample = JSON.parse(readFileSync(new URL("../../contracts/examples/sample-theme.json", import.meta.url), "utf8"));
    const css = compileTheme(sample);
    expect(css).toContain("--font-heading: \"Palatino Linotype\", serif;");
    expect(css).toContain("--page-size: A4;");
  });

  test("overrides change the compiled values the same way resolveTokens does", () => {
    const css = compileTheme(theme, { tokens: { "font.body": "Lato" }, components: { sidebar: { "color.accent": "#00a" } } });
    expect(css).toContain(":root {\n  --font-body: Lato;");
    expect(css).toContain('[data-component="readaloud"] {\n  --font-body: Garamond, serif;');
    expect(css).toContain('[data-component="sidebar"] {\n  --color-accent: #00a;');
  });

  test("a theme without component overrides has only the root rule", () => {
    expect(compileTheme({ name: "x", tokens: { "color.text": "#000" } })).toBe(":root {\n  --color-text: #000;\n}\n");
  });

  test("the compiled CSS really cascades in a browser-like engine order: component rule comes after the root rule", () => {
    const css = compileTheme(theme);
    expect(css.indexOf(":root")).toBeLessThan(css.indexOf('[data-component="readaloud"]'));
  });
});

describe("invalid input", () => {
  test("a token name outside the categories is rejected", () => {
    expect(() => compileTheme({ name: "x", tokens: { "weird.thing": "1" } })).toThrow(/invalid theme/);
    expect(() => compileTheme({ name: "x", tokens: { "Font.Body": "1" } })).toThrow(/invalid theme/);
  });

  test("a bad token name in the book's overrides is rejected too", () => {
    expect(() => compileTheme(theme, { tokens: { "nope": "1" } })).toThrow(/invalid theme/);
    expect(() => compileTheme(theme, { components: { "Bad Name": { "color.text": "red" } } })).toThrow(/invalid theme/);
  });

  test("values that could break out of the declaration are rejected", () => {
    for (const value of ["red; } body { display: none", "red}", "url(x", "\"open", "a /* c */", "<b>"]) {
      expect(() => compileTheme({ name: "x", tokens: { "color.text": value } }), value).toThrow(/theme token color.text/);
    }
  });

  test("semicolons inside quotes or url() are fine", () => {
    const css = compileTheme({ name: "x", tokens: { "texture.page": "url(\"data:image/png;base64,AAA\")", "font.body": "\"a;b\", serif" } });
    expect(css).toContain("--texture-page: url(\"data:image/png;base64,AAA\");");
    expect(css).toContain("--font-body: \"a;b\", serif;");
  });
});

describe("inlinePageVariables", () => {
  const css = `@page {
  size: var(--page-size);
  margin-top: var(--page-margin-top);
  @top-center { border-bottom: var(--border-rule); }
}
.a { margin: var(--page-margin-top); }
@page chapter { size: var(--page-size) }
`;
  const tokens = { "page.size": "A4", "page.margin-top": "20mm", "border.rule": "1pt solid var(--color-rule)", "color.rule": "#b58b5a" };

  test("writes token values into page rules and margin boxes, following tokens that use tokens", () => {
    const out = inlinePageVariables(css, tokens);
    expect(out).toContain("size: A4;");
    expect(out).toContain("margin-top: 20mm;");
    expect(out).toContain("border-bottom: 1pt solid #b58b5a;");
    expect(out).toContain("@page chapter { size: A4 }");
  });

  test("leaves everything outside @page alone", () => {
    expect(inlinePageVariables(css, tokens)).toContain(".a { margin: var(--page-margin-top); }");
  });

  test("a change of the page size token changes the page rule", () => {
    expect(inlinePageVariables(css, { ...tokens, "page.size": "letter" })).toContain("size: letter;");
  });

  test("a token that does not exist, or that refers to itself, is an error", () => {
    expect(() => inlinePageVariables("@page { size: var(--page-size) }", {})).toThrow(/--page-size/);
    expect(() => inlinePageVariables("@page { size: var(--page-size) }", { "page.size": "var(--page-size)" })).toThrow(/refer to each other/);
  });

  test("css without page rules is returned unchanged", () => {
    expect(inlinePageVariables("p { color: red }", {})).toBe("p { color: red }");
  });
});
