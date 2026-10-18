# @rosetta/exporter-browser

`BrowserPrintExporter`: the whole book as a PDF, through the browser's print dialog. Implements `Exporter` from `@rosetta/contracts`.

```ts
const exporter = new BrowserPrintExporter({
  store,                                   // a ProjectStore
  parse: (markdown) => parser.parse(markdown),   // Rosetta Markdown in, HTML out
  createLayout: () => createBookLayout(document.body, { pagedUrl }),   // from @rosetta/preview
  css: bookCss,                            // the theme's CSS
});
await exporter.exportBook(projectId, { onProgress, signal }); // { pages, warnings }
```

What it does, in order: reads every chapter, converts each with the parser, reads the **original** images the book uses (not the preview copies), lays the whole book out as one document in a frame that is off the screen (with a front cover as the first page, followed by a blank page, when the project's manifest has a `cover`), waits until every image has loaded, then opens the print dialog, where "Save as PDF" makes the file. Progress is reported for each stage; the `signal` cancels (until the print dialog is open); problems that do not stop the export (an image that is not in the project and is printed as a placeholder, components taller than a column) come back in `warnings`. Failures are `ExportError`s with the code `empty`, `cancelled` or `failed`.

The package imports only `@rosetta/contracts`, so the parser, the theme and the layout are given to it; the app composes them.

## Development

```bash
pnpm --filter @rosetta/exporter-browser test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
