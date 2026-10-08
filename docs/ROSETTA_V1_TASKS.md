# Rosetta v1 — Task List

Companion to `ROSETTA_V1_PLAN.md`. Each task is sized to be done in **one working session**.

## How we work

1. Pick the next task whose dependencies are all done.
2. Start the session with: the task ID, this file, `ROSETTA_V1_PLAN.md`, and any code files the task touches.
3. A task is finished only when its **Done when** check passes.
4. At the end, check the box, and write any decision made during the task in the **Decision log** at the bottom.

Tasks marked **🔶 Decision** need an answer from you before the tasks after them can start.

---

## M0 — Foundations

- [x] **T0.1 — Repository and package skeletons**
  - Depends on: —
  - Do: pnpm workspace and Go workspace (`go.work`). Empty skeleton for every package in the plan's package table, each with its own README, CHANGELOG, build and tests. dependency-cruiser rule: packages may only import `contracts` and outside libraries (except `app`). CI running Go tests, TypeScript type checks, package tests and the boundary check.
  - Done when: a fresh clone builds, all (empty) test suites run in CI, and an import from one package into another's internals fails CI.

- [x] **T0.1a — Versioning and releases**
  - Depends on: T0.1
  - Do: Changesets set up for independent versioning. `package.json` for the Go `parser` so it is versioned too, and a release script that creates the Go module tag (`parser/vX.Y.Z`). Changesets GitHub Action for the "Version packages" pull request and publishing. CI check that pull requests touching a package include a changeset. CONTRIBUTING.md explaining the flow.
  - Done when: a test release (dry run) bumps two packages independently, writes their changelogs, and produces the correct Go tag.

- [x] **T0.2 — Rosetta spec v0.1**
  - Depends on: —
  - Do: Write `/spec/ROSETTA_SPEC.md`: block directives (`:::name{attrs} ... :::`), leaf directives (`::name{attrs}`), attribute syntax, escaping, and the difference between **data components** (YAML-style fields, such as `statblock`) and **container components** (Markdown content inside, such as `readaloud`). Define behavior for unknown components and invalid fields (render a visible warning, never fail the whole document). Define the `breakable` flag.
  - Done when: every M1 component and `pagebreak` can be written using only what the spec defines.

- [x] **T0.2a — Contracts package**
  - Depends on: T0.1, T0.2
  - Do: JSON Schemas in `contracts` for the AST format, component definitions (data vs. container, `breakable`, fields), warnings, and a version field for documents. Code generation for TypeScript types and Go structs, run in CI so generated code never drifts from the schemas.
  - Done when: both generated outputs compile and a sample AST validates against the schema in both languages.

- [x] **T0.3 — Goldmark directive extension**
  - Depends on: T0.2a
  - Do: In `parser`. Generic Goldmark extension that parses block and leaf directives into AST nodes, with attributes and body. Unknown directives become a generic node with a warning.
  - Done when: unit tests cover nesting, attributes, unclosed blocks and unknown names.

- [x] **T0.4 — M1 component renderers**
  - Depends on: T0.3
  - Do: Component rendering driven by component definitions from `contracts` (passed in as data, not hardcoded in the parser). Temporary definitions for `statblock`, `readaloud`, `sidebar` and `pagebreak` until system plugins exist in M6. Renderers for, `readaloud`, `sidebar` and `pagebreak`. Output includes a data attribute for breakability. Collect warnings for invalid fields.
  - Done when: each component renders correct HTML for valid and invalid input.

- [x] **T0.5 — Golden test suite**
  - Depends on: T0.4
  - Do: Conformance suite in `contracts`, usable by any parser implementation, with at least 20 pairs of `.md` input and expected `.html` output, covering standard Markdown, GFM tables and every component. Go test runner that compares output and can regenerate expected files on demand.
  - Done when: the suite passes and is part of CI.

- [x] **T0.6 — WebAssembly build**
  - Depends on: T0.5
  - Do: In `parser-wasm`. Compile the parser to WebAssembly. Try TinyGo first, fall back to standard Go. Expose `parse(markdown) → { html, ast, warnings }`, where `ast` is a JSON tree the editor can load. Record the binary size in `/docs/benchmarks.md`.
  - Done when: the golden suite passes when run through the WebAssembly build.

- [x] **T0.7 — Parser worker and TypeScript client**
  - Depends on: T0.6
  - Do: Web Worker that loads the WebAssembly parser. Typed TypeScript client with a promise-based API (`await parser.parse(md)`). Lazy loading.
  - Done when: the app can parse a document from the browser without blocking the main thread.

