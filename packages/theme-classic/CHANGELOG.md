# @rosetta/theme-classic

## 0.2.0

### Minor Changes

- 2d5f42f: Flow and breakability: the Classic theme keeps unbreakable components, images, list items and table rows whole (driven by `data-breakable`), keeps headings with what follows, and takes orphans and widows from tokens. The preview repeats a table's header row when the table continues on a new page. A chapter of test pages (`theme-classic/test-pages/flow.md`) covers every case.

## 0.1.0

### Minor Changes

- b806355: Base theme: `theme-classic` now has `theme.json` (A4, margins, two columns, fonts, colors, borders, spacing) and `theme.css` for the page furniture and every M1 component, written only with tokens and checked by a lint. `theme-engine` adds `inlinePageVariables` for `@page` rules.
