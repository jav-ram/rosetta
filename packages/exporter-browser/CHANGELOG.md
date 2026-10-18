# @rosetta/exporter-browser

## 0.1.0

### Minor Changes

- 7ec5430: Export the whole book as a PDF through the browser's print dialog. `contracts` gets the `Exporter` interface, `ExportError` and `findAsset`; `preview` gets `buildBookDocument` and `createBookLayout` (the whole book as one Paged.js document, with the same art, table and column steps as the preview); `exporter-browser` gets `BrowserPrintExporter` (original-resolution images, progress, cancel); the app gets "Export PDF" in the editor and "PDF" on the projects list, with a window that shows what is happening.
- 7ec5430: Front cover in the PDF export: the first page, with the book's title (or the one set for the cover) over a picture chosen from the project's images, or on a plain color, followed by a blank page so that the first chapter is page 1 on a right-hand page. Neither is numbered or counted. Set it with Cover… in the editor's top bar. The book layout accepts a `cover`, and the exporter reads it from the manifest.

### Patch Changes

- Updated dependencies [7ec5430]
- Updated dependencies [7ec5430]
  - @rosetta/contracts@0.11.0

## 0.0.10

### Patch Changes

- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
  - @rosetta/contracts@0.10.0

## 0.0.9

### Patch Changes

- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
  - @rosetta/contracts@0.9.0

## 0.0.8

### Patch Changes

- Updated dependencies [e23941b]
  - @rosetta/contracts@0.8.0

## 0.0.7

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0

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
