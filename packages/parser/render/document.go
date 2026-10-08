package render

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/parser/directive"
	"github.com/yuin/goldmark/ast"
	east "github.com/yuin/goldmark/extension/ast"
)

// defaultVersion is the spec version assumed when the front matter does not declare one.
const defaultVersion = "0.1"

var versionRE = regexp.MustCompile(`^[0-9]+\.[0-9]+$`)

// buildDocument converts the parsed tree to the contracts Document, which is what the editor
// loads. Raw HTML is dropped, as it is from the HTML output.
func buildDocument(source []byte, root ast.Node, warnings []contracts.Warning, frontMatter map[string]any) contracts.Document {
	version := defaultVersion
	if v, ok := frontMatter["rosetta"].(string); ok && versionRE.MatchString(v) {
		version = v
	}
	doc := contracts.Document{RosettaVersion: version, Children: []contracts.Node{}, Warnings: warnings, FrontMatter: frontMatter}
	if doc.Warnings == nil {
		doc.Warnings = []contracts.Warning{}
	}
	doc.Children = convertChildren(source, root)
	return doc
}

func convertChildren(source []byte, n ast.Node) []contracts.Node {
	out := []contracts.Node{}
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		out = append(out, convertNode(source, c)...)
	}
	return out
}

func strp(s string) *string { return &s }

func linesText(source []byte, n ast.Node) string {
	var b strings.Builder
	lines := n.Lines()
	for i := 0; i < lines.Len(); i++ {
		seg := lines.At(i)
		b.Write(seg.Value(source))
	}
	return b.String()
}

// plainText concatenates the text under an inline node, for alt text and code spans.
func plainText(source []byte, n ast.Node) string {
	var b strings.Builder
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		switch t := c.(type) {
		case *ast.Text:
			b.Write(t.Segment.Value(source))
			if t.SoftLineBreak() {
				b.WriteByte(' ')
			}
		case *ast.String:
			b.Write(t.Value)
		default:
			b.WriteString(plainText(source, c))
		}
	}
	return b.String()
}

