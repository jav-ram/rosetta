# @rosetta/parser-wasm

## 0.3.1

### Patch Changes

- Updated dependencies [7ec5430]
- Updated dependencies [7ec5430]
  - @rosetta/contracts@0.11.0

## 0.3.0

### Minor Changes

- 079a5da: `figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
- 079a5da: `page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.

### Patch Changes

- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
  - @rosetta/contracts@0.10.0

## 0.2.5

### Patch Changes

- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
  - @rosetta/contracts@0.9.0

## 0.2.4

### Patch Changes

- Updated dependencies [e23941b]
  - @rosetta/contracts@0.8.0

## 0.2.3

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0

## 0.2.2

### Patch Changes

- Updated dependencies [bd30a2f]
  - @rosetta/contracts@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [e823b89]
  - @rosetta/contracts@0.5.0

## 0.2.0

### Minor Changes

- 6b2c695: Add the Web Worker and a promise-based TypeScript client (`createParser`) with lazy loading: nothing is fetched until the first call. Calls are answered in order, a failed start-up rejects and retries on the next call, and `terminate()` stops the worker. Includes bundled ES modules for browsers (`dist/index.js`, `dist/worker.js`) and a demo page.

## 0.1.0

### Minor Changes

- 0e3720d: Compile the parser to WebAssembly (`parser-wasm`) with a typed `parse(markdown) -> { html, ast, warnings }` client; the golden suite passes through it. The parser now returns the AST in the contracts Document shape. Contracts compiles its JSON Schemas lazily (no work at import time) and `M1Components()` no longer validates on every call. Contracts gets a Node-only `@rosetta/contracts/conformance` entry so TypeScript parsers can run the golden suite.

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
