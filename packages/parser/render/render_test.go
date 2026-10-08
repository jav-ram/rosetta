package render

import (
	"reflect"
	"strings"
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts"
)

func m1(t *testing.T) []contracts.ComponentDefinition {
	t.Helper()
	defs, err := contracts.M1Components()
	if err != nil {
		t.Fatal(err)
	}
	return defs
}

func convert(t *testing.T, src string, opts ...Option) Result {
	t.Helper()
	r, err := Convert([]byte(src), append([]Option{WithComponents(m1(t)...)}, opts...)...)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func codes(ws []contracts.Warning) []string {
	var out []string
	for _, w := range ws {
		out = append(out, w.Code)
	}
	return out
}

func wantHTML(t *testing.T, got, want string) {
	t.Helper()
	if got != want {
		t.Fatalf("html mismatch.\n got:\n%s\nwant:\n%s", got, want)
	}
}

func wantContains(t *testing.T, got string, parts ...string) {
	t.Helper()
	for _, p := range parts {
		if !strings.Contains(got, p) {
			t.Errorf("html missing %q in:\n%s", p, got)
		}
	}
}

func ptr[T any](v T) *T { return &v }

// --- readaloud ---

func TestReadaloud(t *testing.T) {
	r := convert(t, ":::readaloud\nThe *torches* gutter.\n\n- a\n- b\n:::\n")
	wantHTML(t, r.HTML, `<div class="rosetta-readaloud" data-component="readaloud" data-kind="container" data-breakable="true">
<p>The <em>torches</em> gutter.</p>
<ul>
<li>a</li>
<li>b</li>
</ul>
</div>
`)
	if len(r.Warnings) != 0 {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

func TestReadaloudInvalid(t *testing.T) {
	// Unclosed: still renders its content, with a visible warning.
	r := convert(t, ":::readaloud\nText\n")
	wantContains(t, r.HTML, `<p>Text</p>`, `data-code="directive.unclosed"`)
	if !reflect.DeepEqual(codes(r.Warnings), []string{"directive.unclosed"}) {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
	// Unknown attribute: warned, ignored.
	r = convert(t, ":::readaloud{color=red}\nText\n:::\n")
	wantContains(t, r.HTML, `data-code="attr.unknown"`, `<p>Text</p>`)
	if strings.Contains(r.HTML, "red") && strings.Contains(r.HTML, `color="red"`) {
		t.Fatal("unknown attribute must not be rendered")
	}
}

// --- sidebar ---

func TestSidebar(t *testing.T) {
	r := convert(t, ":::sidebar{title=\"Variant: Lingering Injuries\" #inj .wide}\nRoll below.\n:::\n")
	wantHTML(t, r.HTML, `<div class="rosetta-sidebar wide" data-component="sidebar" data-kind="container" data-breakable="true" id="inj">
<h3 class="rosetta-title">Variant: Lingering Injuries</h3>
<p>Roll below.</p>
</div>
`)
}

func TestSidebarTitleLevelFollowsHashes(t *testing.T) {
	cases := []struct{ title, want string }{
		{"# One", `<h1 class="rosetta-title">One</h1>`},
		{"## Two", `<h2 class="rosetta-title">Two</h2>`},
		{"### Three", `<h3 class="rosetta-title">Three</h3>`},
		{"###### Six", `<h6 class="rosetta-title">Six</h6>`},
		{"Plain", `<h3 class="rosetta-title">Plain</h3>`},
		{"#tag", `<h3 class="rosetta-title">#tag</h3>`},
		{"####### Seven", `<h3 class="rosetta-title">####### Seven</h3>`},
		{"  ##   Spaced  ", `<h2 class="rosetta-title">Spaced</h2>`},
	}
	for _, c := range cases {
		r := convert(t, ":::sidebar{title=\""+c.title+"\"}\nBody\n:::\n")
		wantContains(t, r.HTML, c.want)
	}
	for _, empty := range []string{"#", "  ", "##   "} {
		r := convert(t, ":::sidebar{title=\""+empty+"\"}\nBody\n:::\n")
		if strings.Contains(r.HTML, "rosetta-title") {
			t.Errorf("title %q has no text, so no heading expected:\n%s", empty, r.HTML)
		}
	}
}

func TestSidebarWithoutTitle(t *testing.T) {
	r := convert(t, ":::sidebar\nBody\n:::\n")
	if strings.Contains(r.HTML, "rosetta-title") {
		t.Fatalf("no title expected:\n%s", r.HTML)
	}
}

func TestSidebarEscapesTitle(t *testing.T) {
	r := convert(t, ":::sidebar{title=\"<script>alert(1)</script> & \\\"x\\\"\"}\nBody\n:::\n")
	wantContains(t, r.HTML, `&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;`)
	if strings.Contains(r.HTML, "<script>") {
		t.Fatal("title must be escaped")
	}
}

func TestSidebarNestsOtherComponents(t *testing.T) {
	r := convert(t, "::::sidebar{title=\"Ambush\"}\nRoll twice.\n\n:::readaloud\nSteel rings.\n:::\n::::\n")
	wantContains(t, r.HTML, `rosetta-sidebar`, `rosetta-readaloud`, `<p>Steel rings.</p>`)
	if strings.Index(r.HTML, "rosetta-sidebar") > strings.Index(r.HTML, "rosetta-readaloud") || !strings.HasSuffix(r.HTML, "</div>\n</div>\n") {
		t.Fatalf("readaloud should be inside the sidebar:\n%s", r.HTML)
	}
}

// --- pagebreak ---

func TestPagebreak(t *testing.T) {
	r := convert(t, "before\n\n::pagebreak\n\nafter\n")
	wantHTML(t, r.HTML, `<p>before</p>
<div class="rosetta-pagebreak" data-component="pagebreak" data-kind="leaf">
</div>
<p>after</p>
`)
	if strings.Contains(r.HTML, "data-breakable") {
		t.Fatal("leaf components have no breakable flag")
	}
}

func TestPagebreakInvalid(t *testing.T) {
	r := convert(t, "::pagebreak{bogus=1}\n")
	wantContains(t, r.HTML, `rosetta-pagebreak`, `data-code="attr.unknown"`)
	// Written as a block: body is kept out of the page, with a warning.
	r = convert(t, ":::pagebreak\nleftover\n:::\n")
	wantContains(t, r.HTML, `rosetta-pagebreak`, `data-code="directive.wrong-form"`)
}

// --- statblock ---

const statblock = `:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
speed: 30 ft.
traits:
  - name: Undead Fortitude
    text: If damage reduces the warden to *0* hit points, it saves.
actions: |
  **Slam.** Melee attack.

  *Hit:* 11 damage.
:::
`

func TestStatblock(t *testing.T) {
	r := convert(t, statblock)
	wantHTML(t, r.HTML, `<div class="rosetta-statblock" data-component="statblock" data-kind="data" data-breakable="false">
<dl class="rosetta-fields">
<div class="rosetta-field" data-field="name"><dt>name</dt><dd>Bone Warden</dd></div>
<div class="rosetta-field" data-field="size"><dt>size</dt><dd>Medium undead</dd></div>
<div class="rosetta-field" data-field="ac"><dt>ac</dt><dd>15</dd></div>
<div class="rosetta-field" data-field="hp"><dt>hp</dt><dd>52 (8d8+16)</dd></div>
<div class="rosetta-field" data-field="speed"><dt>speed</dt><dd>30 ft.</dd></div>
<div class="rosetta-field" data-field="traits"><dt>traits</dt><dd><ul class="rosetta-list"><li><dl class="rosetta-fields">
<div class="rosetta-field" data-field="name"><dt>name</dt><dd>Undead Fortitude</dd></div>
<div class="rosetta-field" data-field="text"><dt>text</dt><dd>If damage reduces the warden to <em>0</em> hit points, it saves.</dd></div>
</dl></li></ul></dd></div>
<div class="rosetta-field" data-field="actions"><dt>actions</dt><dd><p><strong>Slam.</strong> Melee attack.</p>
<p><em>Hit:</em> 11 damage.</p></dd></div>
</dl>
</div>
`)
	if len(r.Warnings) != 0 {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

func TestStatblockFieldsFollowDefinitionOrder(t *testing.T) {
	r := convert(t, ":::statblock\nhp: 1\nname: Rat\n:::\n")
	if strings.Index(r.HTML, `data-field="name"`) > strings.Index(r.HTML, `data-field="hp"`) {
		t.Fatalf("name should come before hp:\n%s", r.HTML)
	}
}

func TestStatblockPlainFieldsAreNotMarkdown(t *testing.T) {
	r := convert(t, ":::statblock\nname: \"*Rat* <b>\"\nhp: 5 **x**\n:::\n")
	wantContains(t, r.HTML, `<dd>*Rat* &lt;b&gt;</dd>`, `<dd>5 **x**</dd>`)
}

func TestStatblockInvalidFields(t *testing.T) {
	r := convert(t, ":::statblock\nname: Rat\nac: fifteen\nbogus: 1\ntraits: nope\n:::\n")
	// The component still renders with every valid field.
	wantContains(t, r.HTML, `data-field="name"><dt>name</dt><dd>Rat</dd>`)
	for _, absent := range []string{`data-field="ac"`, `data-field="bogus"`, `data-field="traits"`} {
		if strings.Contains(r.HTML, absent) {
			t.Errorf("invalid field rendered: %s", absent)
		}
	}
	got := map[string]string{}
	for _, w := range r.Warnings {
		got[*w.Field] = w.Code
		if *w.Component != "statblock" || w.Range == nil {
			t.Errorf("warning lacks component or range: %+v", w)
		}
	}
	want := map[string]string{"ac": "field.type", "bogus": "field.unknown", "traits": "field.type"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("warnings = %v, want %v", got, want)
	}
	wantContains(t, r.HTML, `data-code="field.type"`, `data-code="field.unknown"`)
}

func TestStatblockMissingRequiredField(t *testing.T) {
	r := convert(t, ":::statblock\nac: 15\n:::\n")
	wantContains(t, r.HTML, `data-field="name"><dt>name</dt><dd class="rosetta-missing">Missing required field</dd>`, `data-field="ac"`)
	if !reflect.DeepEqual(codes(r.Warnings), []string{"field.missing"}) || *r.Warnings[0].Field != "name" {
		t.Fatalf("warnings = %+v", r.Warnings)
	}
}

func TestStatblockEmptyBody(t *testing.T) {
	r := convert(t, ":::statblock\n:::\n")
	wantContains(t, r.HTML, `class="rosetta-missing"`)
	if !reflect.DeepEqual(codes(r.Warnings), []string{"field.missing"}) {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

func TestStatblockNestedFieldPathsAndLines(t *testing.T) {
	src := ":::statblock\nname: Rat\ntraits:\n  - name: Ok\n  - text: no name\n  - name: 7\n    text: [a]\n:::\n"
	r := convert(t, src)
	got := map[string]int{}
	codesByField := map[string]string{}
	for _, w := range r.Warnings {
		got[*w.Field] = w.Range.Start.Line
		codesByField[*w.Field] = w.Code
	}
	if codesByField["traits[1].name"] != "field.missing" || codesByField["traits[2].text"] != "field.type" {
		t.Fatalf("warnings = %v", codesByField)
	}
	if got["traits[2].text"] != 7 {
		t.Fatalf("line of traits[2].text = %d, want 7 (source line)", got["traits[2].text"])
	}
	// A number is accepted where text is expected.
	wantContains(t, r.HTML, `<dd>7</dd>`)
}

func TestStatblockYAMLProblems(t *testing.T) {
	cases := []struct {
		name, body, code string
		replaced         bool
	}{
		{"tab indent", "name: Rat\ntraits:\n\t- name: x\n", "yaml.syntax", true},
		{"not a mapping", "- a\n- b\n", "yaml.syntax", true},
		{"invalid yaml", "name: [unclosed\n", "yaml.syntax", true},
		{"anchor", "name: &n Rat\n", "yaml.unsupported", false},
		{"alias", "name: &n Rat\nsize: *n\n", "yaml.unsupported", false},
		{"tag", "name: !!str Rat\n", "yaml.unsupported", false},
		{"merge key", "base: &b {a: 1}\n<<: *b\nname: Rat\n", "yaml.unsupported", false},
		{"second document", "name: Rat\n---\nname: Dog\n", "yaml.unsupported", false},
		{"nested flow", "name: Rat\ntraits: [[a], [b]]\n", "yaml.unsupported", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := convert(t, ":::statblock\n"+c.body+":::\n\nafter\n")
			if !strings.HasSuffix(r.HTML, "<p>after</p>\n") {
				t.Fatalf("the rest of the document must still render:\n%s", r.HTML)
			}
			found := false
			for _, w := range r.Warnings {
				found = found || w.Code == c.code
			}
			if !found {
				t.Fatalf("want %s, got %v", c.code, codes(r.Warnings))
			}
			if c.code == "yaml.syntax" {
				wantContains(t, r.HTML, `rosetta-warning-block`, "<pre><code>:::statblock")
				if strings.Contains(r.HTML, `class="rosetta-statblock"`) {
					t.Fatal("an unreadable body must replace the component with a warning")
				}
			}
		})
	}
}

func TestStatblockWithoutFieldDefinitions(t *testing.T) {
	// No fields declared (no system plugin): every field is unknown and renders as plain key/value.
	def := contracts.ComponentDefinition{Name: "statblock", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindData, Breakable: ptr(false)}
	r, err := Convert([]byte(":::statblock\nname: Rat\nac: 3\n:::\n"), WithComponents(def))
	if err != nil {
		t.Fatal(err)
	}
	wantContains(t, r.HTML, `data-field="name"><dt>name</dt><dd>Rat</dd>`, `data-field="ac"><dt>ac</dt><dd>3</dd>`)
	if !reflect.DeepEqual(codes(r.Warnings), []string{"field.unknown", "field.unknown"}) {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

func TestStatblockEscapesText(t *testing.T) {
	r := convert(t, ":::statblock\nname: <img src=x onerror=alert(1)>\n:::\n")
	if strings.Contains(r.HTML, "<img") {
		t.Fatalf("field text must be escaped:\n%s", r.HTML)
	}
}

// --- driven by definitions ---

func TestRenderingIsDrivenByDefinitions(t *testing.T) {
	spell := contracts.ComponentDefinition{
		Name: "spell", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindData,
		Breakable: ptr(false),
		Attributes: []contracts.Attribute{
			{Name: "level", Type: contracts.AttributeTypeNumber, Required: ptr(true)},
			{Name: "school", Type: contracts.AttributeTypeEnum, Values: []string{"evocation", "abjuration"}},
			{Name: "ritual", Type: contracts.AttributeTypeBoolean},
		},
		Fields: []contracts.Field{
			{Name: "name", Type: contracts.FieldTypeString, Plain: ptr(true), Required: ptr(true)},
			{Name: "tier", Type: contracts.FieldTypeEnum, Values: []string{"low", "high"}},
			{Name: "concentration", Type: contracts.FieldTypeBoolean},
			{Name: "range", Type: contracts.FieldTypeString, Default: "Self"},
		},
	}
	r, err := Convert([]byte(":::spell{level=3 school=evocation}\nname: Fireball\ntier: low\nconcentration: false\n:::\n"), WithComponents(spell))
	if err != nil {
		t.Fatal(err)
	}
	wantContains(t, r.HTML, `class="rosetta-spell"`, `data-breakable="false"`, `<dd>Fireball</dd>`, `<dd>false</dd>`, `data-field="range"><dt>range</dt><dd>Self</dd>`)
	if len(r.Warnings) != 0 {
		t.Fatalf("warnings = %+v", r.Warnings)
	}

	r, _ = Convert([]byte(":::spell{level=high school=necromancy ritual=maybe}\nname: X\ntier: medium\nconcentration: 1\n:::\n"), WithComponents(spell))
	got := codes(r.Warnings)
	want := []string{"attr.type", "attr.enum", "attr.type", "field.enum", "field.type"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("warnings = %v, want %v", got, want)
	}

	r, _ = Convert([]byte(":::spell\nname: X\n:::\n"), WithComponents(spell))
	if !reflect.DeepEqual(codes(r.Warnings), []string{"attr.missing"}) {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

func TestNoDefinitionsMeansUnknown(t *testing.T) {
	r, err := Convert([]byte(":::readaloud\nx\n:::\n"))
	if err != nil {
		t.Fatal(err)
	}
	wantContains(t, r.HTML, `rosetta-warning-block`, `Unknown component`)
}

func TestBreakableComesFromTheDefinition(t *testing.T) {
	def := contracts.ComponentDefinition{Name: "readaloud", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindContainer, Breakable: ptr(false)}
	r, _ := Convert([]byte(":::readaloud\nx\n:::\n"), WithComponents(def))
	wantContains(t, r.HTML, `data-breakable="false"`)
}

// --- unknown components, warnings, standard Markdown ---

func TestUnknownComponentIsAVisibleWarning(t *testing.T) {
	r := convert(t, "before\n\n:::mystery{x=1}\nNot **known** <b>.\n:::\n\nafter\n")
	wantHTML(t, r.HTML, `<p>before</p>
<div class="rosetta-warning-block" data-component="mystery" role="note">
<p><strong>Unknown component “mystery”</strong></p>
<ul class="rosetta-warnings">
<li class="rosetta-warning" data-code="component.unknown" data-severity="warning">Unknown component &quot;mystery&quot;.</li>
</ul>
<pre><code>:::mystery{x=1}
Not **known** &lt;b&gt;.
:::</code></pre>
</div>
<p>after</p>
`)
}

func TestWithoutWarningsInHTML(t *testing.T) {
	r := convert(t, ":::statblock\nname: Rat\nbogus: 1\n:::\n", WithoutWarningsInHTML())
	if strings.Contains(r.HTML, "rosetta-warning") {
		t.Fatalf("warnings should be hidden:\n%s", r.HTML)
	}
	if !reflect.DeepEqual(codes(r.Warnings), []string{"field.unknown"}) {
		t.Fatalf("warnings must still be returned: %v", codes(r.Warnings))
	}
}

func TestStandardMarkdownAndTables(t *testing.T) {
	r := convert(t, "# Title\n\n| d6 | Injury |\n|----|--------|\n| 1  | Limp   |\n")
	wantContains(t, r.HTML, "<h1>Title</h1>", "<table>", "<th>d6</th>", "<td>Limp</td>")
}

func TestWarningsAreInSourceOrder(t *testing.T) {
	r := convert(t, ":::statblock\nname: Rat\nbogus: 1\n:::\n\n::mystery\n\n:::\n")
	var lines []int
	for _, w := range r.Warnings {
		lines = append(lines, w.Range.Start.Line)
	}
	if !reflect.DeepEqual(codes(r.Warnings), []string{"field.unknown", "component.unknown", "directive.stray-close"}) || !(lines[0] < lines[1] && lines[1] < lines[2]) {
		t.Fatalf("warnings = %v lines = %v", codes(r.Warnings), lines)
	}
}

func TestPlainWords(t *testing.T) {
	// "yes" and "no" are text, not booleans (YAML 1.2).
	r := convert(t, ":::statblock\nname: yes\nsize: no\n:::\n")
	wantContains(t, r.HTML, `<dd>yes</dd>`, `<dd>no</dd>`)
	if len(r.Warnings) != 0 {
		t.Fatalf("warnings = %v", codes(r.Warnings))
	}
}

// --- front matter ---

func TestFrontMatterIsPreservedAndNotRendered(t *testing.T) {
	r := convert(t, "---\nrosetta: \"0.1\"\ntitle: Crypt\n---\n\n# Heading\n\n:::statblock\nbogus: 1\n:::\n")
	if strings.Contains(r.HTML, "rosetta:") || strings.Contains(r.HTML, "<hr") || !strings.HasPrefix(r.HTML, "<h1>Heading</h1>") {
		t.Fatalf("front matter must not be rendered:\n%s", r.HTML)
	}
	if r.FrontMatter["rosetta"] != "0.1" || r.FrontMatter["title"] != "Crypt" {
		t.Fatalf("front matter = %v", r.FrontMatter)
	}
	if r.FrontMatterRaw != "rosetta: \"0.1\"\ntitle: Crypt" {
		t.Fatalf("raw = %q", r.FrontMatterRaw)
	}
	// Source lines are unchanged, so warnings point at the right line of the original file.
	lines := map[string]int{}
	for _, w := range r.Warnings {
		lines[w.Code] = w.Range.Start.Line
	}
	if lines["field.unknown"] != 9 || lines["field.missing"] != 8 {
		t.Fatalf("warning lines = %v, want field.unknown on 9 and field.missing on 8", lines)
	}
}

func TestOpeningRuleWithoutClosingIsNotFrontMatter(t *testing.T) {
	r := convert(t, "---\nnot front matter\n")
	wantContains(t, r.HTML, "<hr>")
	if r.FrontMatter != nil || r.FrontMatterRaw != "" {
		t.Fatalf("front matter = %v %q", r.FrontMatter, r.FrontMatterRaw)
	}
}

func TestFrontMatterMustBeFirst(t *testing.T) {
	r := convert(t, "Text\n\n---\nkey: value\n---\n")
	if r.FrontMatter != nil {
		t.Fatal("front matter only counts at the start of the document")
	}
}

func TestInvalidFrontMatter(t *testing.T) {
	r := convert(t, "---\nkey: [unclosed\n---\n\nBody\n")
	if !reflect.DeepEqual(codes(r.Warnings), []string{"frontmatter.syntax"}) || r.Warnings[0].Range.Start.Line != 1 {
		t.Fatalf("warnings = %+v", r.Warnings)
	}
	wantHTML(t, r.HTML, "<p>Body</p>\n")
	if r.FrontMatterRaw != "key: [unclosed" || r.FrontMatter != nil {
		t.Fatalf("raw = %q values = %v", r.FrontMatterRaw, r.FrontMatter)
	}
}

func TestFrontMatterWithCRLFAndEmpty(t *testing.T) {
	r := convert(t, "---\r\nkey: v\r\n---\r\nBody\r\n")
	if r.FrontMatter["key"] != "v" || !strings.Contains(r.HTML, "<p>Body</p>") {
		t.Fatalf("html = %q fm = %v", r.HTML, r.FrontMatter)
	}
	r = convert(t, "---\n---\nBody\n")
	if r.FrontMatter == nil || len(r.FrontMatter) != 0 || !strings.Contains(r.HTML, "<p>Body</p>") {
		t.Fatalf("empty front matter: %v %q", r.FrontMatter, r.HTML)
	}
}
