# Benchmarks

Measurements for decisions in the plan. Each section says what was measured, how, and on what.

## WebAssembly parser size (T0.6)

`packages/parser-wasm/dist/rosetta.wasm`, built with `pnpm --filter @rosetta/parser-wasm build:wasm`. The size of the last build is also written to `dist/build-info.json`.

| Compiler | Raw | Gzipped | Golden suite through the build |
|---|---|---|---|
| Go 1.26.5 (`GOOS=js GOARCH=wasm`, `-trimpath -ldflags="-s -w"`) | 7.38 MB | 1.96 MB | 86 of 86 tests pass |
| TinyGo 0.42.0 (`-target wasm -opt=z -stack-size=1mb -no-debug`) | 1.94 MB | 0.67 MB | 81 of 86 tests pass (see below) |

TinyGo is about 3.8x smaller (2.9x gzipped).

**Decision for now: standard Go only.** The build script has no TinyGo option, because the module it produces crashes on invalid input. The measurements below were taken with `tinygo build -o rosetta.wasm -target wasm -opt=z -no-debug -stack-size=1mb .` run in `packages/parser-wasm`.

### What was found trying TinyGo

TinyGo compiles the whole parser, and it works for everything except invalid YAML. Getting there needed three things:

1. **Stack size.** With TinyGo's default stack the module panics at start-up, because goldmark compiles many regular expressions when it loads and that recursion needs more stack. 256 KB still fails and 384 KB works; the build uses 1 MB. This does not change the file size. (The other GC modes tried, `precise` and `leaking`, did not help on their own.)
2. **The schema validator.** `contracts` compiled all its JSON Schemas when the package loaded, which panicked under TinyGo (a nil dereference inside the validator). They are now compiled on first use, and `contracts.M1Components()` no longer validates on every call (the Go tests validate the definitions instead). This helps every Go consumer, not only TinyGo. `setComponents` (which does validate) is covered by tests and passes under TinyGo.
3. **Invalid YAML still crashes the module.** `recover()` does not work in TinyGo's wasm target (checked with a 10-line program: `panic("x")` inside a function with a deferred `recover()` terminates the program). `yaml.v3` reports every error by panicking and recovering, so any data component with invalid YAML, and invalid front matter, ends in `RuntimeError: unreachable`, and the module cannot be used afterwards. These are the 5 failing tests: `errors/statblock-yaml-syntax` and `errors/front-matter-invalid` (HTML and warnings each) and the "bad input never throws" test.

**To use TinyGo**, the YAML body would have to be read without `yaml.v3`. The spec only needs a small subset (mappings, sequences, scalars, block scalars, comments, one level of flow collections), so a purpose-written reader is realistic, about a day of work including tests. The golden suite would catch differences. This is not part of T0.6; it is worth doing if the 2 MB vs 7 MB download matters, and the build script would then need a TinyGo path again (with the stack size above). Any other library that fails by panicking and recovering would have the same problem.

## WebAssembly parser speed (T0.6)

Node 22.12 on an Apple M1 Pro (macOS 26.4), calling `rosetta.parse` directly. Two runs of each; they differed by up to 30%, so read these as orders of magnitude.

| What | Go | TinyGo |
|---|---|---|
| Compile the module (`WebAssembly.compile`) | 7 to 8 ms | 2 to 5 ms |
| Start the runtime and `main` (`go.run`) | 54 to 73 ms | 38 to 46 ms |
| Parse a 419-byte document with all four M1 components (mean of 200 runs after a warm-up) | 0.6 to 0.9 ms | ~21 ms |
| Parse a 39,700-byte document of 100 such sections (mean of 10 runs after a warm-up) | 63 to 64 ms | 51 to 52 ms |

TinyGo starts faster and is a little faster on the large document, but about 30 times slower on the small one; I did not investigate why (garbage collection is the likely cause). Time includes HTML rendering, the AST and JSON encoding, but not `JSON.parse` on the JavaScript side. Browser numbers will differ.

