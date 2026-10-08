# @rosetta/parser-wasm

The Rosetta parser compiled to WebAssembly, plus a typed TypeScript client that runs it in a Web Worker so parsing never blocks the main thread.

## Use it from the browser (worker client)

```ts
import { createParser } from "@rosetta/parser-wasm";

const parser = createParser({
  workerUrl: "/dist/worker.js",       // or `worker: () => new Worker(...)`
  wasmUrl: "/dist/rosetta.wasm",
  wasmExecUrl: "/dist/wasm_exec.js",  // the one built together with the .wasm
});

const { html, ast, warnings } = await parser.parse("# Hi\n\n:::readaloud\nA door groans open.\n:::\n");
```

| Call | What it does |
|---|---|
| `parse(markdown)` | Parses in the worker. Resolves with `{ html, ast, warnings }`. Bad input never rejects: problems are warnings. |
| `setComponents(definitions)` | Replaces the component definitions (the temporary M1 set is the default). Rejects if one is invalid. |
| `ready()` | Loads the worker and module now, for example while the app starts, instead of on the first `parse`. |
| `terminate()` | Stops the worker. The next call starts a new one. |

**Lazy loading:** `createParser` does nothing. The worker, `wasm_exec.js` and the ~2 MB module are fetched on the first `parse`, `setComponents` or `ready` call. Calls made while it loads wait for it, and are answered in order. If loading fails (wrong URL, script error) the waiting calls reject, and the next call tries again with a fresh worker.

The JSON from the module is parsed inside the worker, so the main thread only receives the finished object.

**With Vite** (used by `packages/app`, in both `vite dev` and the production build):

```ts
import ParserWorker from "@rosetta/parser-wasm/worker?worker";
import wasmUrl from "@rosetta/parser-wasm/wasm?url";
import wasmExecUrl from "@rosetta/parser-wasm/wasm_exec?url";

const parser = createParser({ worker: () => new ParserWorker(), wasmUrl, wasmExecUrl });
```

**Try it:** `pnpm --filter @rosetta/parser-wasm demo` serves `demo/index.html` at http://localhost:5173/demo/. It parses a document and shows how long the main thread went without running a timer while a large document is parsed, in the worker and on the main thread, for comparison.

## Use it without a worker

```ts
import { instantiate } from "@rosetta/parser-wasm";

// wasm_exec.js (from dist/, built together with the module) must be loaded first.
const parser = await instantiate(wasmBytesOrModule);
const { html, ast, warnings } = parser.parse("# Hi");
```

This is the synchronous API the worker uses, and it is handy in Node and in tests. It blocks the thread it runs on. Each `instantiate` call starts its own copy of the module.

### Results

| Result | What it is |
|---|---|
| `html` | The rendered document. Warnings are shown in place. |
| `ast` | The document tree in the shape of the contracts `Document` schema. The editor loads this. |
| `warnings` | Every warning, in source order. |

## Build

```bash
pnpm --filter @rosetta/parser-wasm build:wasm
```

Writes `dist/rosetta.wasm`, the matching `dist/wasm_exec.js`, and `dist/build-info.json` (compiler and size). `pnpm --filter @rosetta/parser-wasm build:js` bundles the client and worker into plain ES modules (`dist/index.js`, `dist/worker.js`) that a browser can load without a build tool. `dist/` is not committed. It builds with standard Go (about 7 MB, 2 MB gzipped). TinyGo is not used: it is about 4x smaller but crashes on invalid YAML, because its wasm target has no `recover()`. Sizes and the details are in [docs/benchmarks.md](../../docs/benchmarks.md).

`wasm_exec.js` differs between Go and TinyGo, so always use the one from the same build as the `.wasm` file.

## Tests

`pnpm --filter @rosetta/parser-wasm test` builds the module and the bundles, then runs:

- the golden suite from `@rosetta/contracts` through the synchronous API, and again through the worker client (every case's HTML and warnings must match);
- the client against a real Node worker thread: lazy loading, ordering, `setComponents`, failed start-up and retry, `terminate`;
- a test that a large document parsed in the worker does not block the main thread's timers, compared with parsing it in-thread.

The Go logic behind the module (`api/`) has native Go tests.

## How it works

`main.go` (compiled only for `js/wasm`) defines `globalThis.rosetta.parse` and `.setComponents`, which take and return strings (JSON), so they behave the same under Go and TinyGo. `src/index.ts` wraps them: it takes `rosetta` off the global scope after start-up, parses the JSON, and turns errors into exceptions. `src/worker-core.ts` is the worker's message loop (`serve`), `src/worker.ts` its browser entry, and `src/client.ts` the promise-based client. Messages are typed in `src/protocol.ts`.
