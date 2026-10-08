# Conformance suite

Golden tests for Rosetta parsers. A parser conforms if, for every case, it produces the expected HTML and reports the expected warnings.

## Layout

```
cases/<group>/<name>.md             Rosetta Markdown input
cases/<group>/<name>.html           expected HTML
cases/<group>/<name>.warnings.json  expected warnings (absent means none)
```

Groups: `markdown` (standard Markdown), `tables` (GFM tables), `components` (every M1 component, nesting and the document-level example), `errors` (unknown components, unclosed blocks, invalid fields and attributes, bad YAML, front matter).

Components are defined by `../definitions/m1-components.json` (`contracts.M1Components()` in Go). Pass those definitions to your parser; they are data, not part of the parser.

`.warnings.json` is a list of `{ "code", "line", "component"?, "field"? }` in source order. `line` is the 1-based start line in the original file. Warning messages are not compared in this file, but note that they do appear in the expected HTML (as the visible warnings the spec requires), so the HTML does depend on them.

When comparing, line endings are normalised and trailing whitespace and blank lines at the end are ignored.

## Run it (Go)

```go
func TestConformance(t *testing.T) {
	conformance.Run(t, func(markdown []byte, defs []contracts.ComponentDefinition) (conformance.Output, error) {
		// convert with your parser
	})
}
```

The reference parser does exactly this in `packages/parser/render/conformance_test.go`.

## Other languages

Read the files in `cases/` directly: convert each `.md`, compare with the `.html`, and compare the warnings with the `.warnings.json`.

## Adding or changing a case

1. Add `cases/<group>/<name>.md`.
2. Generate the expected files with the reference parser:

   ```bash
   cd packages/parser && go test ./render -run TestConformance -update
   ```

3. **Read the generated `.html` and `.warnings.json`** and check them against the spec. `-update` records whatever the parser does, bugs included. Review the diff of every changed file before committing.

`packages/contracts` has its own test that checks the suite itself: at least 20 cases, every `.md` has an `.html`, no orphaned expected files, and every group has cases.
