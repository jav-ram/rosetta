package directive

import (
	"bytes"
	"fmt"
	"sort"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

var stateKey = parser.NewContextKey()

// state is per-parse: the stack of open directives and the collected warnings.
type state struct {
	open     []*Directive
	warnings []contracts.Warning
}

func getState(pc parser.Context) *state {
	if s, ok := pc.Get(stateKey).(*state); ok {
		return s
	}
	s := &state{}
	pc.Set(stateKey, s)
	return s
}

// Warnings returns every warning found in a parse, in source order. It includes the warnings
// attached to directive nodes, and those with no node (such as a stray closing line).
func Warnings(pc parser.Context) []contracts.Warning {
	s, ok := pc.Get(stateKey).(*state)
	if !ok {
		return nil
	}
	out := append([]contracts.Warning(nil), s.warnings...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].Range, out[j].Range
		if a == nil || b == nil {
			return false
		}
		return a.Start.Line < b.Start.Line
	})
	return out
}

type blockParser struct {
	components map[string]contracts.ComponentDefinition
}

func (p *blockParser) Trigger() []byte { return []byte{':'} }

func (p *blockParser) CanInterruptParagraph() bool { return false }

func (p *blockParser) CanAcceptIndentedLine() bool { return false }

// isName reports whether c can start (first) or continue a component name.
func isNameChar(c byte, first bool) bool {
	if c >= 'a' && c <= 'z' {
		return true
	}
	return !first && ((c >= '0' && c <= '9') || c == '-')
}

// countColons returns the number of leading colons in b.
func countColons(b []byte) int {
	n := 0
	for n < len(b) && b[n] == ':' {
		n++
	}
	return n
}

// closingColons returns the colon count if line is a closing line (only colons and spaces,
// at most three spaces of indent), else 0.
func closingColons(line []byte) int {
	if indentWidth(line) > 3 {
		return 0
	}
	t := bytes.TrimSpace(line)
	n := countColons(t)
	if n < 3 || n != len(t) {
		return 0
	}
	return n
}

func (p *blockParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, segment := reader.PeekLine()
	if indentWidth(line) > 3 {
		return nil, parser.NoChildren
	}
	indent := len(line) - len(bytes.TrimLeft(line, " \t"))
	body := bytes.TrimRight(line[indent:], " \t\r\n")
	n := countColons(body)
	if n < 2 {
		return nil, parser.NoChildren
	}
	rest := body[n:]

	if len(rest) == 0 {
		if n >= 3 {
			// A closing line with nothing to close: ordinary paragraph (spec 8.4).
			p.stray(reader, pc, segment)
		}
		return nil, parser.NoChildren
	}

	// Name.
	i := 0
	for i < len(rest) && isNameChar(rest[i], i == 0) {
		i++
	}
	if i == 0 {
		return nil, parser.NoChildren
	}
	name := string(rest[:i])
	rest = rest[i:]

	var attrs Attrs
	var problems []attrProblem
	if len(rest) > 0 && rest[0] == '{' {
		var used int
		attrs, used, problems = parseAttrs(string(rest))
		inside := rest[1:used]
		if len(inside) > 0 && inside[len(inside)-1] == '}' {
			inside = inside[:len(inside)-1]
		}
		attrs.Raw, attrs.HasRaw = string(inside), true
		rest = rest[used:]
	} else {
		attrs = Attrs{Values: map[string]string{}}
	}
	if len(bytes.TrimSpace(rest)) != 0 {
		return nil, parser.NoChildren // junk after the directive: not a directive
	}

	d := &Directive{
		Name: name, Attrs: attrs, Fence: n, problems: problems,
		startOffset: segment.Start + indent,
		endOffset:   segment.Start + indent + len(body),
		blockSyntax: n >= 3,
	}
	def, known := p.components[name]
	if known {
		d.Breakable = def.Breakable
	}
	d.Form = contracts.NodeFormLeaf
	if d.blockSyntax {
		d.Form = contracts.NodeFormBlock
	}
	switch {
	case !known:
		d.ComponentKind = contracts.NodeKindUnknown
		d.rawBody = d.blockSyntax
	case def.Form == contracts.ComponentDefinitionFormLeaf:
		d.ComponentKind = contracts.NodeKindLeaf
		d.Form = contracts.NodeFormLeaf
		d.rawBody = d.blockSyntax // block fence on a leaf component: body kept raw
		if d.blockSyntax {
			d.problems = append(d.problems, attrProblem{"directive.wrong-form",
				fmt.Sprintf("%q is a leaf component; write it as ::%s. The fenced body is kept as raw text.", name, name), ""})
		}
	default:
		d.ComponentKind = contracts.NodeKind(def.Kind)
		d.Form = contracts.NodeFormBlock
		d.rawBody = def.Kind == contracts.ComponentDefinitionKindData
		if !d.blockSyntax {
			d.problems = append(d.problems, attrProblem{"directive.wrong-form",
				fmt.Sprintf("%q is a block component; write it as :::%s ... :::. It has an empty body.", name, name), ""})
		}
	}

	reader.Advance(segment.Len() - 1)
	if !d.blockSyntax {
		d.Closed = true
		return d, parser.NoChildren
	}
	getState(pc).open = append(getState(pc).open, d)
	if d.rawBody {
		return d, parser.NoChildren
	}
	return d, parser.HasChildren
}

