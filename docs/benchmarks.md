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

## Paged.js preview (T2.3)

The app's preview pane (`@rosetta/preview`, Paged.js 0.4.3 in an iframe) with the Classic theme, A4, two columns. Chrome in the desktop app's browser pane, Apple M1 Pro. The text is the first six chapters of `book-100` joined (20,660 words, 14 images, stat blocks, read-aloud boxes, sidebars and tables), which lays out as **36 pages**; the first two chapters alone (6,989 words) are 12 pages.

| What | Time |
|---|---|
| Paged.js layout, 36 pages | 173–373 ms |
| Paged.js layout, 12 pages | about 100 ms |
| Paste the chapter in the Markdown tab → pages on screen | 689 ms |
| One edit in the Markdown tab → pages on screen | 393 ms |
| One keystroke in the Visual editor → pages on screen | 640 ms |

The last three include everything after the last edit: the editor's 250 ms save wait (Visual only), the parser's 150 ms wait, the parse (13–70 ms), the layout, and the swap. The goal was under 2 seconds for a 30-page chapter, so there is room for about three times the length.

### Two things that made it 10 to 100 times slower, both fixed

1. **Images that cannot load.** With the benchmark book's images missing (the app has no assets until M3), the same 12 pages took 3 to 4 seconds instead of 100 ms, because Paged.js waits for every image. The preview now shows a plain placeholder for any image that is not an absolute `http(s)`, `data` or `blob` URL (`resolveImage` lets M3 supply real ones).
2. **Frames that are not painted.** Paged.js lays out one page per animation frame and idle callback. When the browser does not paint the frame (a background tab, an unfocused or hidden pane), these slow to about one per second: the 36 pages took 20 to 26 seconds. Layout does not need frames, so inside the preview document both are replaced by a message-channel scheduler, which is not throttled. After that, the numbers above held with the pane hidden (`document.hidden` was true).

### Not measured

- A chapter with real images (they will load from the project's storage in M3).
- Other machines and browsers. Paged.js itself is not tied to Chrome, but only Chrome was tried.
- Chapters much longer than 36 pages (the layout time grows with the page count).


## Whole-book PDF export (T5.4)

Exporting the 100- and 300-page test books through the app's "Export PDF" (`BrowserPrintExporter`), measured with `tools/benchmark-book/src/export-benchmark.mjs` (see that tool's README): a headless Chrome 155 that the script starts, on an Apple M1 Pro with 16 GB (macOS 27.0.1), against the **production build** of the app served by `pnpm cf:preview` (the same files and headers as the live site). For each book a new Chrome opens the app, the `.rosetta` file is imported, and PDF is clicked three times: the first run is **cold** (a new browser, the parser not yet started), the other two are **warm**. The print dialog cannot be driven, so a run is timed up to the moment the dialog would open. After the last run the laid-out pages are printed with Chrome's own print engine (`Page.printToPDF`, the engine behind Save as PDF), which gives the time to make the PDF, its size and its page count; in every case the PDF has exactly as many pages as the layout.

**The books.** The generator's "100" and "300" are targets from a words-per-page estimate; the real page counts are **71** and **211** (the cover and the blank page behind it included). Each has been made twice: with the small placeholder SVGs that the generator has always written, and (`--raster`) with **PNG illustrations the size of an A4 page at 300 dpi, 3.7 MB each**, which is what the plan's "about 150 illustrations" costs with real art.

| Book | Pages | Images | Originals (file) |
|---|---|---|---|
| 100, placeholder SVGs | 71 | 48 | 0.04 MB |
| 300, placeholder SVGs | 211 | 143 | 0.12 MB |
| 100, 300 dpi art | 73 | 48 | 179 MB |
| 300, 300 dpi art | 214 | 143 | 533 MB |

### Results

"Ready to print" is everything the app does before the print dialog opens: read the chapters, convert them with the parser, load the **original** of every image, lay the whole book out, and wait for every image. "Heap" is the JavaScript heap of the page at its peak. "Chrome, added" is what the export adds to the resident memory of all Chrome processes (resident memory counts shared pages in every process, so the absolute figure, 1.4 to 2.4 GB with the app open, means little and the figure here is rounded and varies between runs).

| Book | Run | Ready to print | Heap peak | Chrome, added |
|---|---|---|---|---|
| 100, SVG | cold | 1.07 s | 16 MB | 115 MB |
| 100, SVG | warm | 0.67 to 0.73 s | 16 to 21 MB | 220 to 390 MB |
| 300, SVG | cold | 2.84 s | 26 MB | 420 MB |
| 300, SVG | warm | 2.52 to 2.64 s | 28 to 30 MB | 460 MB |
| 100, 300 dpi art | cold | 1.51 s | 234 MB | 670 MB |
| 100, 300 dpi art | warm | 1.06 to 1.13 s | 224 to 240 MB | 620 to 700 MB |
| 300, 300 dpi art | cold | 3.88 s | 596 MB | 660 MB |
| 300, 300 dpi art | warm | 3.24 to 3.62 s | 609 to 614 MB | 580 to 725 MB |

