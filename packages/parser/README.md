# @rosetta/parser

The Rosetta Markdown parser: Goldmark plus Rosetta extensions. A Go module, versioned through this `package.json` and tagged `packages/parser/vX.Y.Z`.

## Directive extension (`directive` package)

Parses block (`:::name{attrs}` ... `:::`) and leaf (`::name{attrs}`) directives, as defined in the [spec](../spec/ROSETTA_SPEC.md), into `*directive.Directive` nodes.

```go
defs, _ := contracts.M1Components()
doc, warnings := directive.Parse(source, directive.WithComponents(defs...))
```

| Component kind | Body |
|---|---|
| container (`readaloud`, `sidebar`) | Parsed as Markdown into the node's children |
| data (`statblock`) | Kept as raw text (`node.Raw(source)`); parsing the YAML fields comes later |
| leaf (`pagebreak`) | None |
| unknown | Kept as raw text, with a `component.unknown` warning |

Nothing ever fails the parse: problems become warnings (`component.unknown`, `directive.unclosed`, `directive.stray-close`, `directive.wrong-form`, `attr.syntax`, `attr.duplicate`) that are attached to the node and returned in source order. Nothing is built in: component definitions are data (`contracts.ComponentDefinition`) passed in with `WithComponents`. Until system plugins exist (M6), the temporary M1 definitions come from `contracts.M1Components()`.

## HTML rendering (`render` package)

```go
defs, _ := contracts.M1Components()
result, err := render.Convert(source, render.WithComponents(defs...))
// result.HTML, result.Warnings
```

Components are rendered from their definitions, so a new component needs no parser change.

| Kind | Output |
|---|---|
| container | `<div class="rosetta-NAME" data-component data-kind data-breakable>` around the Markdown body. A valid `title` attribute is shown as a heading whose level follows its leading `#`s, like Markdown (`title="## Variant"` is an `<h2>`); with no `#` it is an `<h3>`. |
| data | The same wrapper around a `<dl class="rosetta-fields">`, fields in definition order. Strings are inline Markdown (block Markdown for `\|` and `>` scalars) unless the field is `plain`. |
| leaf | The wrapper alone, with no `data-breakable` since leaf components have no flag. |
| unknown, or an unreadable body | A `rosetta-warning-block` showing the raw source. |

Invalid input never stops the document. Fields and attributes are validated against the definition and a problem becomes a warning (`field.type`, `field.enum`, `field.missing`, `field.unknown`, `attr.type`, `attr.enum`, `attr.missing`, `attr.unknown`, `yaml.syntax`, `yaml.unsupported`) that is returned, attached to the node, and listed in the HTML as `<ul class="rosetta-warnings">` (hide with `WithoutWarningsInHTML()`). An invalid field is dropped, a missing required one becomes a visible placeholder, and the other fields still render.

## Development

```bash
go test ./...
```

## Dependencies

Imports `packages/contracts` (required at `v0.1.0`). Inside the repo, `go.work` uses the local copy, so contract changes are picked up without a release. Outside it, the tagged version is used.
