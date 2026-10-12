import { compileTheme, inlinePageVariables, resolveTokens } from "@rosetta/theme-engine";
import type { Theme } from "@rosetta/contracts";
import themeJson from "@rosetta/theme-classic/theme.json";
import themeCss from "@rosetta/theme-classic/theme.css?raw";

const theme = themeJson as Theme;

/** The CSS of the book: the theme's tokens, then its rules with the `@page` values written in. */
export const bookCss = `${compileTheme(theme)}\n${inlinePageVariables(themeCss, resolveTokens(theme))}`;
