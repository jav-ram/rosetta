package render

import (
	"encoding/json"
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/contracts/conformance"
)

// Every conformance input must produce an AST that satisfies the contracts schema.
func TestDocumentValidatesAgainstSchema(t *testing.T) {
	cases, err := conformance.Cases()
	if err != nil {
		t.Fatal(err)
	}
	defs := m1(t)
	for _, c := range cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			r, err := Convert(c.Markdown, WithComponents(defs...))
			if err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(r.Document)
			if err != nil {
				t.Fatal(err)
			}
			if err := contracts.Validate(contracts.SchemaDocument, data); err != nil {
				t.Fatalf("AST does not satisfy the schema: %v\n%s", err, data)
			}
		})
	}
}

func docJSON(t *testing.T, src string) map[string]any {
	t.Helper()
	r := convert(t, src)
	data, _ := json.Marshal(r.Document)
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func child(t *testing.T, n map[string]any, i int) map[string]any {
	t.Helper()
	kids, _ := n["children"].([]any)
	if i >= len(kids) {
		t.Fatalf("node has %d children, want index %d: %v", len(kids), i, n)
	}
	return kids[i].(map[string]any)
}

func TestDocumentStandardMarkdown(t *testing.T) {
	d := docJSON(t, "# Title\n\nSome *em* and **strong** and `code` and [a link](https://x.y \"T\").\n\n- one\n- two\n\n```go\nx := 1\n```\n")
	h := child(t, d, 0)
	if h["type"] != "heading" || h["depth"] != float64(1) || child(t, h, 0)["value"] != "Title" {
		t.Fatalf("heading = %v", h)
	}
	p := child(t, d, 1)
	types := []string{}
	for _, c := range p["children"].([]any) {
		types = append(types, c.(map[string]any)["type"].(string))
	}
	want := []string{"text", "emphasis", "text", "strong", "text", "inlineCode", "text", "link", "text"}
	if len(types) != len(want) {
		t.Fatalf("inline types = %v", types)
	}
	for i := range want {
		if types[i] != want[i] {
			t.Fatalf("inline types = %v, want %v", types, want)
		}
	}
	link := child(t, p, 7)
	if link["url"] != "https://x.y" || link["title"] != "T" {
		t.Fatalf("link = %v", link)
	}
	list := child(t, d, 2)
	if list["type"] != "list" || list["ordered"] != false || len(list["children"].([]any)) != 2 {
		t.Fatalf("list = %v", list)
	}
	code := child(t, d, 3)
	if code["type"] != "code" || code["lang"] != "go" || code["value"] != "x := 1\n" {
		t.Fatalf("code = %v", code)
	}
}

func TestDocumentTable(t *testing.T) {
	d := docJSON(t, "| a | b |\n|:--|--:|\n| 1 | 2 |\n")
	tbl := child(t, d, 0)
	if tbl["type"] != "table" || len(tbl["align"].([]any)) != 2 || tbl["align"].([]any)[0] != "left" || tbl["align"].([]any)[1] != "right" {
		t.Fatalf("table = %v", tbl)
	}
	head := child(t, tbl, 0)
	if head["type"] != "tableRow" || head["header"] != true || child(t, head, 0)["type"] != "tableCell" {
		t.Fatalf("header = %v", head)
	}
	if body := child(t, tbl, 1); body["header"] != nil {
		t.Fatalf("body row must not be a header: %v", body)
	}
}

func TestDocumentDirectives(t *testing.T) {
	d := docJSON(t, ":::readaloud\nText\n:::\n\n::pagebreak\n\n:::statblock{system=\"5e\"}\nname: Rat\nac: 15\ntraits:\n  - name: Bite\n:::\n\n:::mystery{x=1}\nraw *body*\n:::\n")
	ra, pb, sb, un := child(t, d, 0), child(t, d, 1), child(t, d, 2), child(t, d, 3)
	if ra["name"] != "readaloud" || ra["kind"] != "container" || ra["form"] != "block" || ra["breakable"] != true || child(t, ra, 0)["type"] != "paragraph" {
		t.Fatalf("readaloud = %v", ra)
	}
	if pb["form"] != "leaf" || pb["kind"] != "leaf" || pb["breakable"] != nil {
		t.Fatalf("pagebreak = %v", pb)
	}
	fields := sb["fields"].(map[string]any)
	if sb["kind"] != "data" || sb["breakable"] != false || sb["attributes"].(map[string]any)["system"] != "5e" || fields["name"] != "Rat" || fields["ac"] != float64(15) {
		t.Fatalf("statblock = %v", sb)
	}
	if tr := fields["traits"].([]any)[0].(map[string]any); tr["name"] != "Bite" {
		t.Fatalf("traits = %v", fields["traits"])
	}
	if un["kind"] != "unknown" || un["raw"] != "raw *body*" || un["warnings"].([]any)[0].(map[string]any)["code"] != "component.unknown" {
		t.Fatalf("unknown = %v", un)
	}
	if pos := ra["position"].(map[string]any); pos["start"].(map[string]any)["line"] != float64(1) {
		t.Fatalf("position = %v", pos)
	}
}

func TestDocumentVersionAndFrontMatter(t *testing.T) {
	d := docJSON(t, "---\nrosetta: \"0.2\"\ntitle: X\n---\n\nBody\n")
	if d["rosettaVersion"] != "0.2" || d["frontMatter"].(map[string]any)["title"] != "X" {
		t.Fatalf("doc = %v", d)
	}
	d = docJSON(t, "Body\n")
	if d["rosettaVersion"] != "0.1" || d["frontMatter"] != nil {
		t.Fatalf("doc = %v", d)
	}
	d = docJSON(t, "---\nrosetta: nonsense\n---\nBody\n")
	if d["rosettaVersion"] != "0.1" {
		t.Fatalf("bad version must fall back to the default: %v", d["rosettaVersion"])
	}
}

func TestDocumentOmitsRawHTMLAndKeepsWarnings(t *testing.T) {
	d := docJSON(t, "Hi <b>x</b>\n\n<div>block</div>\n\n:::mystery\nx\n:::\n")
	for _, c := range d["children"].([]any) {
		if c.(map[string]any)["type"] == "html" {
			t.Fatal("raw html must not appear")
		}
	}
	if len(d["warnings"].([]any)) != 1 {
		t.Fatalf("warnings = %v", d["warnings"])
	}
}

// The raw front matter is kept so a saved document can write it back unchanged, even when it is not valid YAML.
func TestDocumentFrontMatterRaw(t *testing.T) {
	d := docJSON(t, "---\n# a comment\ntitle:   X\n---\n\nBody\n")
	if d["frontMatterRaw"] != "# a comment\ntitle:   X" {
		t.Fatalf("frontMatterRaw = %q", d["frontMatterRaw"])
	}
	d = docJSON(t, "---\nkey: [unclosed\n---\n\nBody\n")
	if d["frontMatterRaw"] != "key: [unclosed" || d["frontMatter"] != nil {
		t.Fatalf("invalid front matter: raw=%q values=%v", d["frontMatterRaw"], d["frontMatter"])
	}
	if d = docJSON(t, "Body\n"); d["frontMatterRaw"] != nil {
		t.Fatalf("no front matter, but frontMatterRaw = %v", d["frontMatterRaw"])
	}
}

// Lists say whether they are tight, because the HTML differs (<li>a</li> against <li><p>a</p></li>).
func TestDocumentListTightness(t *testing.T) {
	tight := func(src string) any { return docJSON(t, src)["children"].([]any)[0].(map[string]any)["tight"] }
	if tight("- a\n- b\n") != true || tight("1. a\n2. b\n") != true {
		t.Fatal("lists without blank lines are tight")
	}
	if tight("- a\n\n- b\n") != false || tight("- a\n\n  more\n- b\n") != false {
		t.Fatal("lists with blank lines between items or blocks are loose")
	}
}

// A data component keeps its body text next to the parsed fields, so it can be saved back as written.
func TestDocumentDataComponentKeepsRawBody(t *testing.T) {
	d := docJSON(t, ":::statblock\n# a comment\nname: Rat\nac: 15\n:::\n")
	n := d["children"].([]any)[0].(map[string]any)
	if n["raw"] != "# a comment\nname: Rat\nac: 15" {
		t.Fatalf("raw = %q", n["raw"])
	}
	if n["fields"].(map[string]any)["name"] != "Rat" {
		t.Fatalf("fields = %v", n["fields"])
	}
}

// The AST holds what a reader sees, as the HTML does: escapes removed and character references resolved.
func TestDocumentTextIsUnescaped(t *testing.T) {
	d := docJSON(t, "\\*not\\* &amp; &lt;b&gt; \\&amp; &#35; &bogus; a\\\nb `\\*code\\*`\n")
	para := d["children"].([]any)[0].(map[string]any)["children"].([]any)
	var text, code string
	for _, c := range para {
		n := c.(map[string]any)
		switch n["type"] {
		case "text":
			text += n["value"].(string)
		case "inlineCode":
			code = n["value"].(string)
		}
	}
	if text != "*not* & <b> &amp; # &bogus; ab " { // the hard break between a and b is its own node
		t.Fatalf("text = %q", text)
	}
	if code != `\*code\*` {
		t.Fatalf("code spans are verbatim, got %q", code)
	}
}

func TestDocumentLinksAndImagesAreUnescaped(t *testing.T) {
	d := docJSON(t, "[a](<u v> \"t&amp;\\\"x\") ![al\\*t `\\*`](p\\_q.png \"ti&copy;\")\n")
	para := d["children"].([]any)[0].(map[string]any)["children"].([]any)
	link, img := para[0].(map[string]any), para[2].(map[string]any)
	if link["url"] != "u v" || link["title"] != `t&"x` {
		t.Fatalf("link = %v", link)
	}
	if img["url"] != "p_q.png" || img["title"] != "ti©" || img["alt"] != `al*t \*` {
		t.Fatalf("image = %v", img)
	}
}

// The attribute text is kept as written (shorthands, quoting, even mistakes), so a saved document can write it back.
func TestDocumentAttributesRaw(t *testing.T) {
	attr := func(src string) any {
		return docJSON(t, src)["children"].([]any)[0].(map[string]any)["attributesRaw"]
	}
	if got := attr(":::sidebar{ #tip .wide title=\"A \\\"b\\\"\" }\nx\n:::\n"); got != ` #tip .wide title="A \"b\"" ` {
		t.Fatalf("attributesRaw = %q", got)
	}
	if got := attr("::pagebreak{}\n"); got != "" {
		t.Fatalf("empty braces: %q", got)
	}
	if got := attr("::pagebreak\n"); got != nil {
		t.Fatalf("no braces must give no attributesRaw, got %v", got)
	}
	if got := attr("::pagebreak{a=\"x\n"); got != `a="x` {
		t.Fatalf("a broken list is kept as written: %q", got)
	}
}
