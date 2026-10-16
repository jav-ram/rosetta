# @rosetta/theme-classic

## 0.3.0

### Minor Changes

- ab06f42: `::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.

## 0.2.1

### Patch Changes

- 825d22d: Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.

## 0.2.0

### Minor Changes

- 2d5f42f: Flow and breakability: the Classic theme keeps unbreakable components, images, list items and table rows whole (driven by `data-breakable`), keeps headings with what follows, and takes orphans and widows from tokens. The preview repeats a table's header row when the table continues on a new page. A chapter of test pages (`theme-classic/test-pages/flow.md`) covers every case.

## 0.1.0

### Minor Changes

- b806355: Base theme: `theme-classic` now has `theme.json` (A4, margins, two columns, fonts, colors, borders, spacing) and `theme.css` for the page furniture and every M1 component, written only with tokens and checked by a lint. `theme-engine` adds `inlinePageVariables` for `@page` rules.
