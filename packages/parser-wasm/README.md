# @rosetta/parser-wasm

The Rosetta parser compiled to WebAssembly, plus a typed TypeScript client. (The Web Worker that runs it off the main thread is T0.7.)

## API

```ts
import { instantiate } from "@rosetta/parser-wasm";

// wasm_exec.js (from dist/, built together with the module) must be loaded first.
const parser = await instantiate(wasmBytesOrModule);

const { html, ast, warnings } = parser.parse("# Hi\n\n:::readaloud\nA door groans open.\n:::\n");
```

| Result | What it is |
|---|---|
| `html` | The rendered document. Warnings are shown in place. |
| `ast` | The document tree in the shape of the contracts `Document` schema. The editor loads this. |
| `warnings` | Every warning, in source order. Bad input never throws; it comes back here. |

`parser.setComponents(definitions)` replaces the component definitions (the temporary M1 set is the default) with `ComponentDefinition`s from `@rosetta/contracts`. Each one is validated, and it throws if one is invalid. Definitions are data, so a system plugin's components work without rebuilding the module.

Each `instantiate` call starts its own copy of the module, so instances do not share state.

## Build

```bash
pnpm --filter @rosetta/parser-wasm build:wasm
```

Writes `dist/rosetta.wasm`, the matching `dist/wasm_exec.js`, and `dist/build-info.json` (compiler and size). `dist/` is not committed. It builds with standard Go (about 7 MB, 2 MB gzipped). TinyGo is not used: it is about 4x smaller but crashes on invalid YAML, because its wasm target has no `recover()`. Sizes and the details are in [docs/benchmarks.md](../../docs/benchmarks.md).

`wasm_exec.js` differs between Go and TinyGo, so always use the one from the same build as the `.wasm` file.

## Tests

`pnpm --filter @rosetta/parser-wasm test` builds the module and runs the golden suite from `@rosetta/contracts` through it: every case's HTML and warnings must match. It also tests the client API. The Go logic behind the module (`api/`) has native Go tests.

## How it works

`main.go` (compiled only for `js/wasm`) defines `globalThis.rosetta.parse` and `.setComponents`, which take and return strings (JSON), so they behave the same under Go and TinyGo. `src/index.ts` wraps them: it takes `rosetta` off the global scope after start-up, parses the JSON, and turns errors into exceptions.
