package directive

import (
	"strings"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/yuin/goldmark/ast"
)

// KindDirective is the Goldmark node kind of a Directive.
var KindDirective = ast.NewNodeKind("Directive")

// Directive is a parsed block or leaf directive (spec section 2).
//
// What the body holds depends on ComponentKind:
//   - container: Markdown, parsed into the node's children.
//   - data, unknown, and a leaf component written with a block fence: not interpreted here.
//     The raw lines are kept; read them with Raw.
//   - leaf: no body.
type Directive struct {
	ast.BaseBlock

	Name string
	// Form is the form the directive is treated as (block or leaf).
	Form contracts.NodeForm
	// ComponentKind is unknown when no component definition was found.
	ComponentKind contracts.NodeKind
	// Attrs holds the attributes; values are always strings.
	Attrs Attrs
	// Breakable is the resolved flag from the component definition, nil for leaf and unknown components.
	Breakable *bool
	// Fence is the number of colons in the opening line.
	Fence int
	// Closed reports whether a closing line was found (always true for leaf directives).
	Closed bool
	// Range is the source range, from the opening line to the end of the closing line.
	Range contracts.Position
	// Warnings are the problems found with this directive (not its children).
	Warnings []contracts.Warning

	startOffset, endOffset int
	rawBody                bool
	// blockSyntax is true when written with three or more colons.
	blockSyntax bool
	problems    []attrProblem
	// fenceChar and fenceLen track an open fenced code block in a container body.
	fenceChar byte
	fenceLen  int
}

// IsRaw tells Goldmark not to parse the body as inline Markdown when it is kept as raw text.
func (d *Directive) IsRaw() bool { return d.rawBody }

// Kind implements ast.Node.
func (d *Directive) Kind() ast.NodeKind { return KindDirective }

// Dump implements ast.Node.
func (d *Directive) Dump(source []byte, level int) {
	ast.DumpHelper(d, source, level, map[string]string{
		"Name": d.Name, "Form": string(d.Form), "ComponentKind": string(d.ComponentKind),
	}, nil)
}

// Raw returns the uninterpreted body text, without the trailing newline.
// It is empty for container and leaf directives.
func (d *Directive) Raw(source []byte) string {
	var b strings.Builder
	lines := d.Lines()
	for i := 0; i < lines.Len(); i++ {
		seg := lines.At(i)
		b.Write(seg.Value(source))
	}
	return strings.TrimRight(b.String(), "\r\n")
}
