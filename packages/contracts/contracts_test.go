package contracts

import "testing"

func TestName(t *testing.T) {
	if Name != "contracts" {
		t.Fatal("unexpected name")
	}
}
