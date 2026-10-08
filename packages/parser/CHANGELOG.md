# @rosetta/parser

## 0.3.0

### Minor Changes

- e8a3e4e: Add the golden conformance suite to contracts (39 Markdown/HTML pairs with expected warnings, and a Go runner with -update). The parser now handles YAML front matter (preserved, never rendered, line numbers unchanged), reports nested missing fields on the right line, and uses a library-independent message for invalid YAML. Spec: front matter rules and the frontmatter.syntax warning.

## 0.2.0

### Minor Changes

- 00c4b27: Render the M1 components (statblock, readaloud, sidebar, pagebreak) to HTML from component definitions, with a breakability data attribute and warnings for invalid fields and attributes. Add the temporary M1 component definitions to contracts (`M1Components()` in Go, `m1Components` in TypeScript). The directive extension no longer has built-in components.

## 0.1.0

### Minor Changes

- 6f4e4b9: Add the Goldmark directive extension: block and leaf directives with attributes, nesting, unclosed-block and unknown-component warnings. Spec: clarify which block a closing line closes, and that fenced code hides closing lines.
