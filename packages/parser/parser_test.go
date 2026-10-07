package parser

import "testing"

func TestName(t *testing.T) {
	if Name != "parser" {
		t.Fatal("unexpected name")
	}
}
