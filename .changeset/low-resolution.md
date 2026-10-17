---
"@rosetta/preview": minor
"@rosetta/app": minor
---

Low-resolution warning: images that would have fewer than 150 dots per inch at the size they are placed (figures, pages of art, Markdown images) are listed with the layout problems and marked on their component in the editor. The preview reports every image's placed size after layout (`PreviewResult.images`); the app reads the pixel size of each original from the start of its file.
