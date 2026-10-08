package render

import (
	"fmt"
	"strconv"

	"github.com/jav-ram/rosetta/packages/contracts"
)

// problem is a validation finding, turned into a contracts.Warning by the caller.
type problem struct {
	code, message, field string
	line                 int // 1-based line in the body, 0 if unknown
}

func isScalar(v Value, types ...string) bool {
	if v.Kind != Scalar {
		return false
	}
	for _, t := range types {
		if v.Type == t {
			return true
		}
	}
	return false
}

func describe(v Value) string {
	switch v.Kind {
	case List:
		return "a list"
	case Map:
		return "a mapping"
	}
	return "a " + map[string]string{"str": "string", "int": "number", "float": "number", "bool": "boolean", "null": "null"}[v.Type]
}

// validateFields checks parsed fields against a component's field definitions (spec 8.2).
// Fields come back in definition order. Invalid fields are dropped (or replaced by their
// default); missing required ones become placeholders, reported on ownerLine (the line of the
// mapping that lacks them, 0 for the top level). Fields with no definition are
// reported as field.unknown. A component that declares no fields at all keeps every field,
// rendered as a plain key/value list.
func validateFields(given []Field, defs []contracts.Field, path string, ownerLine int) ([]Field, []problem) {
	var problems []problem
	join := func(name string) string {
		if path == "" {
			return name
		}
		return path + "." + name
	}
	byName := map[string]Field{}
	for _, f := range given {
		byName[f.Name] = f
	}
	known := map[string]bool{}
	for _, d := range defs {
		known[d.Name] = true
	}
	var out []Field
	for _, f := range given {
		if !known[f.Name] {
			problems = append(problems, problem{"field.unknown", fmt.Sprintf("Unknown field %q.", f.Name), join(f.Name), f.Line})
			if len(defs) == 0 {
				f.Unknown = true
				out = append(out, f)
			}
		}
	}
	for _, d := range defs {
		f, present := byName[d.Name]
		if present && f.Value.Kind == Scalar && f.Value.Type == "null" {
			present = false
		}
		fieldPath := join(d.Name)
		if present {
			v, ps := validateValue(f.Value, d, fieldPath)
			problems = append(problems, ps...)
			if v != nil {
				out = append(out, Field{Name: d.Name, Value: *v, Line: f.Line})
				continue
			}
		}
		if def, ok := defaultValue(d); ok {
			out = append(out, Field{Name: d.Name, Value: def})
			continue
		}
		if d.Required != nil && *d.Required {
			if !present {
				problems = append(problems, problem{"field.missing", fmt.Sprintf("Required field %q is missing.", d.Name), fieldPath, ownerLine})
			}
			out = append(out, Field{Name: d.Name, Missing: true})
		}
	}
	return out, problems
}

func defaultValue(d contracts.Field) (Value, bool) {
	switch v := d.Default.(type) {
	case string:
		return Value{Kind: Scalar, Text: v, Type: "str"}, true
	case float64:
		return Value{Kind: Scalar, Text: strconv.FormatFloat(v, 'f', -1, 64), Type: "float"}, true
	case bool:
		return Value{Kind: Scalar, Text: strconv.FormatBool(v), Type: "bool"}, true
	}
	return Value{}, false
}

// validateValue returns the value to render, or nil if it is invalid.
func validateValue(v Value, d contracts.Field, path string) (*Value, []problem) {
	bad := func(code, format string, args ...any) (*Value, []problem) {
		return nil, []problem{{code, fmt.Sprintf(format, args...), path, v.Line}}
	}
	switch d.Type {
	case contracts.FieldTypeString:
		if isScalar(v, "str", "int", "float", "bool") {
			v.Plain = d.Plain != nil && *d.Plain
			return &v, nil
		}
		return bad("field.type", "Field %q must be text, but is %s.", d.Name, describe(v))
	case contracts.FieldTypeNumber:
		if isScalar(v, "int", "float") {
			return &v, nil
		}
		return bad("field.type", "Field %q must be a number, but is %s.", d.Name, describe(v))
	case contracts.FieldTypeBoolean:
		if isScalar(v, "bool") {
			return &v, nil
		}
		return bad("field.type", "Field %q must be true or false, but is %s.", d.Name, describe(v))
	case contracts.FieldTypeEnum:
		if !isScalar(v, "str", "int", "float", "bool") {
			return bad("field.type", "Field %q must be one of its allowed values, but is %s.", d.Name, describe(v))
		}
		for _, allowed := range d.Values {
			if allowed == v.Text {
				return &v, nil
			}
		}
		return bad("field.enum", "Field %q must be one of %v, but is %q.", d.Name, d.Values, v.Text)
	case contracts.FieldTypeList:
		if v.Kind != List {
			return bad("field.type", "Field %q must be a list, but is %s.", d.Name, describe(v))
		}
		var problems []problem
		out := Value{Kind: List, Line: v.Line}
		for i, item := range v.Items {
			if d.Items == nil {
				out.Items = append(out.Items, item)
				continue
			}
			itemDef := *d.Items
			itemDef.Name = d.Name
			iv, ps := validateValue(item, itemDef, fmt.Sprintf("%s[%d]", path, i))
			problems = append(problems, ps...)
			if iv != nil {
				out.Items = append(out.Items, *iv)
			}
		}
		return &out, problems
	case contracts.FieldTypeObject:
		if v.Kind != Map {
			return bad("field.type", "Field %q must be a mapping, but is %s.", d.Name, describe(v))
		}
		fields, ps := validateFields(v.Fields, d.Fields, path, v.Line)
		return &Value{Kind: Map, Fields: fields, Line: v.Line}, ps
	}
	return &v, nil
}

// validateAttrs checks directive attributes against the component's attribute definitions.
// It returns the valid attributes; id and class are always accepted (spec 3.2).
func validateAttrs(values map[string]string, order []string, defs []contracts.Attribute) (map[string]string, []problem) {
	var problems []problem
	valid := map[string]string{}
	known := map[string]bool{"id": true, "class": true}
	for _, a := range defs {
		known[a.Name] = true
	}
	for _, name := range order {
		if !known[name] {
			problems = append(problems, problem{"attr.unknown", fmt.Sprintf("Unknown attribute %q.", name), name, 0})
		}
	}
	for _, name := range []string{"id", "class"} {
		if v, ok := values[name]; ok {
			valid[name] = v
		}
	}
	for _, a := range defs {
		v, ok := values[a.Name]
		if !ok {
			if a.Required != nil && *a.Required {
				problems = append(problems, problem{"attr.missing", fmt.Sprintf("Required attribute %q is missing.", a.Name), a.Name, 0})
			}
			continue
		}
		switch a.Type {
		case contracts.AttributeTypeNumber:
			if _, err := strconv.ParseFloat(v, 64); err != nil {
				problems = append(problems, problem{"attr.type", fmt.Sprintf("Attribute %q must be a number, but is %q.", a.Name, v), a.Name, 0})
				continue
			}
		case contracts.AttributeTypeBoolean:
			if v != "true" && v != "false" {
				problems = append(problems, problem{"attr.type", fmt.Sprintf("Attribute %q must be true or false, but is %q.", a.Name, v), a.Name, 0})
				continue
			}
		case contracts.AttributeTypeEnum:
			ok := false
			for _, allowed := range a.Values {
				ok = ok || allowed == v
			}
			if !ok {
				problems = append(problems, problem{"attr.enum", fmt.Sprintf("Attribute %q must be one of %v, but is %q.", a.Name, a.Values, v), a.Name, 0})
				continue
			}
		}
		valid[a.Name] = v
	}
	return valid, problems
}
