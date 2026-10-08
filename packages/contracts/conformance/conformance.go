// Package conformance is the golden test suite for Rosetta parsers. Any Go implementation can
// run it against its own Convert function; implementations in other languages can read the
// same files from conformance/cases (see README.md in this directory).
//
// Each case is a Markdown input with the HTML a conforming parser produces, and optionally the
// warnings it reports:
//
//	cases/<group>/<name>.md             input
//	cases/<group>/<name>.html           expected output
//	cases/<group>/<name>.warnings.json  expected warnings (absent means none)
package conformance

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts"
)

//go:embed cases
var casesFS embed.FS

var update = flag.Bool("update", false, "rewrite the expected .html and .warnings.json files from the implementation's output")

// Output is what an implementation returns for one input.
type Output struct {
	HTML     string
	Warnings []contracts.Warning
}

// Implementation converts Rosetta Markdown to HTML, using the given component definitions.
type Implementation func(markdown []byte, defs []contracts.ComponentDefinition) (Output, error)

// ExpectedWarning is one entry of a .warnings.json file: the fields that identify a warning.
// Messages are not compared, so implementations may word them differently.
type ExpectedWarning struct {
	Code      string `json:"code"`
	Line      int    `json:"line"`
	Component string `json:"component,omitempty"`
	Field     string `json:"field,omitempty"`
}

// Case is one input/expected-output pair.
type Case struct {
	// Name is the path without extension, such as "components/sidebar-title".
	Name     string
	Markdown []byte
	HTML     string
	Warnings []ExpectedWarning
	// HasExpected is false for a new case that has no .html yet (create it with -update).
	HasExpected bool
}

// Cases loads every case from the embedded suite, sorted by name.
func Cases() ([]Case, error) {
	var names []string
	err := fs.WalkDir(casesFS, "cases", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(p, ".md") {
			names = append(names, strings.TrimSuffix(strings.TrimPrefix(p, "cases/"), ".md"))
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(names)
	var out []Case
	for _, n := range names {
		c := Case{Name: n}
		if c.Markdown, err = casesFS.ReadFile("cases/" + n + ".md"); err != nil {
			return nil, err
		}
		if html, err := casesFS.ReadFile("cases/" + n + ".html"); err == nil {
			c.HTML, c.HasExpected = string(html), true
		}
		if data, err := casesFS.ReadFile("cases/" + n + ".warnings.json"); err == nil {
			if err := json.Unmarshal(data, &c.Warnings); err != nil {
				return nil, fmt.Errorf("case %s: bad .warnings.json: %w", n, err)
			}
		}
		out = append(out, c)
	}
	return out, nil
}

// Orphans lists expected files (.html, .warnings.json) that have no .md input.
func Orphans() ([]string, error) {
	var out []string
	err := fs.WalkDir(casesFS, "cases", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		for _, ext := range []string{".html", ".warnings.json"} {
			if base, ok := strings.CutSuffix(p, ext); ok {
				if _, err := fs.Stat(casesFS, base+".md"); err != nil {
					out = append(out, p)
				}
			}
		}
		return nil
	})
	return out, err
}

// normalize makes comparison insensitive to line endings and trailing whitespace.
func normalize(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(l, " \t")
	}
	return strings.TrimRight(strings.Join(lines, "\n"), "\n")
}

func toExpected(ws []contracts.Warning) []ExpectedWarning {
	out := []ExpectedWarning{}
	for _, w := range ws {
		e := ExpectedWarning{Code: w.Code}
		if w.Range != nil {
			e.Line = w.Range.Start.Line
		}
		if w.Component != nil {
			e.Component = *w.Component
		}
		if w.Field != nil {
			e.Field = *w.Field
		}
		out = append(out, e)
	}
	return out
}

// sourceDir finds conformance/cases on disk, for -update.
func sourceDir() (string, error) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("cannot locate the conformance source directory")
	}
	return filepath.Join(filepath.Dir(file), "cases"), nil
}

// Run runs every case against impl as subtests. Run the test with -update to rewrite the
// expected files from impl's output, then review the diff.
func Run(t *testing.T, impl Implementation) {
	t.Helper()
	cases, err := Cases()
	if err != nil {
		t.Fatal(err)
	}
	defs, err := contracts.M1Components()
	if err != nil {
		t.Fatal(err)
	}
	dir := ""
	if *update {
		if dir, err = sourceDir(); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			got, err := impl(c.Markdown, defs)
			if err != nil {
				t.Fatal(err)
			}
			gotWarnings := toExpected(got.Warnings)
			if *update {
				writeExpected(t, dir, c.Name, got.HTML, gotWarnings)
				return
			}
			if !c.HasExpected {
				t.Fatalf("%s.html does not exist; run the test with -update to create it", c.Name)
			}
			if normalize(got.HTML) != normalize(c.HTML) {
				t.Errorf("HTML mismatch for %s.md\n--- got ---\n%s\n--- want ---\n%s", c.Name, got.HTML, c.HTML)
			}
			want := c.Warnings
			if want == nil {
				want = []ExpectedWarning{}
			}
			if !equalWarnings(gotWarnings, want) {
				gj, _ := json.MarshalIndent(gotWarnings, "", "  ")
				wj, _ := json.MarshalIndent(want, "", "  ")
				t.Errorf("warnings mismatch for %s.md\n--- got ---\n%s\n--- want ---\n%s", c.Name, gj, wj)
			}
		})
	}
}

func equalWarnings(a, b []ExpectedWarning) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func writeExpected(t *testing.T, dir, name, html string, ws []ExpectedWarning) {
	t.Helper()
	base := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.WriteFile(base+".html", []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	if len(ws) == 0 {
		_ = os.Remove(base + ".warnings.json")
		return
	}
	data, _ := json.MarshalIndent(ws, "", "  ")
	if err := os.WriteFile(base+".warnings.json", append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}
