# Rosetta

Rosetta is a WYSIWYG editor for tabletop RPG content. You write in **Rosetta Markdown**, which is standard Markdown plus components such as stat blocks, read-aloud text and sidebars. You see a paginated, print-styled preview while you write, and export the result as a PDF.

```md
:::readaloud
The torches gutter as the door groans open...
:::

:::statblock{system="5e"}
name: Bone Warden
ac: 15
hp: 52 (8d8+16)
:::

::pagebreak
```

> **Status:** early development (milestone M0, foundations). There is no usable app yet. The plan is in [docs/ROSETTA_V1_PLAN.md](docs/ROSETTA_V1_PLAN.md) and the task list in [docs/ROSETTA_V1_TASKS.md](docs/ROSETTA_V1_TASKS.md).

## How it fits together

```
 Rosetta Markdown ──▶ parser (Go → WebAssembly) ──▶ AST ──▶ editor / preview ──▶ PDF
                              ▲                        ▲
                  system plugin + theme        contracts (JSON Schemas)
```

1. You write Rosetta Markdown in the **editor**.
2. The **parser** turns it into an **AST** (a tree of nodes) and a list of warnings.
3. The **preview** lays the AST out as printable pages using a **theme**.
4. An **exporter** produces the PDF.

Every package talks to the others only through **contracts**: JSON Schemas that define the AST, components and warnings. That is what lets someone replace one piece, such as a theme or the storage layer, without touching the rest.

## Packages

All packages live in [`packages/`](packages/).

| Package | Language | What it does |
|---|---|---|
| [`spec`](packages/spec) | Markdown | The written definition of Rosetta Markdown: directive syntax, components, errors. |
| [`contracts`](packages/contracts) | JSON Schema, with generated TypeScript and Go | The shared data formats (AST, component definitions, warnings) plus validators in both languages. |
| [`parser`](packages/parser) | Go | Reads Rosetta Markdown and produces the AST. Built on Goldmark. |
| [`parser-wasm`](packages/parser-wasm) | Go and TypeScript | Runs the parser in the browser (WebAssembly) in a Web Worker. |
| [`editor`](packages/editor) | TypeScript | The Tiptap-based editor: components appear as forms while editing. No UI framework. |
| [`preview`](packages/preview) | TypeScript | Paginates the document into print pages with Paged.js. |
| [`theme-engine`](packages/theme-engine) | TypeScript | Turns a theme's settings (fonts, colors, frames) into CSS. |
| [`theme-classic`](packages/theme-classic) | Data | The built-in theme. |
| [`system-example`](packages/system-example) | Data | Placeholder for game-system plugins: one package per system, holding its component schemas and templates. |
| [`store-local`](packages/store-local) | TypeScript | Saves projects in the browser (IndexedDB) and imports or exports `.rosetta` files. |
| [`exporter-browser`](packages/exporter-browser) | TypeScript | Exports a PDF using the browser's print function. |
| [`app`](packages/app) | TypeScript and React | The web app. The only package allowed to import the others and wire them together. |

**The rule:** a package may import only `contracts` and outside libraries. `pnpm check:boundaries` fails if it imports another Rosetta package.

## Getting started

You need Node 22, [pnpm](https://pnpm.io) and Go.

```bash
pnpm install
pnpm check      # typecheck, tests, Go tests and the package-boundary check
```

Useful commands:

| Command | What it does |
|---|---|
| `pnpm test` | Runs every package's tests |
| `pnpm test:go` | Runs the Go tests |
| `pnpm typecheck` | Type-checks all TypeScript |
| `pnpm check:boundaries` | Checks that packages only import `contracts` |
| `pnpm --filter @rosetta/contracts generate` | Regenerates the TypeScript and Go types from the schemas |
| `pnpm --filter @rosetta/benchmark-book generate` | Writes the 100- and 300-page test books to `tools/benchmark-book/out/` |
| `pnpm changeset` | Describes a change for the next release |

## Deploying

The app is a static site: the built `packages/app/dist`. It is hosted on **Cloudflare Workers (static assets)** at <https://wildbloom-studio.dev>; there is no server code. The build needs Go (it compiles the parser to WebAssembly).

| What | Command (from the repository root) |
|---|---|
| Build | `pnpm cf:build` (the same as `pnpm --filter @rosetta/app build`; the result is `packages/app/dist`) |
| Try it on this computer, as Cloudflare serves it (headers included) | `pnpm cf:preview`, then open <http://localhost:8787> |
| Publish by hand | `pnpm cf:deploy` (needs `wrangler login`, or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment) |

**Automatically** (`.github/workflows/cloudflare.yml`):

- Merging the "Version packages" pull request publishes the site, so it changes only on a release.
- It does not run on pull requests. To try a change first, use `pnpm cf:preview` on your computer.
- **Actions, Cloudflare, Run workflow** publishes again by hand. Put a tag or a commit in `ref` to publish an earlier version, which brings it back (only versions that contain this setup can be published this way).
- The repository secrets are `CLOUDFLARE_API_TOKEN` (permission to edit Workers) and `CLOUDFLARE_ACCOUNT_ID`.

**Configuration:** `packages/app/wrangler.jsonc` (the site and its address; the domain's DNS has to be on Cloudflare, in the same account) and `packages/app/public/_headers` (caching: files in `/assets/` have a hash in their name and are kept for a year, `index.html` is looked at each time; and the security headers). There is deliberately no `Content-Security-Policy`: the preview is an iframe built from a string, which inherits the page's policy and runs inline scripts and `blob:` images, so a strict one breaks it. If one is added, start it as `Content-Security-Policy-Report-Only`.

**Check a deploy** (the `.wasm` file must be `application/wasm` and compressed):

```bash
curl -sI https://wildbloom-studio.dev/ | grep -i "cache-control\|x-frame-options\|x-content-type"      # no-cache, DENY, nosniff
# the parser: its file name is the one ending in .wasm in the browser's Network tab (assets/rosetta-<hash>.wasm)
curl -sI -H 'Accept-Encoding: br' https://wildbloom-studio.dev/assets/rosetta-<hash>.wasm | grep -i "content-type\|content-encoding\|cache-control"
```

**Projects are stored in the browser, separately for each address.** Moving to a new address starts with no projects: use **Export** on the old address and **Import…** on the new one. The old GitHub Pages build (`pages.yml`, until it is switched off) shows a note saying so on its projects screen (`VITE_MOVED_TO`).

## License

[MIT](LICENSE). You can use, modify and distribute Rosetta however you like, as long as you keep the copyright notice and license text, which is how this project gets credit.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the change and release flow. Each package is versioned independently.
