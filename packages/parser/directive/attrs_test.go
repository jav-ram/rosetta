package directive

import (
	"reflect"
	"testing"
)

func TestParseAttrs(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		want     map[string]string
		order    []string
		used     int
		problems []string
	}{
		{"empty", `{}`, map[string]string{}, nil, 2, nil},
		{"quoted", `{system="5e"}`, map[string]string{"system": "5e"}, []string{"system"}, 13, nil},
		{"bare", `{id=bone-warden}`, map[string]string{"id": "bone-warden"}, []string{"id"}, 16, nil},
		{"flag", `{wide}`, map[string]string{"wide": "true"}, []string{"wide"}, 6, nil},
		{"shorthands", `{#a .b .c}`, map[string]string{"id": "a", "class": "b c"}, []string{"id", "class"}, 10, nil},
		{"escapes", `{title="Variant: \"Lingering\" \\ Injuries"}`, map[string]string{"title": `Variant: "Lingering" \ Injuries`}, []string{"title"}, 44, nil},
		{"other backslash is literal", `{t="a\nb"}`, map[string]string{"t": `a\nb`}, []string{"t"}, 10, nil},
		{"spaces", `{ a="1"   b=2 }`, map[string]string{"a": "1", "b": "2"}, []string{"a", "b"}, 15, nil},
		{"percent and colon in value", `{height="40%" art=assets/x.jpg}`, map[string]string{"height": "40%", "art": "assets/x.jpg"}, []string{"height", "art"}, 31, nil},
		{"duplicate last wins", `{a=1 a=2}`, map[string]string{"a": "2"}, []string{"a"}, 9, []string{"attr.duplicate"}},
		{"unterminated quote keeps earlier", `{a=1 b="x}`, map[string]string{"a": "1"}, []string{"a"}, 10, []string{"attr.syntax"}},
		{"unclosed brace", `{a=1`, map[string]string{"a": "1"}, []string{"a"}, 4, []string{"attr.syntax"}},
		{"stray equals", `{a=1 =2}`, map[string]string{"a": "1"}, []string{"a"}, 8, []string{"attr.syntax"}},
		{"missing value", `{a=}`, map[string]string{}, nil, 4, []string{"attr.syntax"}},
		{"single quotes are not delimiters", `{a='x'}`, map[string]string{}, nil, 7, []string{"attr.syntax"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, used, problems := parseAttrs(c.in)
			if !reflect.DeepEqual(got.Values, c.want) {
				t.Errorf("values = %v, want %v", got.Values, c.want)
			}
			if !reflect.DeepEqual(got.Order, c.order) {
				t.Errorf("order = %v, want %v", got.Order, c.order)
			}
			if used != c.used {
				t.Errorf("used = %d, want %d", used, c.used)
			}
			var codes []string
			for _, p := range problems {
				codes = append(codes, p.code)
			}
			if !reflect.DeepEqual(codes, c.problems) {
				t.Errorf("problems = %v, want %v", codes, c.problems)
			}
		})
	}
}

func TestParseAttrsStopsAtClosingBrace(t *testing.T) {
	_, used, _ := parseAttrs(`{a=1} trailing`)
	if used != 5 {
		t.Fatalf("used = %d, want 5", used)
	}
}
