# Rosetta — v1 Plan (Browser-Only)

## Vision

Rosetta is a WYSIWYG editor for tabletop RPG content. Authors write in a superset of Markdown, which means all standard Markdown plus custom TTRPG components such as stat blocks, read-aloud text and sidebars. They see a paginated, print-styled preview and export the result as a PDF.

Rosetta targets **full game systems and books**, not only homebrew snippets: core rulebooks, campaigns and sourcebooks of **300+ pages** with covers and heavy art.

## Goal of this version

v1 runs **entirely in the browser**, with no server. It proves the editor, the component system, the preview and the export pipeline with real users at low cost.

> **v1 is a stepping stone, not the final architecture.** Reliably handling large books (300+ pages, art-heavy, print-ready) requires a backend that renders chapters in parallel, caches them and merges the results. v1 is built so that adding that backend means adding new implementations behind existing interfaces, **not rewriting the editor**.

### In scope for v1

- Editing books made of multiple chapters, one chapter at a time
- Rosetta Markdown superset with a first set of components
- Live paginated preview of the current chapter
- Local storage of projects, plus import and export as a single file
- Image import with preview-sized copies
- Whole-book PDF export through the browser's print dialog
- One theme and one game system to start

### Out of scope for v1

- **User-built custom themes** (see Custom themes). v1 ships one built-in theme, but it is built so custom themes can be added without reworking components.
- Fast or automated export of very large books
- Accounts, cloud sync, sharing and collaboration
- Print-shop output: CMYK, PDF/X, cover with spine and bleed
- Server-side asset processing

## Architecture

### Overview

| Layer | v1 (browser) | Later (with backend) |
|---|---|---|
| Parsing | Goldmark + Rosetta extensions compiled to WebAssembly, in a Web Worker | Same Go code, also running on the server |
| Editing | Tiptap (ProseMirror), one chapter loaded at a time | Unchanged |
| Preview | Paged.js in an iframe, current chapter only | Unchanged |
| Storage | `LocalStore`: IndexedDB, plus `.rosetta` file import/export | `ApiStore`: Postgres + object storage |
| Assets | Preview copies generated in the browser | Server asset pipeline with print-resolution checks |
| Export | `BrowserPrintExporter`: whole book through the print dialog | `ServerExporter`: parallel per-chapter rendering, caching, merging |

### The seams that make the backend easy

Two interfaces are defined in v1 and **all app code goes through them**. Nothing in the editor talks to IndexedDB or the print dialog directly.

```ts
interface ProjectStore {
  listProjects(): Promise<ProjectSummary[]>
  loadManifest(projectId: string): Promise<Manifest>
  saveManifest(projectId: string, manifest: Manifest): Promise<void>
  loadChapter(projectId: string, chapterId: string): Promise<string>  // Rosetta Markdown
  saveChapter(projectId: string, chapterId: string, source: string): Promise<void>
  putAsset(projectId: string, file: Blob): Promise<AssetRef>
  getAsset(projectId: string, ref: AssetRef, variant: "preview" | "original"): Promise<Blob>
}

interface Exporter {
  exportBook(projectId: string, options: ExportOptions): Promise<ExportResult>
}
```

v1 ships `LocalStore` and `BrowserPrintExporter`. The backend later adds `ApiStore` and `ServerExporter`.

### Shared core

These are used by both the browser and, later, the server:

1. **Rosetta spec.** The Markdown superset, written down as a document.
2. **Golden test suite.** Sample Rosetta Markdown files with their expected HTML output. Any change to parsing must keep these passing. This is what prevents the editor and the future server export from drifting apart.
3. **System plugins.** Per-system component schemas and templates.
4. **Themes.** CSS packages for screen and print, plus fonts.

## Repository and packages

Rosetta is a **monorepo of independent packages**. The goal is to make open-source collaboration and forks easy: anyone can replace one package, such as the components of a game system, a theme, or the storage layer, without breaking the others.

### Rules

