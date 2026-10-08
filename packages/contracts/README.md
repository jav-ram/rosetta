# @rosetta/contracts

The language-neutral contracts between Rosetta packages. Everything starts from the JSON Schemas in `schemas/`; the TypeScript types and Go structs are generated from them.

## Schemas

| Schema | Describes |
|---|---|
| `ast.schema.json` | `Document`: the AST the parser produces. `rosettaVersion`, a tree of `Node`s, and `warnings`. |
| `component-definition.schema.json` | `ComponentDefinition`: a component's form (block or leaf), kind (data, container or leaf), `breakable` flag, attributes and fields. |
| `warning.schema.json` | `Warning`: stable `code`, severity, message and source range. |
| `position.schema.json` | `Position`: a source range. |
| `index.schema.json` | Entry point listing all of the above, used for code generation. |

`Node` is one flat shape discriminated by `type` (heading, paragraph, directive, ...), so it maps cleanly to both languages. Directive nodes carry `name`, `form`, `kind`, `attributes` and, depending on the kind, `fields` (data), `children` (container) or `raw` (unknown component).

Rules that a type cannot express (for example "a block component must declare `breakable`; a leaf component must not") are in the schema as `if/then` and enforced by the validators.

## Use

TypeScript:

```ts
import { validateDocument, type Document } from "@rosetta/contracts";

const result = validateDocument(json); // { valid, errors }
```

Go:

```go
doc, err := contracts.ValidateDocument(data) // validates, then decodes into contracts.Document
```

Both validators use the same schemas (the Go module embeds them).

## Generated code

`src/generated/types.ts` and `types_gen.go` are generated and committed. Do not edit them.

```bash
pnpm --filter @rosetta/contracts generate
```

CI runs `pnpm check:generated`, which regenerates and fails if the committed files differ. Change a schema, regenerate, and commit both.

## Conformance suite

`conformance/` is the golden test suite any parser can run: Markdown inputs, expected HTML and expected warnings, plus a Go runner. See [conformance/README.md](conformance/README.md).

## Examples

`examples/` holds a sample AST and component definition (valid) and invalid ones. Both languages' tests use the same files.