func convertNode(source []byte, n ast.Node) []contracts.Node {
	node := func(t contracts.NodeType) contracts.Node { return contracts.Node{Type: t} }
	withChildren := func(t contracts.NodeType) []contracts.Node {
		x := node(t)
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	}
	switch v := n.(type) {
	case *ast.Heading:
		x := node(contracts.NodeTypeHeading)
		d := v.Level
		x.Depth = &d
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	case *ast.Paragraph, *ast.TextBlock:
		return withChildren(contracts.NodeTypeParagraph)
	case *ast.Blockquote:
		return withChildren(contracts.NodeTypeBlockquote)
	case *ast.List:
		x := node(contracts.NodeTypeList)
		ordered := v.IsOrdered()
		x.Ordered = &ordered
		if ordered {
			start := v.Start
			x.Start = &start
		}
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	case *ast.ListItem:
		return withChildren(contracts.NodeTypeListItem)
	case *ast.FencedCodeBlock:
		x := node(contracts.NodeTypeCode)
		val := linesText(source, n)
		x.Value = &val
		if lang := v.Language(source); len(lang) > 0 {
			x.Lang = strp(string(lang))
		}
		return []contracts.Node{x}
	case *ast.CodeBlock:
		x := node(contracts.NodeTypeCode)
		val := linesText(source, n)
		x.Value = &val
		return []contracts.Node{x}
	case *ast.ThematicBreak:
		return []contracts.Node{node(contracts.NodeTypeThematicBreak)}
	case *ast.HTMLBlock, *ast.RawHTML:
		return nil
	case *ast.Text:
		x := node(contracts.NodeTypeText)
		val := string(v.Segment.Value(source))
		if v.SoftLineBreak() {
			val += "\n"
		}
		x.Value = &val
		out := []contracts.Node{x}
		if v.HardLineBreak() {
			out = append(out, node(contracts.NodeTypeBreak))
		}
		return out
	case *ast.String:
		x := node(contracts.NodeTypeText)
		val := string(v.Value)
		x.Value = &val
		return []contracts.Node{x}
	case *ast.Emphasis:
		if v.Level >= 2 {
			return withChildren(contracts.NodeTypeStrong)
		}
		return withChildren(contracts.NodeTypeEmphasis)
	case *ast.CodeSpan:
		x := node(contracts.NodeTypeInlineCode)
		val := plainText(source, n)
		x.Value = &val
		return []contracts.Node{x}
	case *ast.Link:
		x := node(contracts.NodeTypeLink)
		x.URL = strp(string(v.Destination))
		if len(v.Title) > 0 {
			x.Title = strp(string(v.Title))
		}
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	case *ast.AutoLink:
		x := node(contracts.NodeTypeLink)
		x.URL = strp(string(v.URL(source)))
		label := string(v.Label(source))
		t := node(contracts.NodeTypeText)
		t.Value = &label
		x.Children = []contracts.Node{t}
		return []contracts.Node{x}
	case *ast.Image:
		x := node(contracts.NodeTypeImage)
		x.URL = strp(string(v.Destination))
		if len(v.Title) > 0 {
			x.Title = strp(string(v.Title))
		}
		x.Alt = strp(plainText(source, n))
		return []contracts.Node{x}
	case *east.Table:
		x := node(contracts.NodeTypeTable)
		for _, a := range v.Alignments {
			x.Align = append(x.Align, map[east.Alignment]contracts.NodeAlignElem{
				east.AlignLeft: contracts.NodeAlignElemLeft, east.AlignRight: contracts.NodeAlignElemRight,
				east.AlignCenter: contracts.NodeAlignElemCenter, east.AlignNone: contracts.NodeAlignElemNone,
			}[a])
		}
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	case *east.TableHeader, *east.TableRow:
		x := node(contracts.NodeTypeTableRow)
		if _, ok := n.(*east.TableHeader); ok {
			header := true
			x.Header = &header
		}
		x.Children = convertChildren(source, n)
		return []contracts.Node{x}
	case *east.TableCell:
		return withChildren(contracts.NodeTypeTableCell)
	case *directive.Directive:
		return []contracts.Node{convertDirective(source, v)}
	}
	// Unknown node kinds keep their children, so no text is lost.
	return convertChildren(source, n)
}

func convertDirective(source []byte, d *directive.Directive) contracts.Node {
	x := contracts.Node{Type: contracts.NodeTypeDirective}
	x.Name = strp(d.Name)
	form := d.Form
	x.Form = &form
	kind := d.ComponentKind
	x.Kind = &kind
	x.Breakable = d.Breakable
	x.Attributes = map[string]string{}
	for k, v := range d.Attrs.Values {
		x.Attributes[k] = v
	}
	rng := d.Range
	x.Position = &rng
	x.Warnings = d.Warnings
	switch d.ComponentKind {
	case contracts.NodeKindContainer:
		x.Children = convertChildren(source, d)
	case contracts.NodeKindUnknown:
		x.Raw = strp(d.Raw(source))
	case contracts.NodeKindData:
		if res, ok := d.Attribute(attrData); ok {
			if data, ok := res.(*dataResult); ok && data != nil {
				if data.Fatal != nil {
					x.Raw = strp(d.Raw(source))
				} else {
					x.Fields = fieldsToMap(data.Fields)
				}
			}
		}
	}
	return x
}

func fieldsToMap(fields []Field) map[string]interface{} {
	out := map[string]interface{}{}
	for _, f := range fields {
		if f.Missing {
			continue
		}
		out[f.Name] = valueToAny(f.Value)
	}
	return out
}

func valueToAny(v Value) interface{} {
	switch v.Kind {
	case List:
		items := make([]interface{}, 0, len(v.Items))
		for _, it := range v.Items {
			items = append(items, valueToAny(it))
		}
		return items
	case Map:
		return fieldsToMap(v.Fields)
	}
	switch v.Type {
	case "int":
		if i, err := strconv.ParseInt(v.Text, 0, 64); err == nil {
			return i
		}
	case "float":
		if f, err := strconv.ParseFloat(v.Text, 64); err == nil {
			return f
		}
	case "bool":
		return v.Text == "true"
	case "null":
		return nil
	}
	return v.Text
}