1. **Packages only communicate through contracts.** A package may depend on `contracts` and on outside libraries, never on another Rosetta package's code. The only exception is `app`, which wires packages together.
2. **Contracts are language-neutral.** Every interface between packages is defined as a JSON Schema in `contracts`. TypeScript types and Go structs are generated from it, so the Go parser and the TypeScript packages can never disagree.
3. **Plugins and themes are data, not code.** A system plugin is a package of schemas and templates; a theme is a package of tokens and assets. The parser and editor load them at runtime through the contracts, so a fork can ship its own components without touching the parser or the editor.
4. **One renderer for components.** Component templates are rendered only by the parser. The editor asks the parser worker to render a component instead of keeping its own copy of the templates, so there is never a second implementation to keep in sync.
5. **Conformance suites, not just unit tests.** `contracts` ships test suites that any implementation can run: the golden test suite for parsers, and a `ProjectStore` suite for storage. A fork that passes them is compatible.
6. **Boundaries are enforced.** A lint rule (dependency-cruiser) fails CI if a package imports another package's internals.
7. **Only `app` uses a UI framework.** `editor` is built on Tiptap's framework-agnostic core, with node views in plain TypeScript; `preview` and every other package are framework-free too. `app` is built with React. A fork could build a different app on the same packages.

### Packages

| Package | Language | Published as | What it does |
|---|---|---|---|
| `contracts` | JSON Schema → TS + Go | npm + Go module | AST format, component definitions, warnings, plugin format, theme tokens, `ProjectStore`, `Exporter`; conformance suites |
| `spec` | Markdown | (docs) | The Rosetta Markdown specification |
| `parser` | Go | Go module | Goldmark + Rosetta extensions; renders components from plugin templates |
| `parser-wasm` | Go → WebAssembly + TS | npm | WebAssembly build of `parser` plus the Web Worker client |
| `editor` | TypeScript (no UI framework) | npm | Tiptap editor, node view framework, Markdown serializer |
| `preview` | TypeScript | npm | Paged.js preview renderer |
| `theme-engine` | TypeScript | npm | Compiles theme tokens to CSS custom properties |
| `theme-classic` | Data (JSON, CSS, assets) | npm | The built-in v1 theme |
| `store-local` | TypeScript | npm | `LocalStore` (IndexedDB) and `.rosetta` import/export |
| `exporter-browser` | TypeScript | npm | `BrowserPrintExporter` |
| `system-<name>` | Data (JSON, templates) | npm | One package per game system |
| `app` | TypeScript + React | not published | The web app; the only package that composes the others |

Later, the backend adds packages such as `server`, `store-api` and `exporter-server` under the same rules.

### Versioning and releases

Each package is versioned and released **independently** with semantic versioning.

- **Changesets** manages versions, changelogs and npm publishing. Every pull request that changes a package includes a changeset describing the change and its bump (patch, minor, major).
- **Go packages** (`parser`) get a `package.json` so Changesets can version them too. The release workflow then creates the matching Go module tag (for example `parser/v1.4.0`), which is how Go modules are versioned in a monorepo.
- **The release workflow** (Changesets GitHub Action) opens a "Version packages" pull request; merging it publishes the npm packages and pushes the Go tags.
- **Contract versions matter most.** A breaking change to any schema in `contracts` is a major version. Every document carries the spec version it was written with, so future versions of Rosetta can migrate old projects.

If the Changesets + Go tag combination becomes awkward, release-please is an alternative that supports Go and npm packages in one monorepo natively.

## Rosetta Markdown

Everything in standard Markdown (CommonMark + GFM tables) is valid. Custom components use **directive syntax**. Structured components take a YAML-style body, so files stay readable in any plain Markdown viewer.

```md
:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
:::

:::readaloud
The torches gutter as the door groans open...
:::

:::sidebar{title="Variant: Lingering Injuries"}
Instead of resting to full, roll on the table below...
:::

::pagebreak

::layout{template="one-column"}

::page{template="art-top" art="assets/tavern.jpg" height="40%"}
```

### First components

