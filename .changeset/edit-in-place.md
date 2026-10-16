---
"@rosetta/editor": minor
"@rosetta/app": patch
---

A data component such as the statblock is now edited where it is shown: the parser's own HTML with each value replaced by a control that takes its font, color and size, so editing looks like the rendered component. It is driven by the component's definition (`createInline`, `skeleton`), validates as before, keeps lists (add and remove items) and saves the same Markdown. The form remains for leaf components and as a fallback.
