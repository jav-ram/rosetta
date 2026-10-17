---
"@rosetta/contracts": minor
"@rosetta/store-local": minor
"@rosetta/app": minor
---

`.rosetta` import and export: a whole project in one zip (`exportProject`, `importProject`, with `fflate`), saved with the File System Access API where available (otherwise downloaded) and imported from a file input. `ProjectStore` gains `listAssets` and `putAsset(..., { id })`. The projects screen has Export and Import; the editor has Export.
