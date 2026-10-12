# @rosetta/preview

Paged.js preview renderer.

## Use

```ts
import { createPreview } from "@rosetta/preview";

const preview = createPreview(host, { pagedUrl }); // pagedUrl: where paged.polyfill.js is served
const result = await preview.render({ html, css }); // { pages, layoutMs }, or null if a newer render replaced this one
preview.destroy();
```

`html` is the parser's HTML for a chapter and `css` is the theme's (with `@page` values written in, see `@rosetta/theme-engine`). The package knows nothing else about either. Each render builds a fresh document in a new iframe, runs Paged.js in it, and swaps it in when it is done; the old pages stay visible until then and the scroll position is kept. Pages are scaled down to fit the width of the host.

- Images that are not absolute URLs show a placeholder (so a missing file does not stall the layout); pass `resolveImage` to supply real URLs.
- Inside the preview document `requestAnimationFrame` and `requestIdleCallback` are replaced, because Paged.js lays out one page per frame and browsers slow frames down to about one per second when the frame is not being painted (see `docs/benchmarks.md`).
- The iframe has the same origin as the app, so the HTML must be the parser's, which drops raw HTML.

## Development

```bash
pnpm --filter @rosetta/preview test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
