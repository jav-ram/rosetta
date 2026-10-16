import { compileTheme, inlinePageVariables, resolveTokens } from "@rosetta/theme-engine";
import type { Theme } from "@rosetta/contracts";
import themeJson from "@rosetta/theme-classic/theme.json";
import contentCss from "@rosetta/theme-classic/content.css?raw";
import pagesCss from "@rosetta/theme-classic/pages.css?raw";

const theme = themeJson as Theme;

/** The theme's tokens and how content looks. The editor uses this alone: no pages. */
export const screenCss = `${compileTheme(theme)}\n${contentCss}`;

/** The CSS of the book: the same, then pagination with the `@page` values written in. */
export const bookCss = `${screenCss}\n${inlinePageVariables(pagesCss, resolveTokens(theme))}`;

/** Puts the theme in the page, before the app's own styles so those can adjust it. */
export function installScreenTheme(): void {
  const style = document.createElement("style");
  style.id = "rosetta-theme";
  style.textContent = screenCss;
  document.head.prepend(style);
}
