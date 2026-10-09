---
"@rosetta/parser": minor
---

The AST now holds what the reader sees: backslash escapes are removed and character references resolved in text, link addresses and titles, and image alt text (as in the HTML). This makes the spec's `\::name` escape work. The AST also reports list tightness, raw front matter, raw attribute text and raw data bodies.
