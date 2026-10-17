# @rosetta/preview

## 0.4.0

### Minor Changes

- ab33ba8: Chapter start rules: `render({ startPage, startOn })` in the preview. A chapter that starts on a right-hand page gets a blank page before it when it would start on a left-hand one, and page numbers count from the chapter's first book page. The theme styles blank pages (`@page :blank`: no header, no page number). Chapters get a "start on a right-hand page" toggle (manifest `start`).

### Patch Changes

- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
  - @rosetta/contracts@0.9.0

## 0.3.3

### Patch Changes

- aad20f5: Columns fill one after the other instead of being balanced: content no longer moves to the right column while the left one has room (statblocks in the two-column layout). The preview marks laid-out pages with `rosetta-filled` (`FILL_COLUMNS_SCRIPT`) and the theme fills those pages' columns in order.

## 0.3.2

### Patch Changes

- Updated dependencies [e23941b]
  - @rosetta/contracts@0.8.0

## 0.3.1

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0

## 0.3.0

### Minor Changes

- 825d22d: Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.

## 0.2.0

### Minor Changes

- 2d5f42f: Flow and breakability: the Classic theme keeps unbreakable components, images, list items and table rows whole (driven by `data-breakable`), keeps headings with what follows, and takes orphans and widows from tokens. The preview repeats a table's header row when the table continues on a new page. A chapter of test pages (`theme-classic/test-pages/flow.md`) covers every case.

## 0.1.0

### Minor Changes

- a660f26: Paged.js preview: `createPreview` in `@rosetta/preview` shows the chapter as pages in an iframe (new pages swap in when ready, scroll kept, missing images get a placeholder), and the app's preview pane uses it with the Classic theme.

## 0.0.6

### Patch Changes

- Updated dependencies [bd30a2f]
  - @rosetta/contracts@0.6.0

## 0.0.5

### Patch Changes

- Updated dependencies [e823b89]
  - @rosetta/contracts@0.5.0

## 0.0.4

### Patch Changes

- Updated dependencies [0e3720d]
  - @rosetta/contracts@0.4.0

## 0.0.3

### Patch Changes

- Updated dependencies [e8a3e4e]
  - @rosetta/contracts@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [00c4b27]
  - @rosetta/contracts@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies [8135000]
  - @rosetta/contracts@0.1.0