| Component | Milestone | Notes |
|---|---|---|
| `statblock` | M1 | Fields come from the active system plugin's schema |
| `readaloud` | M1 | Boxed narration text |
| `sidebar` | M1 | Callout with optional title |
| `pagebreak` | M1 | Starts a new page |
| `layout` | M2 | Changes the page template for all following pages (see Page layouts) |
| `page` | M4 | A single special page, such as full art or art at the top or bottom |
| `figure` | M4 | Image in the text flow, one column wide or spanning all columns |
| `toc` | M5 | Generated table of contents |
| `spell`, `item` | M6 | Cards, schema-driven |
| Random tables | M6 | GFM tables with dice notation, such as `d20` |

## Page layouts

### Text flows on its own

There is **no column break**. On multi-column pages, content fills the first column, overflows into the next one, then continues on the next page. CSS columns and Paged.js handle this automatically. The only manual control is `::pagebreak`, which starts a new page.

### Breakable and unbreakable elements

Every element type, built-in or component, is either **breakable** or **unbreakable**:

- **Breakable** elements split when they reach the end of a column: the first part stays, the rest continues at the top of the next column or page.
- **Unbreakable** elements never split. If one does not fit in the space left in the column, **the whole element moves to the next column**, and the space it leaves is not filled by later content.

| Element | Breakable? | Notes |
|---|---|---|
| Paragraph | Yes | Theme sets minimum lines left behind or carried over (`orphans`, `widows`) |
| List | Yes | Individual list items do not split |
| Table | Yes | The header row repeats at the top of each continued part |
| Heading | No | Also always stays with the content that follows it, so a heading is never left alone at the bottom of a column |
| Image / `figure` | No | |
| `statblock` | No | |
| `spell`, `item` cards | No | |
| `readaloud` | Yes | Default; a theme can make it unbreakable |
| `sidebar` | Yes | Default; a theme can make it unbreakable |

The rules:

1. **Breakability is part of each component's definition.** Every component schema in a system plugin declares `breakable: true` or `breakable: false`, so new components automatically follow the same flow rules.
2. **Themes can override the default** for a component when the visual design calls for it.
3. **Implementation:** unbreakable elements get `break-inside: avoid`; headings get `break-after: avoid`. Paged.js respects both.
4. **Edge case:** an unbreakable element taller than a whole column has nowhere to go. Rosetta shows a warning in the editor and the preview instead of failing silently. How to resolve it is an open question below.

### Page templates

A TTRPG book mixes several kinds of pages. Each kind is a **page template** defined by the theme: margins, number of text columns, header and footer, and any art areas. Under the hood each template is a CSS named page (`@page name { ... }`).

| Template | What it looks like | Typical use |
|---|---|---|
| `two-column` (default) | Two text columns, header, footer, page number | Rules, adventures, most content |
| `one-column` | One text column, like a novel | Introductions, fiction, letters, handouts |
| `art-full` | Image fills the whole page; no header or footer, but the page number is shown over the art | Chapter openers, splash art, two-page spreads |
| `art-top` | Art band across the top of the page; text flows in columns in the remaining height | Section openers, location art |
| `art-bottom` | Same as `art-top`, with the art at the bottom | Scene art, decorative endings |

Themes can define more templates later, such as a styled chapter opener.

### Two directives, two scopes

**`::layout`** changes the template for **every following page** until the next `::layout`. It always starts a new page.

```md
::layout{template="one-column"}
It was a dark night in Greyhollow when the bells began to ring...

::layout{template="two-column"}
## Chapter 1: The Basics
```

**`::page`** creates **one special page**, then the flow returns to the current layout. It always starts a new page.

```md
::page{template="art-full" art="assets/dragon.jpg"}

::page{template="art-top" art="assets/tavern.jpg" height="40%"}
The Rusty Flagon is the busiest tavern in town...
```

### Two-page art spreads

A spread is one piece of art across two facing pages. Rosetta does not split images automatically: **the author creates two `art-full` pages in a row**, each with its half of the art.

```md
::page{template="art-full" art="assets/map-left.jpg" side="left"}
::page{template="art-full" art="assets/map-right.jpg"}
```

For the halves to face each other in a printed book, the first page must land on a left-hand page. The optional `side="left"` forces this by inserting a blank page when needed (`break-before: left`). Without it, Rosetta shows a warning when two consecutive `art-full` pages do not face each other.

