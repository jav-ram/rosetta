package contracts

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func example(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("examples/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestSampleASTValidatesAndDecodes(t *testing.T) {
	doc, err := ValidateDocument(example(t, "sample-ast.json"))
	if err != nil {
		t.Fatalf("sample AST should validate: %v", err)
	}
	if doc.RosettaVersion != "0.1" || doc.Children[0].Type != NodeTypeHeading {
		t.Fatalf("unexpected decode: %+v", doc)
	}
	if len(doc.Warnings) != 1 || doc.Warnings[0].Code != "component.unknown" {
		t.Fatalf("warnings not decoded: %+v", doc.Warnings)
	}
}

func TestSampleASTRoundTrips(t *testing.T) {
	doc, err := ValidateDocument(example(t, "sample-ast.json"))
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(SchemaDocument, out); err != nil {
		t.Fatalf("re-encoded document should still validate: %v", err)
	}
}

func TestInvalidASTIsRejected(t *testing.T) {
	if err := Validate(SchemaDocument, example(t, "invalid-ast.json")); err == nil {
		t.Fatal("expected invalid AST to be rejected")
	}
}

func TestComponentDefinitions(t *testing.T) {
	if err := Validate(SchemaComponentDefinition, example(t, "sample-component-definition.json")); err != nil {
		t.Fatalf("sample definition should validate: %v", err)
	}
	cases := map[string]struct {
		json  string
		valid bool
	}{
		"block without breakable": {string(example(t, "invalid-component-definition.json")), false},
		"leaf":                    {`{"name":"pagebreak","form":"leaf","kind":"leaf"}`, true},
		"leaf with breakable":     {`{"name":"pagebreak","form":"leaf","kind":"leaf","breakable":true}`, false},
		"leaf with scope":         {`{"name":"layout","form":"leaf","kind":"leaf","scope":"following"}`, true},
		"unknown scope":           {`{"name":"layout","form":"leaf","kind":"leaf","scope":"everything"}`, false},
		"container with scope":    {`{"name":"readaloud","form":"block","kind":"container","breakable":true,"scope":"following"}`, false},
		"container":               {`{"name":"readaloud","form":"block","kind":"container","breakable":true}`, true},
		"container with fields":   {`{"name":"readaloud","form":"block","kind":"container","breakable":true,"fields":[{"name":"x","type":"string"}]}`, false},
	}
	for name, c := range cases {
		err := Validate(SchemaComponentDefinition, []byte(c.json))
		if (err == nil) != c.valid {
			t.Errorf("%s: valid=%v, err=%v", name, c.valid, err)
		}
	}
}

func TestWarningCodeMustBeDotted(t *testing.T) {
	if err := Validate(SchemaWarning, []byte(`{"code":"Unknown","severity":"warning","message":"x"}`)); err == nil {
		t.Fatal("expected bad code to be rejected")
	}
}

func TestM1Components(t *testing.T) {
	defs, err := M1Components()
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, d := range defs {
		names = append(names, d.Name)
		b, _ := json.Marshal(d)
		if err := Validate(SchemaComponentDefinition, b); err != nil {
			t.Errorf("component %q does not satisfy the schema: %v", d.Name, err)
		}
	}
	if !reflect.DeepEqual(names, []string{"statblock", "readaloud", "sidebar", "pagebreak", "layout", "figure", "page"}) {
		t.Fatalf("names = %v", names)
	}
	if defs[0].Breakable == nil || *defs[0].Breakable || defs[1].Breakable == nil || !*defs[1].Breakable || defs[3].Breakable != nil {
		t.Fatal("unexpected breakable flags")
	}
}

func TestTheme(t *testing.T) {
	if err := Validate(SchemaTheme, example(t, "sample-theme.json")); err != nil {
		t.Fatalf("sample theme should validate: %v", err)
	}
	var theme Theme
	if err := json.Unmarshal(example(t, "sample-theme.json"), &theme); err != nil {
		t.Fatal(err)
	}
	if theme.Tokens["font.body"] == "" || theme.Components["readaloud"]["color.text"] == "" {
		t.Fatalf("theme not decoded: %+v", theme)
	}
	bad := []byte(`{"name":"x","tokens":{"shadow.card":"1px"}}`)
	if err := Validate(SchemaTheme, bad); err == nil {
		t.Fatal("unknown token category should be rejected")
	}
}

func TestManifest(t *testing.T) {
	m, err := ValidateManifest(example(t, "sample-manifest.json"))
	if err != nil {
		t.Fatalf("sample manifest should validate: %v", err)
	}
	if m.Title != "The Lost Mine" || len(m.Chapters) != 3 || m.Cover.Image.Id != "a1" {
		t.Fatalf("unexpected decode: %+v", m)
	}
	if m.Chapters[1].Start == nil || string(*m.Chapters[1].Start) != "right-page" || m.Chapters[0].Start != nil {
		t.Fatalf("chapter start not decoded: %+v", m.Chapters)
	}
}

func TestManifestRejects(t *testing.T) {
	for name, json := range map[string]string{
		"missing title":        `{"rosettaVersion":"0.1","chapters":[]}`,
		"bad chapter id":       `{"rosettaVersion":"0.1","title":"T","chapters":[{"id":"a b","title":"A"}]}`,
		"duplicate chapter id": `{"rosettaVersion":"0.1","title":"T","chapters":[{"id":"a","title":"A"},{"id":"a","title":"B"}]}`,
		"unknown field":        `{"rosettaVersion":"0.1","title":"T","chapters":[],"extra":1}`,
	} {
		if _, err := ValidateManifest([]byte(json)); err == nil {
			t.Errorf("%s: should be rejected", name)
		}
	}
}

func TestAssetRefAndSummary(t *testing.T) {
	if err := Validate(SchemaAssetRef, []byte(`{"id":"a1","mediaType":"image/png","size":3}`)); err != nil {
		t.Fatal(err)
	}
	if err := Validate(SchemaAssetRef, []byte(`{"id":"a1","mediaType":"png","size":3}`)); err == nil {
		t.Error("media type without a slash should be rejected")
	}
	if err := Validate(SchemaProjectSummary, []byte(`{"id":"p1","title":"T","updatedAt":"2026-10-16T09:30:00Z"}`)); err != nil {
		t.Fatal(err)
	}
	if err := Validate(SchemaProjectSummary, []byte(`{"id":"p1","title":"T","updatedAt":"yesterday"}`)); err == nil {
		t.Error("a time that is not ISO should be rejected")
	}
}

func TestChapterPageCountAndStale(t *testing.T) {
	m, err := ValidateManifest([]byte(`{"rosettaVersion":"0.1","title":"T","chapters":[{"id":"a","title":"A","pages":12,"stale":true},{"id":"b","title":"B","start":"right-page"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if m.Chapters[0].Pages == nil || *m.Chapters[0].Pages != 12 || m.Chapters[0].Stale == nil || !*m.Chapters[0].Stale {
		t.Fatalf("pages and stale not decoded: %+v", m.Chapters[0])
	}
	if m.Chapters[1].Pages != nil || m.Chapters[1].Stale != nil {
		t.Fatalf("absent means absent: %+v", m.Chapters[1])
	}
	for _, bad := range []string{`"pages":-1`, `"pages":1.5`, `"pages":"3"`, `"stale":"yes"`} {
		if _, err := ValidateManifest([]byte(`{"rosettaVersion":"0.1","title":"T","chapters":[{"id":"a","title":"A",` + bad + `}]}`)); err == nil {
			t.Errorf("%s should be rejected", bad)
		}
	}
}
