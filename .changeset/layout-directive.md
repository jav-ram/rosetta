---
"@rosetta/contracts": minor
"@rosetta/parser": minor
"@rosetta/theme-classic": minor
"@rosetta/spec": patch
"@rosetta/app": minor
---

`::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.