- [x] **T0.8 — Benchmark book generator**
  - Depends on: T0.2
  - Do: Script that generates the 300-page test book (and a 100-page version) as a project folder, with placeholder art and every component. It is extended in later milestones as new components and page templates appear.
  - Done when: the script produces a valid project using all components defined so far.

---

## M1 — Single-chapter editor

- [x] **T1.0 — 🔶 Decision: React or Svelte**
  - Depends on: —
  - Do: Short comparison for this project (Tiptap support, ecosystem, your experience), then you decide.
  - Done when: the choice is in the Decision log.

- [x] **T1.1 — App shell**
  - Depends on: T0.7, T1.0
  - Do: Vite + React app in `app`. Layout with chapter sidebar, editor area and preview pane (placeholders). Parser worker wired in.
  - Done when: the app runs, and the shell renders on desktop sizes.

- [ ] **T1.2 — Tiptap with standard Markdown**
  - Depends on: T1.1
  - Do: In `editor`, using Tiptap's framework-agnostic core (no React inside `editor`); `app` mounts it. Tiptap configured for headings, paragraphs, emphasis, links, lists, blockquotes, code, images and GFM tables.
  - Done when: all standard elements can be created and edited with the keyboard and toolbar.

- [ ] **T1.3 — Loading: parser AST → editor document**
  - Depends on: T1.2
  - Do: Converter from the parser's JSON tree to a Tiptap document, including generic handling for components.
  - Done when: every golden file loads into the editor without losing content.

- [ ] **T1.4 — Saving: editor document → Rosetta Markdown**
  - Depends on: T1.3
  - Do: Serializer from the Tiptap document back to Rosetta Markdown. Round-trip tests: load each golden file, serialize, parse again, compare HTML.
  - Done when: all golden files round-trip with equivalent output.

- [ ] **T1.5 — Component node view framework**
  - Depends on: T1.4
  - Do: Shared system for component node views: a data component shows a form generated from its schema while selected and its rendered output otherwise (rendered by the parser worker, never by a copy of the template in the editor); a container component holds editable content inside a styled frame. Components are registered from definitions passed in as data (from `contracts`), not hardcoded in `editor`.
  - Done when: a dummy component of each kind works in the editor and round-trips.

- [ ] **T1.6 — `statblock` node view**
  - Depends on: T1.5
  - Do: Stat block using the framework and the temporary schema.
  - Done when: a stat block can be inserted, edited through its form, saved and reloaded.

- [ ] **T1.7 — `readaloud`, `sidebar` and `pagebreak`**
  - Depends on: T1.5
  - Do: The two container components (with optional sidebar title) and the page break block.
  - Done when: all three can be inserted, edited, saved and reloaded.

- [ ] **T1.8 — Raw source view**
  - Depends on: T1.4
  - Do: Toggle between the visual editor and the raw Rosetta Markdown for the current chapter, keeping both in sync.
  - Done when: edits in either view show up in the other with no loss.

- [ ] **T1.9 — Editor performance check**
  - Depends on: T1.6, T1.7
  - Do: Load a 30-page chapter from the benchmark book and measure typing latency. Fix anything that lags.
  - Done when: no visible typing lag; results recorded in `/docs/benchmarks.md`.

---

## M2 — Live preview and first theme

- [ ] **T2.0 — 🔶 Decision: default page size**
  - Depends on: —
  - Do: US Letter, A4, or both from the start.
  - Done when: the choice is in the Decision log.

- [ ] **T2.1 — Theme token system**
  - Depends on: T0.1
  - Do: In `theme-engine`, with the token schema in `contracts`. JSON format for theme tokens (fonts, colors, borders, spacing, textures, masks) and a compiler that turns them into CSS custom properties. Supports the cascade: component override → book → theme default.
  - Done when: a token file compiles to CSS and overrides resolve correctly in tests.

- [ ] **T2.2 — Base theme**
  - Depends on: T2.0, T2.1
  - Do: In `theme-classic`. First theme: page size, margins, two columns, running headers, page numbers, typography and styles for every M1 component. **Only tokens, no hardcoded values.**
  - Done when: a lint check confirms component CSS contains no hardcoded fonts, colors or borders.

- [ ] **T2.3 — Paged.js preview pane**
  - Depends on: T1.4, T2.2
  - Do: Iframe preview of the current chapter using the parser's HTML, the theme and Paged.js. Re-renders after typing stops.
  - Done when: a 30-page chapter preview updates in under 2 seconds after typing stops.

