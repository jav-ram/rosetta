# @rosetta/app

The Rosetta web app (Vite + React). The only package that composes the others.

Today it is the shell: a chapter sidebar, a placeholder editor (a text box) and a placeholder preview (the parser's HTML, unpaginated). Markdown is parsed in the `@rosetta/parser-wasm` Web Worker. Chapters are sample data until storage exists.

## Development

```bash
pnpm --filter @rosetta/app dev      # http://localhost:5173 (builds the wasm module first; needs Go)
pnpm --filter @rosetta/app build    # production build into dist/
pnpm --filter @rosetta/app test
```

The shell is laid out for desktop widths (minimum 960 px).

This package is the one allowed to import other Rosetta packages (see `.dependency-cruiser.cjs`).
