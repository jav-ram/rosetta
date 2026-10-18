# Benchmark book generator

Generates the large test books used to measure Rosetta: a 100-page and a 300-page book, each a project folder (`manifest.json`, `chapters/`, `assets/originals`, `assets/previews`) with placeholder art and every component defined so far.

```bash
pnpm --filter @rosetta/benchmark-book generate          # writes tools/benchmark-book/out/book-100 and book-300
node tools/benchmark-book/src/cli.mjs --out some/dir    # somewhere else
node tools/benchmark-book/src/cli.mjs --rosetta         # also book-100.rosetta and book-300.rosetta
```

The `.rosetta` files are the same books in the format Rosetta imports (Import… on the projects screen), so they can be opened in the app, laid out in the preview and exported as PDF. Chapters refer to the illustrations by file name (`ill-001.svg`).

The output is deterministic (fixed seed) and git-ignored, so it is regenerated rather than committed.

Page counts are estimates from a words-per-page model. The real count is known only once the preview exists.

## Measuring the PDF export

`src/export-benchmark.mjs` exports the books the way the app does, in a headless Chrome that it starts and drives, and prints the times and memory as tables (the results are in `docs/benchmarks.md`).

```bash
node tools/benchmark-book/src/cli.mjs --rosetta --raster            # the books, with placeholder SVGs and with 300 dpi PNG art
pnpm cf:build && pnpm cf:preview                                      # in another terminal: the app, as it is served
node tools/benchmark-book/src/export-benchmark.mjs --url http://127.0.0.1:8787 \
  --book tools/benchmark-book/out/book-100.rosetta --book tools/benchmark-book/out/book-300.rosetta --runs 3
```

For each book it starts a new Chrome, imports the file, and clicks PDF on the project three times (the first run is cold, the others warm). The print dialog cannot be driven, so a run is measured up to the moment the dialog would open (reading, converting, loading the original images, laying out the whole book); then Chrome's own print engine (`Page.printToPDF`) makes the PDF from the laid-out pages, which gives the time to print, the size and the page count. Memory is the page's JavaScript heap and the resident memory that the export adds to Chrome's processes (resident memory counts shared pages in every process, so only the difference is meaningful). Options: `--runs N`, `--chrome <path>` (or `CHROME`), `--json <file>`, `--background` (a second tab is put in front, to see what a tab in the background costs). It needs Node 22 (the `WebSocket` global) and Chrome; nothing is installed.

## Extending it

- **New component:** add a generator for it in `src/blocks.mjs` (`components`). The test fails until you do, and checks that the generated chapters parse with no warnings and use it.
- **New page template** (`::layout`, `::page`, M2): add it to the recipes in `src/generate.mjs`.
- The folders keep the provisional layout (`manifest.json` with `file` per chapter); `src/rosetta.mjs` turns a book into the real `.rosetta` layout.
