# @rosetta/parser

The Rosetta Markdown parser: Goldmark plus Rosetta extensions. A Go module, versioned through this `package.json` and tagged `packages/parser/vX.Y.Z`.

## Directive extension (`directive` package)

Parses block (`:::name{attrs}` ... `:::`) and leaf (`::name{attrs}`) directives, as defined in the [spec](../spec/ROSETTA_SPEC.md), into `*directive.Directive` nodes.

```go
doc, warnings := directive.Parse(source)
// or, with your own goldmark instance:
md := goldmark.New(goldmark.WithExtensions(directive.New(directive.WithComponents(defs...))))
```

| Component kind | Body |
|---|---|
| container (`readaloud`, `sidebar`) | Parsed as Markdown into the node's children |
| data (`statblock`) | Kept as raw text (`node.Raw(source)`); parsing the YAML fields comes later |
| leaf (`pagebreak`) | None |
| unknown | Kept as raw text, with a `component.unknown` warning |

Nothing ever fails the parse: problems become warnings (`component.unknown`, `directive.unclosed`, `directive.stray-close`, `directive.wrong-form`, `attr.syntax`, `attr.duplicate`) that are attached to the node and returned in source order. Built-in components are the M1 set; add more with `WithComponents`, for example from a system plugin.

## Development

```bash
go test ./...
```

## Dependencies

Imports `packages/contracts` (required at `v0.1.0`). Inside the repo, `go.work` uses the local copy, so contract changes are picked up without a release. Outside it, the tagged version is used.
