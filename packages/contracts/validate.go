package contracts

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed schemas/*.schema.json
var schemaFS embed.FS

const schemaBase = "https://rosetta.invalid/schemas/"

// Schema names accepted by Validate.
const (
	SchemaDocument            = "ast.schema.json"
	SchemaComponentDefinition = "component-definition.schema.json"
	SchemaWarning             = "warning.schema.json"
	SchemaPosition            = "position.schema.json"
)

var (
	compiled     map[string]*jsonschema.Schema
	compiledOnce sync.Once
)

// schemas compiles the embedded schemas on first use, so importing this package costs nothing
// until something is validated.
func schemas() map[string]*jsonschema.Schema {
	compiledOnce.Do(func() { compiled = mustCompile() })
	return compiled
}

func mustCompile() map[string]*jsonschema.Schema {
	c := jsonschema.NewCompiler()
	entries, err := fs.ReadDir(schemaFS, "schemas")
	if err != nil {
		panic(err)
	}
	for _, e := range entries {
		data, err := schemaFS.ReadFile("schemas/" + e.Name())
		if err != nil {
			panic(err)
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			panic(fmt.Sprintf("%s: %v", e.Name(), err))
		}
		if err := c.AddResource(schemaBase+e.Name(), doc); err != nil {
			panic(err)
		}
	}
	out := map[string]*jsonschema.Schema{}
	for _, e := range entries {
		s, err := c.Compile(schemaBase + e.Name())
		if err != nil {
			panic(fmt.Sprintf("%s: %v", e.Name(), err))
		}
		out[e.Name()] = s
	}
	return out
}

// Validate checks JSON data against one of the schemas (use the Schema* constants).
// It returns nil when valid, or an error listing every problem.
func Validate(schema string, data []byte) error {
	s, ok := schemas()[schema]
	if !ok {
		return fmt.Errorf("unknown schema %q", schema)
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if err := s.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		if asValidation(err, &ve) {
			return fmt.Errorf("%s", strings.TrimSpace(fmt.Sprintf("%v", ve)))
		}
		return err
	}
	return nil
}

func asValidation(err error, target **jsonschema.ValidationError) bool {
	ve, ok := err.(*jsonschema.ValidationError)
	if ok {
		*target = ve
	}
	return ok
}

// ValidateDocument validates and decodes a document into the generated Document type.
func ValidateDocument(data []byte) (*Document, error) {
	if err := Validate(SchemaDocument, data); err != nil {
		return nil, err
	}
	var d Document
	if err := json.Unmarshal(data, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

//go:embed definitions/m1-components.json
var m1Components []byte

// M1Components returns the temporary definitions of the M1 components (statblock, readaloud,
// sidebar, pagebreak). They are data, not parser code; system plugins replace them in M6.
// The definitions are checked against the schema by this package's tests, not on every call,
// so loading them does not pull in the schema validator.
func M1Components() ([]ComponentDefinition, error) {
	var defs []ComponentDefinition
	if err := json.Unmarshal(m1Components, &defs); err != nil {
		return nil, err
	}
	return defs, nil
}