// isTarget reports whether a closing line with n colons closes d: the innermost open
// directive whose fence has the same or fewer colons (spec 2.2).
func isTarget(pc parser.Context, d *Directive, n int) bool {
	open := getState(pc).open
	for i := len(open) - 1; i >= 0; i-- {
		if open[i].Fence <= n {
			return open[i] == d
		}
	}
	return false
}

func (p *blockParser) Continue(node ast.Node, reader text.Reader, pc parser.Context) parser.State {
	d := node.(*Directive)
	if !d.blockSyntax {
		return parser.Close
	}
	line, segment := reader.PeekLine()
	// Directive lines inside a fenced code block are literal text (spec 2.2).
	inFence := !d.rawBody && d.trackFence(line)
	if n := closingColons(line); n > 0 && !inFence && isTarget(pc, d, n) {
		d.Closed = true
		d.endOffset = segment.Start + len(bytes.TrimRight(line, " \t\r\n"))
		reader.Advance(segment.Len() - 1)
		return parser.Close
	}
	if end := segment.Start + len(bytes.TrimRight(line, " \t\r\n")); end > d.endOffset {
		d.endOffset = end
	}
	if d.rawBody {
		d.Lines().Append(segment)
		reader.Advance(segment.Len() - 1)
		return parser.Continue | parser.NoChildren
	}
	return parser.Continue | parser.HasChildren
}

func (p *blockParser) Close(node ast.Node, reader text.Reader, pc parser.Context) {
	d := node.(*Directive)
	st := getState(pc)
	for i := len(st.open) - 1; i >= 0; i-- {
		if st.open[i] == d {
			st.open = append(st.open[:i], st.open[i+1:]...)
			break
		}
	}
	source := reader.Source()
	d.Range = contracts.Position{Start: pointAt(source, d.startOffset), End: pointAt(source, d.endOffset)}
	rng := d.Range

	add := func(code, msg, field string) {
		w := contracts.Warning{Code: code, Severity: contracts.WarningSeverityWarning, Message: msg, Component: &d.Name, Range: &rng}
		if field != "" {
			w.Field = &field
		}
		d.Warnings = append(d.Warnings, w)
	}
	for _, pr := range d.problems {
		add(pr.code, pr.message, pr.field)
	}
	if d.ComponentKind == contracts.NodeKindUnknown {
		add("component.unknown", fmt.Sprintf("Unknown component %q.", d.Name), "")
	}
	if !d.Closed {
		add("directive.unclosed", fmt.Sprintf("Block directive %q is never closed; its body runs to the end of the enclosing content.", d.Name), "")
	}
	st.warnings = append(st.warnings, d.Warnings...)
}

func (p *blockParser) stray(reader text.Reader, pc parser.Context, segment text.Segment) {
	source := reader.Source()
	line, _ := reader.PeekLine()
	end := segment.Start + len(bytes.TrimRight(line, " \t\r\n"))
	rng := contracts.Position{Start: pointAt(source, segment.Start), End: pointAt(source, end)}
	st := getState(pc)
	st.warnings = append(st.warnings, contracts.Warning{
		Code: "directive.stray-close", Severity: contracts.WarningSeverityWarning, Range: &rng,
		Message: "Closing line with no open block directive; treated as text.",
	})
}

// pointAt converts a byte offset to a 1-based line and column.
func pointAt(source []byte, offset int) contracts.Point {
	if offset > len(source) {
		offset = len(source)
	}
	line := 1 + bytes.Count(source[:offset], []byte{'\n'})
	col := offset - (bytes.LastIndexByte(source[:offset], '\n') + 1) + 1
	return contracts.Point{Line: line, Column: col, Offset: &offset}
}

func indentWidth(line []byte) int {
	w, _ := util.IndentWidth(line, 0)
	return w
}

// trackFence follows fenced code blocks in a container body. It reports whether line is
// inside a fence, or is a fence line itself, so it cannot be a closing line.
func (d *Directive) trackFence(line []byte) bool {
	if indentWidth(line) > 3 {
		return d.fenceLen > 0
	}
	t := bytes.TrimSpace(line)
	if d.fenceLen > 0 {
		n := countByte(t, d.fenceChar)
		if n >= d.fenceLen && n == len(t) {
			d.fenceLen = 0
		}
		return true
	}
	for _, c := range []byte{'`', '~'} {
		if n := countByte(t, c); n >= 3 {
			if c == '`' && bytes.IndexByte(t[n:], '`') >= 0 {
				return false // inline code span, not a fence
			}
			d.fenceChar, d.fenceLen = c, n
			return true
		}
	}
	return false
}

func countByte(b []byte, c byte) int {
	n := 0
	for n < len(b) && b[n] == c {
		n++
	}
	return n
}

// AddWarnings records warnings found after parsing, for example while validating a
// directive's fields, so they are returned by Warnings together with the parse warnings.
func AddWarnings(pc parser.Context, ws ...contracts.Warning) {
	st := getState(pc)
	st.warnings = append(st.warnings, ws...)
}
