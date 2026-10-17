---
"@rosetta/contracts": minor
"@rosetta/parser": minor
"@rosetta/parser-wasm": minor
"@rosetta/spec": minor
"@rosetta/theme-classic": minor
"@rosetta/preview": minor
"@rosetta/app": minor
---

`page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.
