# Benchmark book generator

Generates the large test books used to measure Rosetta: a 100-page and a 300-page book, each a project folder (`manifest.json`, `chapters/`, `assets/originals`, `assets/previews`) with placeholder art and every component defined so far.

```bash
pnpm --filter @rosetta/benchmark-book generate          # writes tools/benchmark-book/out/book-100 and book-300
node tools/benchmark-book/src/cli.mjs --out some/dir    # somewhere else
```

The output is deterministic (fixed seed) and git-ignored, so it is regenerated rather than committed.

Page counts are estimates from a words-per-page model. The real count is known only once the preview exists.

## Extending it

- **New component:** add a generator for it in `src/blocks.mjs` (`components`). The test fails until you do, and checks that the generated chapters parse with no warnings and use it.
- **New page template** (`::layout`, `::page`, M2): add it to the recipes in `src/generate.mjs`.
- The manifest format is provisional until project storage (T3.x).
