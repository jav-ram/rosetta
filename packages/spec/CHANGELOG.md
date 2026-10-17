# @rosetta/spec

## 0.2.0

### Minor Changes

- 079a5da: `figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
- 079a5da: `page` templates `art-top` and `art-bottom`, with an optional `height` (a length or a percentage of the page): a band of art across the top or the bottom of the page, and the text that follows flows in the rest of it. The theme's default height is the token `page.art-height`.
- 079a5da: `page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.
- 079a5da: Two-page spreads: `side="left"` on a `page` makes it a left-hand page, with a blank page before it when needed (also at the start of a chapter). The preview reports two or more pages of full art in a row whose first page is a right-hand page, so they do not face each other; the app lists the warning with the book's page numbers and marks the page in the editor.

## 0.1.4

### Patch Changes

- ab06f42: `::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.

## 0.1.3

### Patch Changes

- e8a3e4e: Add the golden conformance suite to contracts (39 Markdown/HTML pairs with expected warnings, and a Go runner with -update). The parser now handles YAML front matter (preserved, never rendered, line numbers unchanged), reports nested missing fields on the right line, and uses a library-independent message for invalid YAML. Spec: front matter rules and the frontmatter.syntax warning.

## 0.1.2

### Patch Changes

- 00c4b27: Render the M1 components (statblock, readaloud, sidebar, pagebreak) to HTML from component definitions, with a breakability data attribute and warnings for invalid fields and attributes. Add the temporary M1 component definitions to contracts (`M1Components()` in Go, `m1Components` in TypeScript). The directive extension no longer has built-in components.

## 0.1.1

### Patch Changes

- 6f4e4b9: Add the Goldmark directive extension: block and leaf directives with attributes, nesting, unclosed-block and unknown-component warnings. Spec: clarify which block a closing line closes, and that fenced code hides closing lines.

## 0.1.0

### Minor Changes

- 2e2d24f: Add Rosetta spec v0.1: directives, attributes, escaping, data and container components, warnings and the `breakable` flag.
