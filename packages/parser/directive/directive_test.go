package directive

import (
	"reflect"
	"strings"
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/yuin/goldmark/ast"
)

// outline renders the tree as one line per node, for readable assertions.
func outline(doc ast.Node, src []byte) string {
	var b strings.Builder
	var walk func(n ast.Node, depth int)
	walk = func(n ast.Node, depth int) {
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			b.WriteString(strings.Repeat("  ", depth))
			if d, ok := c.(*Directive); ok {
				b.WriteString("directive " + d.Name + " " + string(d.Form) + "/" + string(d.ComponentKind))
			} else {
				b.WriteString(c.Kind().String())
			}
			b.WriteString("\n")
			walk(c, depth+1)
		}
	}
	walk(doc, 0)
	return b.String()
}

func directives(doc ast.Node) []*Directive {
	var out []*Directive
	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if d, ok := n.(*Directive); ok && entering {
			out = append(out, d)
		}
		return ast.WalkContinue, nil
	})
	return out
}

func codes(ws []contracts.Warning) []string {
	var out []string
	for _, w := range ws {
		out = append(out, w.Code)
	}
	return out
}

func ptr[T any](v T) *T { return &v }

// parse uses the temporary M1 definitions, passed in as data like any other definitions.
func parse(t *testing.T, src string, opts ...Option) (ast.Node, []contracts.Warning) {
	t.Helper()
	defs, err := contracts.M1Components()
	if err != nil {
		t.Fatal(err)
	}
	return Parse([]byte(src), append([]Option{WithComponents(defs...)}, opts...)...)
}

func TestContainerBlock(t *testing.T) {
	src := "intro\n\n:::readaloud\nThe torches **gutter**.\n\n- one\n- two\n:::\n\nafter\n"
	doc, ws := parse(t, src)
	want := "Paragraph\n  Text\ndirective readaloud block/container\n  Paragraph\n    Text\n    Emphasis\n      Text\n    Text\n  List\n    ListItem\n      TextBlock\n        Text\n    ListItem\n      TextBlock\n        Text\nParagraph\n  Text\n"
	if got := outline(doc, []byte(src)); got != want {
		t.Fatalf("outline:\n%s\nwant:\n%s", got, want)
	}
	if len(ws) != 0 {
		t.Fatalf("unexpected warnings: %v", codes(ws))
	}
	d := directives(doc)[0]
	if !d.Closed || d.Breakable == nil || !*d.Breakable {
		t.Fatalf("closed=%v breakable=%v", d.Closed, d.Breakable)
	}
	if d.Range.Start.Line != 3 || d.Range.End.Line != 8 {
		t.Fatalf("range = %+v", d.Range)
	}
}

func TestLeafDirective(t *testing.T) {
	src := "before\n\n::pagebreak\n\nafter\n"
	doc, ws := parse(t, src)
	if got, want := outline(doc, []byte(src)), "Paragraph\n  Text\ndirective pagebreak leaf/leaf\nParagraph\n  Text\n"; got != want {
		t.Fatalf("outline:\n%s\nwant:\n%s", got, want)
	}
	if len(ws) != 0 {
		t.Fatalf("unexpected warnings: %v", codes(ws))
	}
	d := directives(doc)[0]
	if d.Breakable != nil || !d.Closed || d.Range.Start.Line != 3 {
		t.Fatalf("leaf = %+v", d)
	}
}

func TestDataBodyIsKeptRaw(t *testing.T) {
	src := ":::statblock{system=\"5e\"}\nname: Bone Warden\nac: 15\n\n  traits:\n    - :::readaloud\n:::\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if len(ds) != 1 {
		t.Fatalf("directives = %d, want 1 (data bodies are not scanned for directives)", len(ds))
	}
	d := ds[0]
	if d.ComponentKind != contracts.NodeKindData || d.Breakable == nil || *d.Breakable {
		t.Fatalf("statblock = %+v", d)
	}
	if got, want := d.Raw([]byte(src)), "name: Bone Warden\nac: 15\n\n  traits:\n    - :::readaloud"; got != want {
		t.Fatalf("raw = %q, want %q", got, want)
	}
	if d.FirstChild() != nil || len(ws) != 0 {
		t.Fatalf("children=%v warnings=%v", d.FirstChild(), codes(ws))
	}
}

