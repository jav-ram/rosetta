---
"@rosetta/contracts": minor
"@rosetta/preview": minor
"@rosetta/exporter-browser": minor
"@rosetta/app": minor
---

Export the whole book as a PDF through the browser's print dialog. `contracts` gets the `Exporter` interface, `ExportError` and `findAsset`; `preview` gets `buildBookDocument` and `createBookLayout` (the whole book as one Paged.js document, with the same art, table and column steps as the preview); `exporter-browser` gets `BrowserPrintExporter` (original-resolution images, progress, cancel); the app gets "Export PDF" in the editor and "PDF" on the projects list, with a window that shows what is happening.
