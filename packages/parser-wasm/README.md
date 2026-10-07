# @rosetta/parser-wasm

WebAssembly build of the Rosetta parser plus the Web Worker client.

## Development

```bash
pnpm --filter @rosetta/parser-wasm test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