func TestAttributesOnDirective(t *testing.T) {
	doc, ws := parse(t, ":::sidebar{title=\"Variant: \\\"Lingering\\\" Injuries\" #side .wide}\nbody\n:::\n")
	d := directives(doc)[0]
	want := map[string]string{"title": `Variant: "Lingering" Injuries`, "id": "side", "class": "wide"}
	if !reflect.DeepEqual(d.Attrs.Values, want) {
		t.Fatalf("attrs = %v, want %v", d.Attrs.Values, want)
	}
	if !reflect.DeepEqual(d.Attrs.Order, []string{"title", "id", "class"}) || len(ws) != 0 {
		t.Fatalf("order = %v warnings = %v", d.Attrs.Order, codes(ws))
	}
}

func TestMalformedAttributesKeepDirective(t *testing.T) {
	doc, ws := parse(t, ":::sidebar{title=\"ok\" broken=\"x}\nbody\n:::\n")
	d := directives(doc)[0]
	if d.Attrs.Values["title"] != "ok" || d.Name != "sidebar" || !d.Closed {
		t.Fatalf("directive = %+v", d)
	}
	if !reflect.DeepEqual(codes(ws), []string{"attr.syntax"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
	if ws[0].Component == nil || *ws[0].Component != "sidebar" || ws[0].Range.Start.Line != 1 {
		t.Fatalf("warning = %+v", ws[0])
	}
}

func TestDuplicateAttribute(t *testing.T) {
	_, ws := parse(t, "::pagebreak{id=a id=b}\n")
	if !reflect.DeepEqual(codes(ws), []string{"attr.duplicate"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestNestingByLongerFences(t *testing.T) {
	src := "::::sidebar{title=\"Ambush\"}\nRoll initiative twice.\n\n:::readaloud\nSteel rings out.\n:::\n\nAfter the inner block.\n::::\n\ntail\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if len(ds) != 2 || ds[0].Name != "sidebar" || ds[1].Name != "readaloud" {
		t.Fatalf("directives = %v", ds)
	}
	if ds[1].Parent() != ast.Node(ds[0]) {
		t.Fatalf("readaloud should be a child of sidebar")
	}
	if !ds[0].Closed || !ds[1].Closed || len(ws) != 0 {
		t.Fatalf("closed = %v %v, warnings = %v", ds[0].Closed, ds[1].Closed, codes(ws))
	}
	// The paragraph after the inner block is still inside the sidebar.
	last := ds[0].LastChild()
	if last.Kind() != ast.KindParagraph || ds[0].Range.End.Line != 9 {
		t.Fatalf("last child = %v, end line = %d", last.Kind(), ds[0].Range.End.Line)
	}
}

func TestInnerFenceNeverClosesOuter(t *testing.T) {
	// A shorter closing line closes the inner block; the outer stays open until its own fence.
	src := "::::sidebar\n:::readaloud\ntext\n:::\nmore\n::::\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if len(ws) != 0 || !ds[0].Closed || !ds[1].Closed {
		t.Fatalf("warnings = %v", codes(ws))
	}
	if ds[0].Range.End.Line != 6 || ds[1].Range.End.Line != 4 {
		t.Fatalf("ranges: outer %+v inner %+v", ds[0].Range, ds[1].Range)
	}
}

func TestEqualFencesCloseInnermostFirst(t *testing.T) {
	src := ":::sidebar\n:::readaloud\ntext\n:::\nmore\n:::\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if len(ws) != 0 || len(ds) != 2 || ds[1].Parent() != ast.Node(ds[0]) {
		t.Fatalf("directives = %d, warnings = %v", len(ds), codes(ws))
	}
	if ds[1].Range.End.Line != 4 || ds[0].Range.End.Line != 6 {
		t.Fatalf("ranges: outer %+v inner %+v", ds[0].Range, ds[1].Range)
	}
}

func TestLongerClosingLineClosesBlock(t *testing.T) {
	doc, ws := parse(t, ":::readaloud\ntext\n::::::\n")
	if len(ws) != 0 || !directives(doc)[0].Closed {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestClosingLineMayBeIndentedAndPadded(t *testing.T) {
	doc, ws := parse(t, "  :::readaloud  \ntext\n   :::   \n")
	if len(ws) != 0 || !directives(doc)[0].Closed {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestUnclosedBlockRunsToEndOfDocument(t *testing.T) {
	src := ":::readaloud\nfirst\n\nsecond\n"
	doc, ws := parse(t, src)
	d := directives(doc)[0]
	if d.Closed || d.ChildCount() != 2 {
		t.Fatalf("closed=%v children=%d", d.Closed, d.ChildCount())
	}
	if !reflect.DeepEqual(codes(ws), []string{"directive.unclosed"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
	if ws[0].Range.Start.Line != 1 || ws[0].Range.End.Line != 4 {
		t.Fatalf("range = %+v", ws[0].Range)
	}
}

// A closing line closes the innermost open directive whose fence is the same or shorter, so a
// longer line closes the inner block, and the outer one is reported as unclosed.
func TestLongerClosingLineClosesInnermost(t *testing.T) {
	src := "::::sidebar\n:::readaloud\ntext\n::::\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if ds[0].Closed || !ds[1].Closed {
		t.Fatalf("closed = %v %v", ds[0].Closed, ds[1].Closed)
	}
	if !reflect.DeepEqual(codes(ws), []string{"directive.unclosed"}) || *ws[0].Component != "sidebar" {
		t.Fatalf("warnings = %+v", ws)
	}
}

func TestUnclosedDataBlock(t *testing.T) {
	doc, ws := parse(t, ":::statblock\nname: X\n")
	d := directives(doc)[0]
	if d.Closed || !reflect.DeepEqual(codes(ws), []string{"directive.unclosed"}) {
		t.Fatalf("closed=%v warnings=%v", d.Closed, codes(ws))
	}
}

func TestUnclosedBlockEndsWithEnclosingContainer(t *testing.T) {
	src := "> :::readaloud\n> text\n\nafter the quote\n"
	doc, ws := parse(t, src)
	if !reflect.DeepEqual(codes(ws), []string{"directive.unclosed"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
	if doc.LastChild().Kind() != ast.KindParagraph {
		t.Fatalf("content after the blockquote should be outside the directive")
	}
}

func TestUnknownBlockDirective(t *testing.T) {
	src := ":::mystery{x=1}\nNot a **known** component.\n:::\n\nstill parsed\n"
	doc, ws := parse(t, src)
	d := directives(doc)[0]
	if d.ComponentKind != contracts.NodeKindUnknown || d.Name != "mystery" || d.Attrs.Values["x"] != "1" {
		t.Fatalf("directive = %+v", d)
	}
	if got := d.Raw([]byte(src)); got != "Not a **known** component." {
		t.Fatalf("raw = %q", got)
	}
	if d.FirstChild() != nil {
		t.Fatal("unknown bodies are not interpreted")
	}
	if !reflect.DeepEqual(codes(ws), []string{"component.unknown"}) || ws[0].Severity != contracts.WarningSeverityWarning {
		t.Fatalf("warnings = %+v", ws)
	}
	if !reflect.DeepEqual(codes(d.Warnings), []string{"component.unknown"}) {
		t.Fatalf("node warnings = %v", codes(d.Warnings))
	}
	if doc.LastChild().Kind() != ast.KindParagraph {
		t.Fatal("the rest of the document must still parse")
	}
}

func TestUnknownLeafDirective(t *testing.T) {
	doc, ws := parse(t, "::mystery{x=1}\n")
	d := directives(doc)[0]
	if d.ComponentKind != contracts.NodeKindUnknown || d.Form != contracts.NodeFormLeaf || !d.Closed {
		t.Fatalf("directive = %+v", d)
	}
	if !reflect.DeepEqual(codes(ws), []string{"component.unknown"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestReservedNamesAreUnknownUntilDefined(t *testing.T) {
	for _, name := range []string{"layout", "page", "figure", "toc", "spell", "item", "roll"} {
		_, ws := parse(t, "::"+name+"\n")
		if !reflect.DeepEqual(codes(ws), []string{"component.unknown"}) {
			t.Errorf("%s: warnings = %v", name, codes(ws))
		}
	}
}

func TestPluginComponents(t *testing.T) {
	spell := contracts.ComponentDefinition{
		Name: "spell", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindData,
		Breakable: ptr(false),
	}
	doc, ws := parse(t, ":::spell\nname: Fireball\n:::\n", WithComponents(spell))
	d := directives(doc)[0]
	if d.ComponentKind != contracts.NodeKindData || len(ws) != 0 {
		t.Fatalf("directive = %+v warnings = %v", d, codes(ws))
	}
	// Nothing is built in: with no definitions every directive is unknown.
	_, ws = Parse([]byte(":::readaloud\nx\n:::\n"))
	if !reflect.DeepEqual(codes(ws), []string{"component.unknown"}) {
		t.Fatalf("no definitions: warnings = %v", codes(ws))
	}
}

func TestWrongForm(t *testing.T) {
	// Block fence on a leaf component: kept as a leaf, fenced body preserved raw.
	src := ":::pagebreak\nleftover\n:::\n"
	doc, ws := parse(t, src)
	d := directives(doc)[0]
	if d.Form != contracts.NodeFormLeaf || d.Raw([]byte(src)) != "leftover" || !d.Closed {
		t.Fatalf("directive = %+v raw=%q", d, d.Raw([]byte(src)))
	}
	if !reflect.DeepEqual(codes(ws), []string{"directive.wrong-form"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
	// Leaf syntax on a block component: recognised, with an empty body.
	doc, ws = parse(t, "::readaloud\n\nnext\n")
	d = directives(doc)[0]
	if d.Form != contracts.NodeFormBlock || d.ComponentKind != contracts.NodeKindContainer || d.FirstChild() != nil {
		t.Fatalf("directive = %+v", d)
	}
	if !reflect.DeepEqual(codes(ws), []string{"directive.wrong-form"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestStrayClosingLine(t *testing.T) {
	doc, ws := parse(t, "text\n\n:::\n\nmore\n")
	if len(directives(doc)) != 0 {
		t.Fatal("no directive expected")
	}
	if !reflect.DeepEqual(codes(ws), []string{"directive.stray-close"}) || ws[0].Range.Start.Line != 3 {
		t.Fatalf("warnings = %+v", ws)
	}
}

func TestNotDirectives(t *testing.T) {
	cases := map[string]string{
		"uppercase name":         ":::Readaloud\nx\n:::\n",
		"junk after name":        ":::readaloud extra\nx\n:::\n",
		"junk after attributes":  ":::readaloud{a=1} extra\nx\n:::\n",
		"single colon":           ":readaloud\n",
		"indented code":          "    :::readaloud\n",
		"escaped":                "\\::pagebreak\n",
		"no space prose":         "Note: this is text\n",
		"interrupting paragraph": "para\n::pagebreak\n",
	}
	for name, src := range cases {
		t.Run(name, func(t *testing.T) {
			doc, _ := parse(t, src)
			if n := len(directives(doc)); n != 0 {
				t.Fatalf("found %d directives in %q", n, src)
			}
		})
	}
}

func TestDirectivesInsideCodeAreLiteral(t *testing.T) {
	doc, ws := parse(t, "```\n:::readaloud\n```\n\n    ::pagebreak\n")
	if len(directives(doc)) != 0 || len(ws) != 0 {
		t.Fatalf("directives=%d warnings=%v", len(directives(doc)), codes(ws))
	}
}

func TestDirectiveInsideFencedCodeInsideContainer(t *testing.T) {
	src := ":::readaloud\n```\n:::\n```\ntext\n:::\n"
	doc, ws := parse(t, src)
	d := directives(doc)[0]
	if len(ws) != 0 || !d.Closed || d.Range.End.Line != 6 {
		t.Fatalf("warnings = %v closed=%v range=%+v", codes(ws), d.Closed, d.Range)
	}
}

func TestWarningsAreInSourceOrder(t *testing.T) {
	_, ws := parse(t, "::first\n\n:::\n\n::second\n")
	if !reflect.DeepEqual(codes(ws), []string{"component.unknown", "directive.stray-close", "component.unknown"}) {
		t.Fatalf("warnings = %v", codes(ws))
	}
}

func TestCRLF(t *testing.T) {
	src := ":::readaloud\r\ntext\r\n:::\r\n\r\n::pagebreak\r\n"
	doc, ws := parse(t, src)
	ds := directives(doc)
	if len(ds) != 2 || len(ws) != 0 || !ds[0].Closed {
		t.Fatalf("directives=%d warnings=%v", len(ds), codes(ws))
	}
}
