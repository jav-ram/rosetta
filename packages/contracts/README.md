# @rosetta/contracts

The language-neutral contracts between Rosetta packages. Everything starts from the JSON Schemas in `schemas/`; the TypeScript types and Go structs are generated from them.

## Schemas

| Schema | Describes |
|---|---|
| `ast.schema.json` | `Document`: the AST the parser produces. `rosettaVersion`, a tree of `Node`s, and `warnings`. |
| `component-definition.schema.json` | `ComponentDefinition`: a component's form (block or leaf), kind (data, container or leaf), `breakable` flag, optional `scope` (a leaf that applies to the content after it, such as `layout`), attributes and fields. |
| `warning.schema.json` | `Warning`: stable `code`, severity, message and source range. |
| `position.schema.json` | `Position`: a source range. |
| `theme.schema.json` | `Theme`: a name, design `tokens` (font, color, border, spacing, texture, mask, page) and optional per-component overrides. |
| `manifest.schema.json` | `Manifest`: a project's `title`, `system`, `theme`, `cover` and the ordered list of `chapters`. In a `.rosetta` file this is `manifest.json`. |
| `chapter.schema.json` | `Chapter`: a manifest entry, with `id` (never changes), `title`, `start` (`next-page`, or `right-page`) and, from its last layout, `pages` (its page count) and `stale` (an earlier chapter changed since, so its page numbers may be out of date). The chapter's text is not part of it. |
| `asset-ref.schema.json` | `AssetRef`: `id`, `mediaType`, `size` and, when known, `name`, `width`, `height`. |
| `project-summary.schema.json` | `ProjectSummary`: `id`, `title` and `updatedAt`, what the projects list shows. |
| `index.schema.json` | Entry point listing all of the above, used for code generation. |

`Node` is one flat shape discriminated by `type` (heading, paragraph, directive, ...), so it maps cleanly to both languages. Directive nodes carry `name`, `form`, `kind`, `attributes` and, depending on the kind, `fields` (data), `children` (container) or `raw` (unknown component).

Rules that a type cannot express (for example "a block component must declare `breakable`; a leaf component must not") are in the schema as `if/then` and enforced by the validators.

## Exporting a book

`Exporter` (`exportBook(projectId, { onProgress, signal })` giving `{ pages, warnings }`, and `ExportError` with the codes `empty`, `cancelled` and `failed`) is how a whole project becomes a book to print or keep. `BrowserPrintExporter` implements it in v1. `findAsset(assets, src)` is how a chapter names an image: by file name or by id.

## Use

TypeScript:

```ts
import { validateDocument, type Document } from "@rosetta/contracts";

const result = validateDocument(json); // { valid, errors }
```

Go:

```go
doc, err := contracts.ValidateDocument(data) // validates, then decodes into contracts.Document
```

Both validators use the same schemas (the Go module embeds them).

## Project storage

`ProjectStore` (in `src/store.ts`) is the interface all app code uses to read and write projects: `listProjects`, `createProject`, `deleteProject`, `loadManifest`, `saveManifest`, `loadChapter`, `saveChapter`, `putAsset` (optionally under a chosen id, which importing a project needs), `listAssets` and `getAsset`. The rules every store follows are written on the interface. The main ones:

- A project is a manifest, the Markdown of each chapter the manifest lists, and assets. The manifest is the list of what exists: a chapter dropped from it loses its text, and renaming or reordering keeps it, because chapter ids never change.
- Stores return copies, and a save is complete when its promise resolves.
- Failures are a `ProjectStoreError` with the code `not-found` or `invalid` (a manifest that does not validate, with `validateManifest`, which also checks that chapter ids are unique).

### Store conformance suite

Any store can run the suite from `@rosetta/contracts/store-conformance`. It needs no test runner:

```ts
import { projectStoreCases } from "@rosetta/contracts/store-conformance";

for (const c of projectStoreCases({ create: async () => new MyStore() })) test(c.name, c.run);
```

Give the factory a `reopen(store)` that closes the store and opens it again on the same data, and the suite also checks that nothing was lost. `test/memory-store.ts` is a simple in-memory store that passes it, and `test/store.test.ts` checks that the suite fails for stores that break a rule.

## Generated code

`src/generated/types.ts` and `types_gen.go` are generated and committed. Do not edit them.

```bash
pnpm --filter @rosetta/contracts generate
```

CI runs `pnpm check:generated`, which regenerates and fails if the committed files differ. Change a schema, regenerate, and commit both.

## Conformance suite

`conformance/` is the golden test suite any parser can run: Markdown inputs, expected HTML and expected warnings, plus a Go runner. See [conformance/README.md](conformance/README.md).

## Examples

`examples/` holds a sample AST and component definition (valid) and invalid ones. Both languages' tests use the same files.
