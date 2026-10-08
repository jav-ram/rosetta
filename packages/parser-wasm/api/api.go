// Package api is the logic behind the WebAssembly parser, kept free of syscall/js so it can be
// tested natively. main.go (js/wasm only) exposes it to JavaScript.
package api

import (
	"encoding/json"
	"fmt"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/parser/render"
)

// Output is the result of Parse, as JSON: { html, ast, warnings }.
type Output struct {
	// HTML is the rendered document, with warnings shown in place.
	HTML string `json:"html"`
	// AST is the document tree in the shape of the contracts Document schema.
	AST contracts.Document `json:"ast"`
	// Warnings is every warning found, in source order (also inside the AST).
	Warnings []contracts.Warning `json:"warnings"`
}

// Parser holds the component definitions. Definitions are data: the M1 set is the default and
// SetComponents replaces it, for example with a system plugin's.
type Parser struct {
	defs []contracts.ComponentDefinition
}

// New returns a parser with the temporary M1 component definitions.
func New() (*Parser, error) {
	defs, err := contracts.M1Components()
	if err != nil {
		return nil, err
	}
	return &Parser{defs: defs}, nil
}

// SetComponents replaces the component definitions with a JSON array of ComponentDefinition.
// Every definition is validated against the contracts schema; on error nothing changes.
func (p *Parser) SetComponents(definitionsJSON string) error {
	var raw []json.RawMessage
	if err := json.Unmarshal([]byte(definitionsJSON), &raw); err != nil {
		return fmt.Errorf("definitions must be a JSON array: %w", err)
	}
	defs := make([]contracts.ComponentDefinition, 0, len(raw))
	for i, r := range raw {
		if err := contracts.Validate(contracts.SchemaComponentDefinition, r); err != nil {
			return fmt.Errorf("definition %d: %w", i, err)
		}
		var d contracts.ComponentDefinition
		if err := json.Unmarshal(r, &d); err != nil {
			return fmt.Errorf("definition %d: %w", i, err)
		}
		defs = append(defs, d)
	}
	p.defs = defs
	return nil
}

// Parse converts Rosetta Markdown and returns the result as a JSON string.
func (p *Parser) Parse(markdown string) (string, error) {
	res, err := render.Convert([]byte(markdown), render.WithComponents(p.defs...))
	if err != nil {
		return "", err
	}
	warnings := res.Warnings
	if warnings == nil {
		warnings = []contracts.Warning{}
	}
	out, err := json.Marshal(Output{HTML: res.HTML, AST: res.Document, Warnings: warnings})
	if err != nil {
		return "", err
	}
	return string(out), nil
}