### Notes on `art-top` and `art-bottom`

For `art-top` and `art-bottom`, the text that follows fills the reduced text area of that page, then continues normally on the next one. `height` is optional; the theme sets a default.

### Art in the flow vs. art pinned to the page

These are two different things:

- **`figure`** sits at its position in the text: either one column wide, or spanning all columns (`span="all"`) at that point in the text.
- **`art-top` / `art-bottom` pages** pin art to the edge of the page, no matter where the text happens to break.

### How it is implemented

- **`one-column` and `two-column`**: named pages with a different column count on the text area. Straightforward.
- **`art-full`**: a named page with no margins and the image sized to the page. The page number is drawn on top of the art in its usual position; the theme styles it so it stays legible over any image (for example with a small backing shape). Bleed comes later with print output.
- **`art-top` / `art-bottom`**: a named page with an enlarged top or bottom margin. The art is placed in that margin area as a Paged.js running element, so the text area shrinks automatically and the columns flow within it.
- **In the editor**, `::layout` and `::page` appear as page divider blocks showing the template name and an art thumbnail. The live preview shows the real result.

> **Risk:** pinning art to the top or bottom of a page is the hardest layout feature to get right in Paged.js. It gets a technical spike in M2, before the rest of the layout work is built on it.

## Project format

A project is a manifest plus chapter files plus assets. Inside IndexedDB this is stored as records; as a `.rosetta` file it is a zip:

```
my-book.rosetta
├── manifest.json        # title, system, theme, chapter order, cover settings
├── chapters/
│   ├── 01-introduction.md
│   ├── 02-character-creation.md
│   └── ...
└── assets/
    ├── originals/
    └── previews/
```

Each chapter **always starts on a new page**, optionally on a right-hand page (`break-before: right`). This makes chapters independent units for layout, which is what will let the backend render them in parallel and cache them.

## Tech stack

| Area | Choice |
|---|---|
| Language (app) | TypeScript, built with Vite |
| UI framework | React, used in `app` only; `editor` stays framework-agnostic |
| Editor | Tiptap, with custom node views for components |
| Parser | Go + Goldmark + Rosetta extensions → WebAssembly (try TinyGo for size, fall back to standard Go) |
| Preview and export | Paged.js |
| Storage | IndexedDB (via a small wrapper such as `idb`) |
| Project files | Zip via `fflate`; File System Access API where supported |
| Images | `OffscreenCanvas` in a worker for preview copies |
| Reference browser | Chrome / Edge |
| Monorepo | pnpm workspaces + Go workspace (`go.work`) |
| Versioning and releases | Changesets, plus Go module tags created by the release workflow |
| Package boundaries | JSON Schema contracts with generated TS and Go types; dependency-cruiser in CI |

## Milestones

### M0 — Foundations

- Repository setup, CI, lint and test tooling
- First draft of the Rosetta spec
- Goldmark extensions for directives and the M1 components
- WebAssembly build running inside a Web Worker
- Golden test suite with at least 20 cases

**Done when:** the browser can send Rosetta Markdown to the worker and get HTML back, and the golden tests pass both in native Go and in the WebAssembly build.

### M1 — Single-chapter editor

- Tiptap editor with the M1 components as node views (form while editing, themed output otherwise)
- `breakable` flag defined for every built-in element and M1 component
- Round trip: Markdown → editor → Markdown, with no loss of content
- Optional raw source view

**Done when:** a 30-page chapter can be edited with no noticeable typing lag, and round-tripping every golden test file produces equivalent output.

### M2 — Live preview and first theme

- Paged.js preview of the current chapter in an iframe, debounced after edits
- First theme: page size, running headers, page numbers, component styling
- **The theme is written entirely with design tokens** (CSS custom properties). Component templates never hardcode fonts, colors, borders, textures or image masks; they only read tokens. This is the groundwork for custom themes.
- Automatic column flow: content overflows from column to column and page to page, splitting breakable elements and moving unbreakable ones whole
- Repeated table header rows on continued tables
- Warning for unbreakable elements taller than a column
- `::layout` directive with the `two-column` and `one-column` templates
- **Spike:** prove that `art-top` and `art-bottom` work with Paged.js running elements before M4
- Same theme CSS used in the editor surface, so editing already looks like the book

