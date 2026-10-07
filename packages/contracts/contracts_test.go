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
	}
	if !reflect.DeepEqual(names, []string{"statblock", "readaloud", "sidebar", "pagebreak"}) {
		t.Fatalf("names = %v", names)
	}
	if defs[0].Breakable == nil || *defs[0].Breakable || defs[1].Breakable == nil || !*defs[1].Breakable || defs[3].Breakable != nil {
		t.Fatal("unexpected breakable flags")
	}
}