- [ ] **T2.4 — Flow and breakability**
  - Depends on: T2.3
  - Do: CSS for automatic column flow, `break-inside: avoid` on unbreakable elements, `break-after: avoid` on headings, orphans and widows. Repeat table header rows on continued tables (check Paged.js support; write a handler if needed).
  - Done when: test pages show paragraphs and tables splitting, and stat blocks and images moving whole to the next column.

- [ ] **T2.5 — Oversized element warning**
  - Depends on: T2.4
  - Do: After layout, detect unbreakable elements taller than a column and show a warning in the preview and on the matching block in the editor.
  - Done when: an oversized stat block triggers a visible warning in both places.

- [ ] **T2.6 — `::layout` with `one-column` and `two-column`**
  - Depends on: T2.4
  - Do: Parser support, editor page-divider block, and named pages in the theme.
  - Done when: switching layout mid-chapter starts a new page with the new template, and it persists across following pages.

- [ ] **T2.7 — Spike: pinned art bands**
  - Depends on: T2.3
  - Do: Prototype `art-top` and `art-bottom` with named pages, enlarged margins and Paged.js running elements. Write findings and a recommendation in `/docs/spikes/art-bands.md`.
  - Done when: either a working prototype, or a documented reason to use the fallback.

- [ ] **T2.8 — Theme in the editor surface**
  - Depends on: T2.2, T1.7
  - Do: The editor uses the theme's screen CSS, so text and components already look like the book while editing.
  - Done when: components look the same in the editor and preview (apart from pagination).

---

## M3 — Multi-chapter projects and local storage

- [ ] **T3.1 — Data model and `ProjectStore` interface**
  - Depends on: T1.4
  - Do: JSON Schemas in `contracts` for Manifest, Chapter and AssetRef, the `ProjectStore` interface, and a **`ProjectStore` conformance suite** any storage implementation can run.
  - Done when: schemas and interface are documented and the conformance suite runs against a simple in-memory store.

- [ ] **T3.2 — `LocalStore` (IndexedDB)**
  - Depends on: T3.1
  - Do: In `store-local`. IndexedDB implementation of `ProjectStore`.
  - Done when: it passes the `ProjectStore` conformance suite, including after reopening the database.

- [ ] **T3.3 — Projects screen**
  - Depends on: T3.2
  - Do: List, create, rename and delete projects.
  - Done when: projects survive a browser restart.

- [ ] **T3.4 — Chapter sidebar and autosave**
  - Depends on: T3.3
  - Do: Add, rename, delete and reorder chapters; open a chapter in the editor; autosave.
  - Done when: a 20-chapter project can be edited and reordered with nothing lost.

- [ ] **T3.5 — Chapter start rules**
  - Depends on: T3.4, T2.6
  - Do: Every chapter starts on a new page, with an optional per-chapter "start on right-hand page" setting.
  - Done when: the preview shows correct chapter starts, including inserted blank pages.

- [ ] **T3.6 — Page numbers across chapters**
  - Depends on: T3.5
  - Do: Store each chapter's page count from its last render; the preview starts numbering from the sum of earlier chapters. Mark counts as stale when an earlier chapter changes.
  - Done when: page numbers are correct across chapters, and stale counts are visibly flagged.

- [ ] **T3.7 — `.rosetta` import and export**
  - Depends on: T3.2
  - Do: Zip export and import with fflate; File System Access API save where available.
  - Done when: a project round-trips through a `.rosetta` file with nothing lost.

- [ ] **T3.8 — Backup reminder**
  - Depends on: T3.7
  - Do: Gentle prompt to export a backup after a period of editing without one.
  - Done when: the reminder appears and can be dismissed.

---

## M4 — Assets and art

- [ ] **T4.1 — Image import and preview copies**
  - Depends on: T3.2
  - Do: Drag-and-drop and file picker import; preview copies generated in a worker with `OffscreenCanvas`; originals kept for export.
  - Done when: importing 30 large images keeps the editor responsive.

- [ ] **T4.2 — `figure` component**
  - Depends on: T4.1, T2.4
  - Do: Image with optional caption, one column wide or spanning all columns. Unbreakable.
  - Done when: both widths render correctly in the preview.

- [ ] **T4.3 — `::page` with `art-full`**
  - Depends on: T4.1, T2.6
  - Do: Single full-art page with no header or footer, page number drawn over the art, and flow returning to the current layout afterwards.
  - Done when: an art page appears with a readable page number and the next page uses the previous layout.

