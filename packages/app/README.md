# @rosetta/app

The Rosetta web app. The only package that composes the others.

## Development

```bash
pnpm --filter @rosetta/app test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
