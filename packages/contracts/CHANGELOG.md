# @rosetta/contracts

## 0.10.0

### Minor Changes

- 079a5da: `figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
- 079a5da: Images: add them with a button or by dropping files, and the editor makes a smaller preview copy of each in a worker. `ProjectStore` gets `setAssetPreview`, and the preview of an asset is its original until one is set.
- 079a5da: `page` templates `art-top` and `art-bottom`, with an optional `height` (a length or a percentage of the page): a band of art across the top or the bottom of the page, and the text that follows flows in the rest of it. The theme's default height is the token `page.art-height`.
- 079a5da: `page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.
- 079a5da: Two-page spreads: `side="left"` on a `page` makes it a left-hand page, with a blank page before it when needed (also at the start of a chapter). The preview reports two or more pages of full art in a row whose first page is a right-hand page, so they do not face each other; the app lists the warning with the book's page numbers and marks the page in the editor.

## 0.9.0

### Minor Changes

- ab33ba8: Page numbers across chapters: a chapter's page count from its last layout (`pages`) and whether it may be out of date (`stale`) are stored in the manifest. The preview numbers a chapter from the pages of the ones before it, and the chapter list shows each chapter's pages, flagged when they may be out of date.
- ab33ba8: `.rosetta` import and export: a whole project in one zip (`exportProject`, `importProject`, with `fflate`), saved with the File System Access API where available (otherwise downloaded) and imported from a file input. `ProjectStore` gains `listAssets` and `putAsset(..., { id })`. The projects screen has Export and Import; the editor has Export.

## 0.8.0

### Minor Changes

- e23941b: Project storage contracts: JSON Schemas and generated types for `Manifest`, `Chapter`, `AssetRef` and `ProjectSummary` (TypeScript and Go, with `validateManifest` / `ValidateManifest`), the `ProjectStore` interface with `ProjectStoreError`, and a runner-agnostic `ProjectStore` conformance suite at `@rosetta/contracts/store-conformance`.

## 0.7.0

### Minor Changes

- ab06f42: `::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.

## 0.6.0

### Minor Changes

- bd30a2f: Theme token system: `theme.schema.json` (with `Theme` types in TypeScript and Go, and `validateTheme`) and `compileTheme` / `resolveTokens` in `theme-engine`, with the component → book → theme cascade.

## 0.5.0

### Minor Changes

- e823b89: AST: lists have `tight`, the document has `frontMatterRaw`, directives have `attributesRaw`, and data components keep `raw` next to `fields`, so a document can be saved back without losing anything. Three new golden cases.

## 0.4.0

### Minor Changes

- 0e3720d: Compile the parser to WebAssembly (`parser-wasm`) with a typed `parse(markdown) -> { html, ast, warnings }` client; the golden suite passes through it. The parser now returns the AST in the contracts Document shape. Contracts compiles its JSON Schemas lazily (no work at import time) and `M1Components()` no longer validates on every call. Contracts gets a Node-only `@rosetta/contracts/conformance` entry so TypeScript parsers can run the golden suite.

## 0.3.0

### Minor Changes

- e8a3e4e: Add the golden conformance suite to contracts (39 Markdown/HTML pairs with expected warnings, and a Go runner with -update). The parser now handles YAML front matter (preserved, never rendered, line numbers unchanged), reports nested missing fields on the right line, and uses a library-independent message for invalid YAML. Spec: front matter rules and the frontmatter.syntax warning.

## 0.2.0

### Minor Changes

- 00c4b27: Render the M1 components (statblock, readaloud, sidebar, pagebreak) to HTML from component definitions, with a breakability data attribute and warnings for invalid fields and attributes. Add the temporary M1 component definitions to contracts (`M1Components()` in Go, `m1Components` in TypeScript). The directive extension no longer has built-in components.

## 0.1.0

### Minor Changes

- 8135000: Add JSON Schemas for the AST, component definitions, warnings and positions, with generated TypeScript types and Go structs and validators in both languages.
