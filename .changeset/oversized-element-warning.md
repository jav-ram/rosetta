---
"@rosetta/preview": minor
"@rosetta/editor": minor
"@rosetta/app": minor
"@rosetta/theme-classic": patch
---

Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.
