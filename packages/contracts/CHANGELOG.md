# @rosetta/contracts

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
