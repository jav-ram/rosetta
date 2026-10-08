package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func parse(t *testing.T, p *Parser, md string) map[string]any {
	t.Helper()
	out, err := p.Parse(md)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	return m
}

func TestParseReturnsHTMLASTAndWarnings(t *testing.T) {
	p, err := New()
	if err != nil {
		t.Fatal(err)
	}
	m := parse(t, p, "# Hi\n\n:::mystery\nx\n:::\n")
	if !strings.Contains(m["html"].(string), "<h1>Hi</h1>") {
		t.Fatalf("html = %v", m["html"])
	}
	ast := m["ast"].(map[string]any)
	if ast["rosettaVersion"] != "0.1" || len(ast["children"].([]any)) != 2 {
		t.Fatalf("ast = %v", ast)
	}
	if ws := m["warnings"].([]any); len(ws) != 1 || ws[0].(map[string]any)["code"] != "component.unknown" {
		t.Fatalf("warnings = %v", m["warnings"])
	}
}

func TestWarningsIsAlwaysAnArray(t *testing.T) {
	p, _ := New()
	if ws, ok := parse(t, p, "plain\n")["warnings"].([]any); !ok || len(ws) != 0 {
		t.Fatalf("warnings must be [] not null")
	}
}

func TestSetComponentsReplacesDefinitions(t *testing.T) {
	p, _ := New()
	err := p.SetComponents(`[{"name":"callout","form":"block","kind":"container","breakable":true}]`)
	if err != nil {
		t.Fatal(err)
	}
	m := parse(t, p, ":::callout\nhi\n:::\n\n::pagebreak\n")
	html := m["html"].(string)
	if !strings.Contains(html, `rosetta-callout`) || !strings.Contains(html, `Unknown component`) {
		t.Fatalf("callout should be known and pagebreak unknown now:\n%s", html)
	}
}

func TestSetComponentsRejectsBadInputAndKeepsOldDefinitions(t *testing.T) {
	p, _ := New()
	for _, bad := range []string{`not json`, `{}`, `[{"name":"x","form":"block","kind":"container"}]`} {
		if err := p.SetComponents(bad); err == nil {
			t.Errorf("expected an error for %s", bad)
		}
	}
	if !strings.Contains(parse(t, p, ":::readaloud\nx\n:::\n")["html"].(string), "rosetta-readaloud") {
		t.Fatal("definitions must be unchanged after a failed SetComponents")
	}
}
