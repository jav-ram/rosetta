import type { Theme } from "@rosetta/contracts";
import themeJson from "@rosetta/theme-classic/theme.json";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const theme = themeJson as Theme;
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** The theme token a --form-* variable is defined as, in the .rosetta-editor block. */
const formVar = (name: string) => {
  const token = new RegExp(`--form-${name}:\\s*var\\(--color-([a-z-]+)\\)`).exec(css)?.[1];
  expect(token, `--form-${name} is defined from a theme color`).toBeDefined();
  return theme.tokens[`color.${token}`]!;
};

describe("colors of what sits on the editor page (forms, header, dividers)", () => {
  test("they come from the theme's page, so they read the same in the app's dark and light mode", () => {
    expect(css).toMatch(/\.rosetta-editor \{[^}]*color-scheme: light/);
    // Rules for forms, the header and the dividers use --form-* variables, never the app's own palette.
    const rules = css.split("}").filter((r) => /\.rosetta-(form|component-header|component-name|pagebreak|layout)\b/.test(r.split("{")[0]!));
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) expect(rule, rule.trim().slice(0, 60)).not.toMatch(/var\(--(bg|panel|line|text|muted|accent)\)/);
  });

  test("text is readable on every background it sits on (WCAG AA, 4.5:1)", () => {
    const text = formVar("text");
    const muted = formVar("muted");
    for (const bg of [formVar("bg"), formVar("panel")]) {
      expect(contrast(text, bg), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, bg), `muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(formVar("accent"), formVar("bg")), "accent on page").toBeGreaterThanOrEqual(4.5);
  });
});
