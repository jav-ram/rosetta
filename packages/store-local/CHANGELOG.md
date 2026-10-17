# @rosetta/store-local

## 0.3.0

### Minor Changes

- 079a5da: Images: add them with a button or by dropping files, and the editor makes a smaller preview copy of each in a worker. `ProjectStore` gets `setAssetPreview`, and the preview of an asset is its original until one is set.

### Patch Changes

- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
  - @rosetta/contracts@0.10.0

## 0.2.0

### Minor Changes

- ab33ba8: `.rosetta` import and export: a whole project in one zip (`exportProject`, `importProject`, with `fflate`), saved with the File System Access API where available (otherwise downloaded) and imported from a file input. `ProjectStore` gains `listAssets` and `putAsset(..., { id })`. The projects screen has Export and Import; the editor has Export.

### Patch Changes

- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
  - @rosetta/contracts@0.9.0

## 0.1.0

### Minor Changes

- 945a491: `LocalStore`: the `ProjectStore` in IndexedDB (`openLocalStore`). Passes the `ProjectStore` conformance suite, including after reopening the database.

## 0.0.8

### Patch Changes

- Updated dependencies [e23941b]
  - @rosetta/contracts@0.8.0

## 0.0.7

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0

## 0.0.6

### Patch Changes

- Updated dependencies [bd30a2f]
  - @rosetta/contracts@0.6.0

## 0.0.5

### Patch Changes

- Updated dependencies [e823b89]
  - @rosetta/contracts@0.5.0

## 0.0.4

### Patch Changes

- Updated dependencies [0e3720d]
  - @rosetta/contracts@0.4.0

## 0.0.3

### Patch Changes

- Updated dependencies [e8a3e4e]
  - @rosetta/contracts@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [00c4b27]
  - @rosetta/contracts@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies [8135000]
  - @rosetta/contracts@0.1.0
