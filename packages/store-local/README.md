# @rosetta/store-local

`LocalStore`: the `ProjectStore` (see `@rosetta/contracts`) in the browser's IndexedDB. `.rosetta` import/export comes later (T3.7).

```ts
import { openLocalStore } from "@rosetta/store-local";

const store = await openLocalStore(); // the database "rosetta"; { name } for another
const { id } = await store.createProject({ rosettaVersion: "0.1", title: "My book", chapters: [{ id: "intro", title: "Introduction" }] });
await store.saveChapter(id, "intro", "# Introduction\n");
store.close(); // when done; open it again with openLocalStore
```

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