**Making the PDF** (Chrome's print engine on the laid-out book):

| Book | PDF time | PDF size | Pages | Chrome, added |
|---|---|---|---|---|
| 100, SVG | 0.40 s | 1.0 MB | 71 | 440 MB |
| 300, SVG | 0.84 s | 2.6 MB | 211 | 680 MB |
| 100, 300 dpi art | **21.8 s** | 168 MB | 73 | 1.0 GB |
| 300, 300 dpi art | **65.6 s** | 499 MB | 214 | 510 MB |

**Failures: none.** No crash, no missing image, no wrong page count, in any run. A 533 MB book imported (31 s, against a 4 s import for the 179 MB one; the importer reads the whole file into memory) and exported on a 16 GB laptop.

### What the numbers say

1. **Laying out is cheap and linear: about 11 ms per page** (71 pages in 0.65 s, 211 pages in 2.4 s), the same with and without real images. Reading and converting 20 chapters takes 0.1 to 0.5 s. Loading the originals into memory is 0.7 s for 533 MB. Nothing here is a reason to leave the browser.
2. **Making the PDF is what grows, with the size of the originals**: about **0.45 s per 3.7 MB illustration** (21.8 s for 48, 65.6 s for 143), and the PDF is as big as the originals (168 and 499 MB). The page text costs almost nothing (the placeholder books: 0.4 and 0.8 s). That time is spent after "Save" is chosen in the print dialog, where the page shows no progress of its own.
3. **Memory follows the originals too**: the page's JavaScript heap is about 1.1 to 1.3 times the size of the originals (234 MB for 179 MB, 600 MB for 533 MB), because every original is held as a blob while the book is laid out. Chrome had room on this machine; a machine with less memory, or a book with a gigabyte of art (the `.rosetta` importer's limit), was not tried.
4. **A tab that is in the background lays out 12 to 15 times slower.** The same 100-page book took 9 to 15.7 s with another tab in front, against 0.7 to 1.1 s. Paged.js's own scheduling is already moved off animation frames (T2.3), and a message channel is not throttled, but `setTimeout` took 870 ms per call in the same page and `requestAnimationFrame` never ran. The cause inside the layout was not found (it is not the images: 8.6 s without any). The export window now asks to keep the tab open and in front.
5. **The generator's page counts are estimates**: "100" is 71 pages and "300" is 211 (about 0.7 of the target). A real 300-page art book would be about 1.4 times the figures here: roughly 5 s to be ready, 95 s to make the PDF, 750 MB of heap, a 700 MB PDF.

### Recommendation: when to start the backend

The browser export meets the budgets in the plan: the **100-page book exports reliably** (1 s to be ready; 22 s to make a 168 MB PDF with real art), and the **300-page result is recorded**: it works, in 4 s plus about a minute of Chrome making the PDF. **Do not start the backend because of speed or memory up to this size.** Start it when any of these happens, most likely first:

1. **Anyone needs print-shop output** (CMYK, PDF/X, bleed, a spine). A browser cannot make these at any size; this is the plan's own trigger and the first one that is certain to come.
2. **A real book has more than about 500 MB of original images (about 150 full-page 300 dpi illustrations) or takes more than a minute or two to save as PDF.** The measurements are linear, so a 300-page art book is at this edge already: 65 s, 500 MB, 600 MB of heap on a 16 GB machine. This is the "too slow" trigger in the plan, with a number. Before building a server, a cheaper step exists: a **proof export that uses the editor's 1600 px preview copies** instead of the originals, which should make the PDF far smaller and faster; it was not built or measured here.
3. **A user reports the tab failing or the machine running out of memory**, or exports on a machine with less memory than this one (not tested). Nothing failed here up to 533 MB of originals and 214 pages.
4. **Accounts, sync, sharing or collaboration are wanted** (not a performance reason).

What a backend gives that the browser cannot, and the measurements make plain: **the chapters printed in parallel and cached** (so fixing one chapter does not repeat the minute), a PDF that does not need the page open and in front, and no print dialog to click through each time.

### Not measured

- **The print dialog itself** and the time to click through it; the numbers are the same engine without it (`Page.printToPDF`).
- **Chrome with a window and a screen**; the headless Chrome is the same engine, but a visible one paints. **Other browsers** (Firefox, Safari) and **other machines**, in particular **less than 16 GB of memory**.
- **Books with more than a gigabyte of originals**, and JPEG art (the illustrations are PNGs; JPEG would make the files smaller and Chrome's PDF engine can embed it without re-encoding, so the PDF time is probably lower).
- **Why a background tab is so slow** (point 4).
- **Fonts**: the theme uses system fonts only. A book with large embedded fonts or textures (the plan's PDF-size risk) was not made.