- [ ] **T4.4 — `art-top` and `art-bottom`**
  - Depends on: T2.7, T4.3
  - Do: Implement the approach chosen in the spike, with optional `height`.
  - Done when: text flows in columns in the reduced area on that page and continues normally on the next.

- [ ] **T4.5 — Two-page spreads**
  - Depends on: T4.3, T3.6
  - Do: `side="left"` option and a warning when two consecutive `art-full` pages do not face each other.
  - Done when: both cases behave as described in the plan.

- [ ] **T4.6 — Low-resolution warning**
  - Depends on: T4.2
  - Do: Estimate each image's resolution at its placed size and warn when it is below print quality.
  - Done when: a small image placed full-page triggers a warning.

---

## M5 — Whole-book export

- [ ] **T5.1 — `Exporter` interface and `BrowserPrintExporter`**
  - Depends on: T3.6, T4.4
  - Do: Render the whole book in a hidden iframe with original-resolution images, then open the print dialog. Progress indicator.
  - Done when: a 100-page illustrated book exports to a correct PDF from Chrome.

- [ ] **T5.2 — `toc` component**
  - Depends on: T5.1
  - Do: Generated table of contents with page numbers via Paged.js `target-counter`.
  - Done when: the TOC page numbers match the exported PDF.

- [ ] **T5.3 — Front cover page**
  - Depends on: T5.1
  - Do: Simple cover as the first page, set from project settings.
  - Done when: the cover appears as page one of the export.

- [ ] **T5.4 — Large-book benchmark**
  - Depends on: T5.2, T5.3, T0.8
  - Do: Export the 100- and 300-page test books; record time, memory and any failures in `/docs/benchmarks.md`.
  - Done when: results are recorded, along with a recommendation on when to start the backend.

---

## M6 — System plugins

- [ ] **T6.0 — 🔶 Decision: first and second systems**
  - Depends on: —
  - Do: Pick the first system (openly licensed content) and a second, different one to prove the plugin format. Also decide how stat block forms handle calculated values like ability modifiers.
  - Done when: the choices are in the Decision log.

- [ ] **T6.1 — Plugin format and loader**
  - Depends on: T1.5, T6.0
  - Do: Plugin format as a schema in `contracts` (component definitions with `breakable`, templates, defaults, themeable parts). Plugins are data-only packages loaded at runtime by the parser and editor. Move the temporary component definitions into a first `system-` package.
  - Done when: the stat block works entirely from a plugin package, and a plugin can be added or swapped without changing `parser` or `editor` code.

- [ ] **T6.2 — First system plugin**
  - Depends on: T6.1
  - Do: Full stat block schema for the first system, including calculated values.
  - Done when: a complete creature can be built and renders correctly.

- [ ] **T6.3 — `spell` and `item` cards**
  - Depends on: T6.1
  - Do: Both cards as plugin components. Unbreakable.
  - Done when: both can be inserted, edited and exported.

- [ ] **T6.4 — Random tables**
  - Depends on: T6.1
  - Do: Tables with dice notation (such as `d20`) as the first column.
  - Done when: random tables render and split correctly across columns.

- [ ] **T6.5 — Second system plugin**
  - Depends on: T6.2
  - Do: Plugin for the second system.
  - Done when: it works with **no changes to editor code**.

- [ ] **T6.6 — Component gallery (Storybook)**
  - Depends on: T6.5, T2.2
  - Do: Private tool `tools/gallery`. Storybook where every component (from the definitions and the system plugins) has a story rendered through the parser and the active theme. Theme switcher in the toolbar; column-width presets; accessibility checks. A test fails when a component has no story. Decide at the start whether to add visual snapshots.
  - Done when: every component renders in `theme-classic` and in one other theme, and adding a component without a story fails CI.

---

## Decision log

