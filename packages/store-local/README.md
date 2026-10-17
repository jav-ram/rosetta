# @rosetta/store-local

`LocalStore`: the `ProjectStore` (see `@rosetta/contracts`) in the browser's IndexedDB. plus `.rosetta` files: a whole project in one zip (`exportProject`, `importProject`).

```ts
import { openLocalStore } from "@rosetta/store-local";

const store = await openLocalStore(); // the database "rosetta"; { name } for another
const { id } = await store.createProject({ rosettaVersion: "0.1", title: "My book", chapters: [{ id: "intro", title: "Introduction" }] });
await store.saveChapter(id, "intro", "# Introduction\n");
store.close(); // when done; open it again with openLocalStore
```

## `.rosetta` files

```ts
import { exportProject, importProject } from "@rosetta/store-local";

const bytes = await exportProject(store, projectId);      // Uint8Array: the file
const summary = await importProject(otherStore, bytes);   // a new project, from the file
```

Both work on any `ProjectStore`, not only `LocalStore`. A file is a zip:

```
manifest.json                  the manifest as stored (chapter ids, titles, start rules, page counts, cover)
chapters/01-introduction.md    each chapter's Rosetta Markdown, in book order
assets/assets.json             the assets, as AssetRefs
assets/originals/<id>.<ext>    the bytes of each asset
```

- A chapter's file is the one whose **number** is its position in the manifest; the rest of the name (the slug of its title) is only for people. Chapter ids, and so text and settings, survive without being in file names.
- Importing makes a **new project** (new id) and keeps chapter and asset ids. If the file is wrong (not a zip, no manifest, a missing chapter or asset, ...) the file is checked before anything is written, a `RosettaFileError` says what, and nothing is left behind; if the store fails part way the project is removed again.
- The same project always gives the same bytes (fixed file dates), so exporting an imported file gives the file back.
- Preview copies of images are not in the file; they are made from the originals. A file may unpack to at most 1 GB.

## How it is stored

One database with three object stores: `projects` (the manifest and `updatedAt`, by id), `chapters` (the text of each chapter that has been saved, by project and chapter id) and `assets` (the bytes and the reference, by project and asset id). The manifest says which chapters exist, so a chapter with no saved text reads as empty, and saving a manifest that drops a chapter deletes its text.

- Every call is one transaction: a save is all there or not at all, and its promise resolves once the browser has committed it.
- Ids are `crypto.randomUUID()`.
- Assets are kept as bytes (not as a `Blob`, which some browsers do not store reliably). The preview of an asset is the original until previews are generated (M4).
- The database is version 1; a later change to its shape adds a migration in `onupgradeneeded`.

## Tests

`test/local-store.test.ts` runs the `ProjectStore` conformance suite, including the cases after reopening, against `fake-indexeddb`. The same suite was also run against Chrome's IndexedDB (see the decision log, T3.2).

## Development

```bash
pnpm --filter @rosetta/store-local test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