## Main thread stays free (T0.7)

Parsing a large document in the Web Worker versus on the main thread. "Longest gap" is the longest time between two ticks of a 4 ms timer on the main thread while the parse ran: a timer cannot fire while the thread is busy, so a long gap is a frozen page.

**In a real browser** (the in-app Chromium of the Claude desktop app, `demo/index.html`, a document of 500 repeated M1 sections, 2,000 top-level nodes):

| Where it runs | Parse time | Longest gap on the main thread |
|---|---|---|
| Web Worker | 2.0 to 2.9 s | 34 ms |
| Main thread | 2.0 s | 2,151 ms |

**In Node** (a worker thread, an Apple M1 Pro, 500 sections), the test in `test/client.test.ts` measured about 1,080 ms blocked on the main thread against a 6 to 7 ms longest gap with the worker, on three runs.

The browser parse is slower than the Node figures; that pane is probably not running at full speed, so compare the two rows, not the absolute times. The worker parse also includes structured-cloning the result back to the main thread. The first call in a page also loads the module: a small document took 120 ms in one page load and 1,162 ms in another, so treat start-up time in that browser as unreliable.

## Editor typing with a 30-page chapter (T1.9)

The visual editor with a 30-page chapter: chapters 1 and 2 of `book-100` from the benchmark book generator joined into one (6,989 words, 39 KB, 134 top-level blocks including stat blocks, read-aloud boxes, sidebars, lists and page breaks). It was pasted into the Markdown tab of the app (`pnpm --filter @rosetta/app dev`) and the Visual tab was opened. In the in-app Chromium of the Claude desktop app (Chrome 152, Apple M1 Pro), measuring from the page with `performance.now()`. Medians of 5 to 20 runs; "keystroke" is one `view.dispatch(tr.insertText(..))`, which includes updating the DOM.

| What | 30 pages | 90 pages | 300 pages |
|---|---|---|---|
| Open the chapter: paste, parse in the worker, load into the editor, editable again | 316 ms | | |
| Parse in the worker, round trip (includes copying the result back to the main thread) | 13 ms | 50 ms | 326 ms |
| `fromAst` (parser AST to editor document) | 0.1 ms | 0.2 ms | 0.8 ms |
| `setDocument` (replace the document in the view) | 1 ms | 2.6 ms | 8.5 ms |
| One keystroke (middle of the chapter) | 0.5 to 0.9 ms | 1.4 ms | 3.8 ms |
| Save: `toMarkdown` of the whole chapter | 1 to 1.5 ms | 3.6 ms | 8 ms |

While typing 60 characters 60 ms apart, and then 20 characters 400 ms apart (so that a save and a parse happen after every key), at the start, middle and end of the chapter: the longest gap on the main thread was 8 to 16 ms (a 4 ms timer was never late by more than that), the browser reported no long task, and no keystroke took more than 3 ms of script. A real keystroke typed through the browser was handled in 3 ms.

**Result: no lag, and no fix was needed.** Nothing in the typing path grows with the chapter in a way that matters at this size: a keystroke only touches the node being edited, saving is debounced by 250 ms and costs about 1 ms, and parsing runs in the worker. Even a 300-page chapter in one document stays at a few milliseconds per keystroke. The first thing to give would be the parse at about 300 pages (a third of a second, off the main thread), which only delays the preview.

### What was not measured

- **Time until the screen is painted.** The browser pane in the desktop app reports itself as hidden while a script runs, which throttles painting: frames showed up 600 to 1,900 ms late even when the only change was setting an attribute on a paragraph, so those numbers say nothing about Rosetta and are not used. The numbers above are the script and main-thread time, which is what the code controls. Typing in a real browser window should be checked by hand once.
- **Pictures.** The generated chapters point at placeholder images that the app does not have yet (storage is M3), so they showed as broken images. Loading real images may change how much the page has to draw.
- **Other machines.** One laptop. The numbers have a lot of room, so this is not likely to matter.