**Done when:** the preview of a 30-page chapter updates in under 2 seconds after typing stops, text flows correctly across columns and pages, and the art-band spike has a working prototype.

### M3 — Multi-chapter projects and local storage

- Manifest, chapter sidebar, reordering, add and delete chapters
- `ProjectStore` interface with `LocalStore` implementation (IndexedDB)
- `.rosetta` import and export
- Correct page numbers in the preview, using each earlier chapter's page count from its last render (marked as stale when out of date)

**Done when:** a 20-chapter project survives a browser restart and a round trip through a `.rosetta` file with nothing lost.

### M4 — Assets and art

- Image import with preview copies generated in a worker
- `figure` component (column width or spanning all columns)
- `::page` directive with the `art-full`, `art-top` and `art-bottom` templates
- Page numbers over full-page art
- `side="left"` option and the facing-pages warning for two-page spreads
- Warning when an image is too low-resolution for its size on the page

**Done when:** a chapter with 30 illustrations, mixing every page template, stays responsive in the editor and lays out correctly in the preview.

### M5 — Whole-book export

- `Exporter` interface with `BrowserPrintExporter`
- Full book rendered in a hidden iframe, then the print dialog
- Generated table of contents with page numbers (Paged.js `target-counter`)
- Simple front cover as the first page
- **Large-book benchmark** (see below)

**Done when:** a 100-page illustrated book exports correctly, and benchmark results for the 300-page test book are recorded.

### M6 — System plugins

- Plugin format: component schemas (including the `breakable` flag), templates, defaults
- First system using openly licensed content (e.g. the 5e SRD under its Creative Commons license)
- `spell`, `item` and random table components

**Done when:** a second, different system can be added without changes to the editor code.

## Performance budgets and the large-book benchmark

A **300-page test book** with about 150 illustrations, using every page template, is created during M0 and kept in the repo. It is used throughout development.

| Measure | Budget |
|---|---|
| Typing latency in a 30-page chapter | No visible lag |
| Chapter preview update | Under 2 s for 30 pages |
| Opening a chapter | Under 1 s |
| Whole-book export (100 pages) | Completes reliably |
| Whole-book export (300 pages) | **Measured and recorded, not required** |

The 300-page export result is the main input for deciding when to build the backend.

## Custom themes (after v1)

Users will be able to build or load their own theme, so a sci-fi book can look nothing like a fantasy one. **Not part of v1**, but v1 is designed for it (see M2).

### What a user can customize

| Area | What can be changed |
|---|---|
| **Fonts** | A book font applied to everything, plus optional fonts for headings and for any individual component. Users can upload their own font files. |
| **Colors** | A palette (text, headings, accents, rules, component backgrounds) used across the whole theme. |
| **Component frames** | For block components such as `readaloud`, `statblock` and `sidebar`: border style, width, color, corner shape, background color or texture, and decorative image borders (for example ornamental corners). |
| **Page texture** | A background image for pages, such as old parchment for fantasy or brushed metal for sci-fi. Can differ per page template, and can be turned off. |
| **Image masks** | The edge effect on art, such as the brush-stroke fade used in D&D books. Users choose a built-in mask, upload their own, change which edges it applies to, or turn it off. |
| **Page furniture** | Headers, footers, page number style and position, margins, column gap, and an optional line between columns. |
| **Typography details** | Heading sizes and rules, drop caps, table stripe colors, list markers. |

### How settings cascade

Each value is resolved from the most specific level that sets it:

1. **Component override:** for example, a font only for `readaloud`
2. **Book level:** for example, the book font
3. **Theme defaults**

So setting only a book font changes every component, and a component-specific font always wins over it.

### How it works

