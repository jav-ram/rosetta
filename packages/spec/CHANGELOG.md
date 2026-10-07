# @rosetta/spec

## 0.1.2

### Patch Changes

- 00c4b27: Render the M1 components (statblock, readaloud, sidebar, pagebreak) to HTML from component definitions, with a breakability data attribute and warnings for invalid fields and attributes. Add the temporary M1 component definitions to contracts (`M1Components()` in Go, `m1Components` in TypeScript). The directive extension no longer has built-in components.

## 0.1.1

### Patch Changes

- 6f4e4b9: Add the Goldmark directive extension: block and leaf directives with attributes, nesting, unclosed-block and unknown-component warnings. Spec: clarify which block a closing line closes, and that fenced code hides closing lines.

## 0.1.0

### Minor Changes

- 2e2d24f: Add Rosetta spec v0.1: directives, attributes, escaping, data and container components, warnings and the `breakable` flag.
