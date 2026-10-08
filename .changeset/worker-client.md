---
"@rosetta/parser-wasm": minor
---

Add the Web Worker and a promise-based TypeScript client (`createParser`) with lazy loading: nothing is fetched until the first call. Calls are answered in order, a failed start-up rejects and retries on the next call, and `terminate()` stops the worker. Includes bundled ES modules for browsers (`dist/index.js`, `dist/worker.js`) and a demo page.
