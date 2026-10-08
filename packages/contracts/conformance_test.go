package contracts_test

import (
	"strings"
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts/conformance"
)

// The suite itself must be well formed, whichever parser runs it.
func TestConformanceSuiteIsComplete(t *testing.T) {
	cases, err := conformance.Cases()
	if err != nil {
		t.Fatal(err)
	}
	if len(cases) < 20 {
		t.Fatalf("the suite needs at least 20 cases, has %d", len(cases))
	}
	groups := map[string]int{}
	for _, c := range cases {
		if !c.HasExpected {
			t.Errorf("%s has no expected .html", c.Name)
		}
		groups[strings.SplitN(c.Name, "/", 2)[0]]++
	}
	for _, g := range []string{"markdown", "tables", "components", "errors"} {
		if groups[g] == 0 {
			t.Errorf("no cases in group %q", g)
		}
	}
	orphans, err := conformance.Orphans()
	if err != nil {
		t.Fatal(err)
	}
	if len(orphans) > 0 {
		t.Errorf("expected files with no .md input: %v", orphans)
	}
}
