package render

import (
	"testing"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/contracts/conformance"
)

// TestConformance runs the shared golden suite from contracts against this parser.
// Regenerate the expected files with:
//
//	go test ./render -run TestConformance -update
//
// and review the diff before committing.
func TestConformance(t *testing.T) {
	conformance.Run(t, func(markdown []byte, defs []contracts.ComponentDefinition) (conformance.Output, error) {
		r, err := Convert(markdown, WithComponents(defs...))
		return conformance.Output{HTML: r.HTML, Warnings: r.Warnings}, err
	})
}
