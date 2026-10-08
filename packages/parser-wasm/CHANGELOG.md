# @rosetta/parser-wasm

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