| Date | Task | Decision |
|---|---|---|
| 2026-10-07 | T1.0 | React for `app`. Chosen for existing React experience, Tiptap's official React support, and the larger open-source contributor pool. `editor` and all other packages stay framework-agnostic. |
| 2026-10-07 | T0.1 | Packages live in `packages/<name>` (npm scope `@rosetta/*`). Go modules (`contracts`, `parser`) are listed in `go.work`; module path `github.com/jav-ram/rosetta/packages/<name>`. `contracts` is importable only via its public entry `src/index.ts` (enforced by dependency-cruiser). `system-example` is a placeholder skeleton for the `system-<name>` family. Pinned `packageManager` pnpm@10.17.1. |
| 2026-10-07 | T0.1a | Go module tags use the directory path (`packages/parser/vX.Y.Z`, not `parser/vX.Y.Z`) because Go requires that for submodules; `contracts` is tagged too. `.changeset/config.json` sets `privatePackages.version: true` so the private `parser` is still versioned (otherwise Changesets silently ignores its changesets). npm publishing is deliberately disabled for now: the release workflow only creates Go tags (no `changeset publish`, no `NPM_TOKEN`). |
| 2026-10-07 | T0.2 | Spec lives at `packages/spec/ROSETTA_SPEC.md` (the package from T0.1), not `/spec/`. Choices made: nesting by longer colon fences; attribute values are strings typed by component definitions; data bodies are a restricted YAML 1.2 subset; no inline directives in v0.1 (reserved); unknown directives are preserved byte-for-byte on save; warnings have stable codes (`component.unknown`, `field.type`, ...). Unbreakable-taller-than-column stays an open question (warning only). |
| 2026-10-07 | T0.2a | `Node` is a single flat schema discriminated by `type` (not a `oneOf` per node type) so that TypeScript and Go generate clean types. Rules a type cannot express (`breakable` required for block components, none for leaf; no `fields` on containers) are `if/then` in the schema, enforced by validators, and stripped from a temporary copy before code generation. Generators: `json-schema-to-typescript` and `go-jsonschema` v0.20.0 (pinned); validators: `ajv` and `santhosh-tekuri/jsonschema`. Generated files are committed; CI job `generated` regenerates and fails on any diff. Warning codes must be dotted (`component.unknown`). Document version field is `rosettaVersion` (`major.minor`). |
| 2026-10-07 | T0.3 | Directive extension is the `directive` subpackage of `parser`. Data and unknown bodies are kept raw (YAML parsing is a later task); container bodies are parsed as Markdown children. A closing line closes the innermost open directive with fence ≤ its colon count (spec clarified), so a longer closer closes the inner block and the outer is reported unclosed. A block fence on a leaf component keeps its body as raw text (spec clarified). The parser module requires `contracts v0.1.0` (the first tag) and `go.work` overrides it locally. |
| 2026-10-07 | License | MIT, copyright Javier Ramos. Anyone may use, modify and redistribute it; the copyright notice and license text must be kept, which gives credit. Resolves the plan's open license question for now (a copyleft license such as AGPL was the alternative). |
| 2026-10-07 | T0.4 | The task text lists renderers for `readaloud`, `sidebar` and `pagebreak` only (a word is missing); `statblock` is rendered too, since it is one of the four temporary definitions and "each component" must render. Temporary M1 definitions are JSON in `contracts/definitions/m1-components.json`, validated against the component-definition schema and exposed as `contracts.M1Components()` (Go) and `m1Components` (TS). The directive extension had built-in components in T0.3; they are removed so nothing is hardcoded in the parser. Rendering is generic and definition-driven: container = wrapper + Markdown body (+ `title` attribute heading, level from its leading `#`s, default h3), data = definition-ordered `<dl>`, leaf = wrapper. HTML class prefix is `rosetta-`. Data bodies use `yaml.v3` with unsupported features reported as `yaml.unsupported`. Warnings from a bad field are attached to the source line. Until `contracts` is released again, `GOWORK=off` builds of `parser` use `contracts v0.1.0`, which lacks `M1Components`; the workspace (and CI) is unaffected. |
| 2026-10-08 | T0.5 | The suite lives in `contracts/conformance` (39 cases in `markdown`, `tables`, `components`, `errors`); expected files are `.html` plus an optional `.warnings.json` (code, line, component, field; messages are not compared there). The Go runner is `conformance.Run`, with `-update` to regenerate; the reference parser runs it from `parser/render/conformance_test.go`, which CI runs. Generated expectations must be reviewed, because `-update` records bugs too: the first review found that front matter was rendered as `<hr><h2>`, so front matter handling was added (spec section 7: preserved, never rendered, line numbers kept). Warning messages appear in the expected HTML (visible warnings), so another parser must match them; YAML syntax errors use a library-independent message for that reason. `parser` now needs a `contracts` release containing `conformance` before `GOWORK=off` builds work; bump its `require` after the next Version packages PR. Known gap, left as is: a leaf component written with a block fence keeps its body in the AST but the HTML does not show it (only the `directive.wrong-form` warning). |
| 2026-10-08 | T0.6 | `parser-wasm` is now also a Go module (`main.go` for `js/wasm`, plus `api/` with the logic, testable natively), listed in `go.work`. The module exposes `rosetta.parse` and `rosetta.setComponents` taking and returning strings (JSON), so it behaves the same under Go and TinyGo; the TypeScript client wraps that. The `ast` is built in `parser/render` (`Result.Document`) in the contracts Document shape; its output is checked against the schema for every golden case; raw HTML is dropped from it as from the HTML. `contracts` gains a Node-only entry `@rosetta/contracts/conformance` (so TypeScript parsers can run the suite) and the boundary rule allows it. **TinyGo was tried and rejected for now; the build uses standard Go.** TinyGo builds the parser (1.94 MB vs 7.38 MB) but the module crashes on invalid YAML, because `recover()` does not work in TinyGo's wasm target and `yaml.v3` fails by panicking; 81 of 86 tests pass. The build script has no TinyGo option; using it later means replacing `yaml.v3` with a reader for the spec's YAML subset and adding a TinyGo path with `-stack-size=1mb`, which start-up needs. Details and numbers are in `docs/benchmarks.md`. To get TinyGo that far, `contracts` now compiles its JSON Schemas lazily and `M1Components()` no longer validates on each call. `parser` now requires `contracts v0.3.0`. |
| 2026-10-08 | T0.7 | The client is `createParser({ wasmUrl, wasmExecUrl, worker \| workerUrl, components? })` returning `{ parse, setComponents, ready, terminate }`. Lazy: nothing (worker, `wasm_exec.js`, module) is fetched until the first call; verified in a browser. The worker is split into a testable loop (`worker-core.ts`, takes a `Port` and a `Loader`) and a browser entry (`worker.ts`); the client talks to anything shaped like a `Worker` (`WorkerLike`), so the same code is tested against a real Node worker thread. Requests are handled strictly in order; a failed start rejects and the next call retries with a new worker. The JSON is parsed inside the worker. The package ships plain ES modules built with esbuild (`dist/index.js`, `dist/worker.js`) so a browser can load it without a bundler, plus a demo page; the package exports `./worker`, `./wasm` and `./wasm_exec` for bundlers. **Not yet tried with Vite** (the app is T1.1). Browser check: parsing a 2,000-node document froze the main thread for 2.2 s when done on it, and for at most 34 ms with the worker. Also: `parser` and `parser-wasm` now require `contracts v0.4.0` / `parser v0.4.0`. `.claude/launch.json` was added so the demo can be started from the desktop app. |
| 2026-10-08 | T0.8 | The generator is a private tool, `tools/benchmark-book` (added to the pnpm workspace as `tools/*`; the boundary check covers only `packages/`, so the tool may import `parser-wasm` and `contracts` for its tests). `pnpm --filter @rosetta/benchmark-book generate` writes `book-100/` and `book-300/` to the git-ignored `out/`; the books are not committed, because the same seed always gives the same files. Each book is a project folder as in the plan (`manifest.json`, `chapters/`, `assets/originals`, `assets/previews`) with ~15-page chapters, ~1 illustration per 2 pages (placeholder SVGs) and every component in `m1Components`, plus a nested container. **The manifest format is provisional** until project storage (T3.x); images are referenced from the project root (`assets/originals/ill-001.svg`). Page counts are estimates from a words-per-page model (the 300-page book comes out near 308, 149 illustrations); the true count is known only once the preview exists (M2). A test fails when a component is defined without a generator in `src/blocks.mjs`, which is how the book stays extended. `::layout` and `::page` are not in v0.1, so no page templates are used yet. |
| 2026-10-08 | T1.1 | `app` is a Vite + React 19 app (`pnpm --filter @rosetta/app dev`; `build` and `dev` first build the wasm module). Layout is a three-column grid (chapters, editor, preview) with a minimum width of 960 px; there is no mobile layout in v1's shell. The editor is a plain `<textarea>` and the preview shows the parser's HTML unpaginated; both are placeholders for T1.2 and M2. The parser is one shared `createParser` in `src/parser.ts`, wired with Vite's `?worker` and `?url` imports of `parser-wasm` (works in dev and in the production build), and the preview re-parses 150 ms after the last keystroke, dropping stale results. Chapters are hardcoded sample data until storage (M3). **Added after the task:** a Storybook component gallery is planned after M6 as T6.6 (private tool `tools/gallery`; see the plan). |