- **Themes are data, not code.** A theme is a JSON file of tokens plus its assets (fonts, textures, masks, border images). Rosetta compiles the tokens into CSS custom properties, which every component template already reads (the M2 rule).
- **Theme files:** a theme lives inside the `.rosetta` project file in a `theme/` folder, and can also be saved on its own as a `.rosetta-theme` file to reuse or share.
- **Themes vs. system plugins:** a system plugin defines *what* a component contains (the fields of a stat block); a theme defines *how it looks*. Each component declares which of its parts are themeable (frame, title bar, background), so any theme can style any system.
- **Masks** use CSS `mask-image` with an image whose transparency defines the fade. They apply to `figure` images and to art bands on `art-top` / `art-bottom` pages.
- **Ornamental borders** use CSS `border-image`, which stretches the edges of a border image around a box of any size while keeping the corners intact.
- **Theme editor:** a settings panel with a live sample page that shows every component and page template, so users see each change immediately.
- **Print-friendly version:** an export option that turns off page textures and heavy backgrounds, common in published RPG books to save printer ink and reduce PDF size.

### Things to watch

- **Font licensing:** embedding a font in a shared PDF requires a license that allows it. The user is responsible, but Rosetta should show a clear notice on upload.
- **PDF size:** large page textures repeated on 300+ pages can make files huge. Textures should be stored once and reused, and the theme editor should warn about very large texture images.
- **Masks in PDF output:** test early how Chromium prints masked images (they may be flattened to bitmaps), and check quality and file size.

## Path to the backend (v2)

### When to start it

Any one of these is a trigger:

- Exporting the 300-page test book is too slow or crashes the browser tab
- Real users are hitting the limits on their own large books
- Users need accounts, sync, sharing or collaboration
- Users need print-shop output (CMYK, PDF/X, cover with spine)

### What the backend adds

- **Go API** with Postgres for projects and chapters, and object storage for assets and PDFs
- **`ApiStore`** implementing `ProjectStore`
- **Asset pipeline** generating preview and print-resolution versions on upload
- **Export workers** running from a job queue (e.g. River):
  1. Render each chapter to HTML with the same Goldmark extensions
  2. Print chapters to PDF **in parallel** with headless Chromium + Paged.js (via chromedp)
  3. Second pass for page-dependent content: table of contents, index, cross-references
  4. Merge chapter PDFs with pdfcpu and add bookmarks
  5. **Cache each chapter's PDF** by a hash of its content, theme and assets, so fixing one chapter only rebuilds that chapter
- **`ServerExporter`** implementing `Exporter`
- **Cover builder** with spine width from page count and paper stock, plus bleed
- **Print post-processing** (e.g. Ghostscript) for CMYK and PDF/X

### Interim option

If large exports become a problem before a server is justified, the app can be wrapped in **Electron**, whose `printToPDF` allows per-chapter rendering and merging locally with no infrastructure.

## Risks

| Risk | Mitigation |
|---|---|
| WebAssembly parser too large to load quickly | Try TinyGo; load the worker lazily; measure in M0 |
| Markdown round trip loses content or formatting | Golden test suite runs round trips on every change |
| Paged.js struggles with complex layouts (art, columns, long stat blocks) | Page templates instead of manual tweaks; test with the benchmark book early |
| Art pinned to the top or bottom of a page does not work well in Paged.js | Spike in M2; fallback is placing the art band at the start of a new page using `figure{span="all"}` |
| Browser export too slow for large books | Expected — this is what the backend solves; Electron as interim option |
| Browsers render print slightly differently | Chrome / Edge as the reference browser |
| IndexedDB data lost when users clear browser data | Prompt users to export `.rosetta` backups; File System Access API where available |
| Licensing of game system content | Ship only openly licensed system content; users supply the rest |

## Open questions

- Which open-source license: permissive (MIT or Apache-2.0), or copyleft (such as AGPL) so forks that run Rosetta as a service must share their changes?

- Which system ships first, and which one is second to prove the plugin format?
- Page size defaults: US Letter, A4, or both from the start?
- How should the stat block form handle system-specific calculations, such as ability modifiers?
- What should happen to an unbreakable element taller than a whole column, such as a very long stat block: span both columns, scale down, or force a split with a "continued" marker?
- For custom themes: allow advanced users to add raw CSS on top of the theme settings, or keep themes to settings only?
- Should there be a place for users to share or sell themes?
