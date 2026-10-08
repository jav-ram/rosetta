package render

import (
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// ValueKind says what a Value holds.
type ValueKind int

const (
	Scalar ValueKind = iota
	List
	Map
)

// Value is a parsed field value.
type Value struct {
	Kind ValueKind
	// Text is the scalar's text. Type is one of str, int, float, bool, null.
	Text string
	Type string
	// Block is true for block scalars (| and >), which are read as block Markdown.
	Block bool
	// Plain is true when the field definition says the text is not Markdown.
	Plain  bool
	Items  []Value
	Fields []Field
	// Line is the 1-based line within the directive body.
	Line int
}

// Field is a named value.
type Field struct {
	Name  string
	Value Value
	// Missing marks a required field that is absent or invalid; it renders as a placeholder.
	Missing bool
	// Unknown marks a field with no definition, rendered only when the component declares no fields.
	Unknown bool
	Line    int
}

type bodyProblem struct {
	code, message string
	line          int
}

var yamlLineRE = regexp.MustCompile(`line (\d+)`)

// parseBody reads a data component's body: a restricted subset of YAML 1.2 (spec 4.1).
// A fatal problem (yaml.syntax) is returned as fatal; the rest are non-fatal warnings.
func parseBody(raw string) (fields []Field, problems []bodyProblem, fatal *bodyProblem) {
	for i, line := range strings.Split(raw, "\n") {
		indent := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
		if strings.Contains(indent, "\t") {
			return nil, nil, &bodyProblem{"yaml.syntax", "Tabs are not allowed for indentation; use spaces.", i + 1}
		}
	}
	dec := yaml.NewDecoder(strings.NewReader(raw))
	var doc yaml.Node
	if err := dec.Decode(&doc); err != nil {
		if errors.Is(err, io.EOF) {
			return nil, nil, nil // empty body
		}
		// The wording of YAML errors differs between libraries, so only the line is reported:
		// messages are part of the output other parsers are compared against.
		line := 1
		if m := yamlLineRE.FindStringSubmatch(err.Error()); m != nil {
			line, _ = strconv.Atoi(m[1])
		}
		return nil, nil, &bodyProblem{"yaml.syntax", fmt.Sprintf("The body is not valid YAML (near line %d).", line), line}
	}
	var extra yaml.Node
	if err := dec.Decode(&extra); err == nil {
		problems = append(problems, bodyProblem{"yaml.unsupported", "Multiple YAML documents are not supported; only the first is used.", extra.Line})
	}
	if len(doc.Content) == 0 {
		return nil, problems, nil
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, nil, &bodyProblem{"yaml.syntax", "The body must be a mapping of fields (key: value).", root.Line}
	}
	c := &converter{}
	v := c.convert(root, 0)
	return v.Fields, append(problems, c.problems...), nil
}

type converter struct{ problems []bodyProblem }

func (c *converter) unsupported(n *yaml.Node, what string) {
	c.problems = append(c.problems, bodyProblem{"yaml.unsupported", fmt.Sprintf("Unsupported YAML feature (%s); it is ignored.", what), n.Line})
}

// convert turns a YAML node into a Value. flowDepth counts enclosing flow collections.
func (c *converter) convert(n *yaml.Node, flowDepth int) Value {
	if n.Anchor != "" {
		c.unsupported(n, "anchor")
	}
	if n.Style&yaml.TaggedStyle != 0 {
		c.unsupported(n, "tag")
	}
	switch n.Kind {
	case yaml.AliasNode:
		c.unsupported(n, "alias")
		return Value{Kind: Scalar, Type: "null", Line: n.Line}
	case yaml.MappingNode:
		if n.Style&yaml.FlowStyle != 0 {
			flowDepth++
			if flowDepth > 1 {
				c.unsupported(n, "nested flow collection")
			}
		}
		v := Value{Kind: Map, Line: n.Line}
		for i := 0; i+1 < len(n.Content); i += 2 {
			k, val := n.Content[i], n.Content[i+1]
			if k.Kind != yaml.ScalarNode {
				c.unsupported(k, "complex key")
				continue
			}
			if k.Value == "<<" {
				c.unsupported(k, "merge key")
				continue
			}
			v.Fields = append(v.Fields, Field{Name: k.Value, Value: c.convert(val, flowDepth), Line: k.Line})
		}
		return v
	case yaml.SequenceNode:
		if n.Style&yaml.FlowStyle != 0 {
			flowDepth++
			if flowDepth > 1 {
				c.unsupported(n, "nested flow collection")
			}
		}
		v := Value{Kind: List, Line: n.Line}
		for _, item := range n.Content {
			v.Items = append(v.Items, c.convert(item, flowDepth))
		}
		return v
	default:
		t := "str"
		switch n.ShortTag() {
		case "!!int":
			t = "int"
		case "!!float":
			t = "float"
		case "!!bool":
			t = "bool"
		case "!!null":
			t = "null"
		}
		return Value{Kind: Scalar, Text: n.Value, Type: t, Block: n.Style&(yaml.LiteralStyle|yaml.FoldedStyle) != 0, Line: n.Line}
	}
}
