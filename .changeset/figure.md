---
"@rosetta/contracts": minor
"@rosetta/parser": minor
"@rosetta/parser-wasm": minor
"@rosetta/spec": minor
"@rosetta/theme-classic": minor
"@rosetta/preview": minor
"@rosetta/editor": minor
"@rosetta/app": minor
---

`figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
