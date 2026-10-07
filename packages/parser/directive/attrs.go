package directive

import (
	"fmt"
	"strings"
)

// Attrs is a parsed attribute list. Values are always strings (spec section 3.1).
type Attrs struct {
	Values map[string]string
	// Order lists keys in first-seen order, so output is stable.
	Order []string
}

// Get returns the value of key.
func (a Attrs) Get(key string) (string, bool) {
	v, ok := a.Values[key]
	return v, ok
}

type attrProblem struct {
	code    string
	message string
	field   string
}

// parseAttrs parses an attribute list starting at s[0] == '{'. It returns the attributes
// parsed so far, the number of bytes consumed (through the closing brace, or all of s on a
// syntax error) and any problems found. A syntax error keeps the attributes parsed before it.
func parseAttrs(s string) (Attrs, int, []attrProblem) {
	attrs := Attrs{Values: map[string]string{}}
	var problems []attrProblem
	set := func(key, value string) {
		if key == "class" {
			if old, ok := attrs.Values["class"]; ok {
				attrs.Values["class"] = old + " " + value
				return
			}
		} else if _, ok := attrs.Values[key]; ok {
			problems = append(problems, attrProblem{"attr.duplicate", fmt.Sprintf("Duplicate attribute %q; the last value wins.", key), key})
		}
		if _, ok := attrs.Values[key]; !ok {
			attrs.Order = append(attrs.Order, key)
		}
		attrs.Values[key] = value
	}
	syntax := func(msg string) (Attrs, int, []attrProblem) {
		problems = append(problems, attrProblem{"attr.syntax", msg, ""})
		return attrs, len(s), problems
	}

	i := 1 // after '{'
	skipSpace := func() {
		for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
	}
	for {
		skipSpace()
		if i >= len(s) {
			return syntax("Unclosed attribute list: missing \"}\".")
		}
		if s[i] == '}' {
			return attrs, i + 1, problems
		}
		switch s[i] {
		case '#', '.':
			marker := s[i]
			i++
			start := i
			for i < len(s) && isBare(s[i]) {
				i++
			}
			if start == i {
				return syntax(fmt.Sprintf("Expected a name after %q.", string(marker)))
			}
			if marker == '#' {
				set("id", s[start:i])
			} else {
				set("class", s[start:i])
			}
		default:
			start := i
			if !isKeyStart(s[i]) {
				return syntax(fmt.Sprintf("Unexpected %q in attribute list.", string(s[i])))
			}
			for i < len(s) && isKeyChar(s[i]) {
				i++
			}
			key := s[start:i]
			if i < len(s) && s[i] == '=' {
				i++
				value, n, err := parseValue(s[i:])
				if err != "" {
					return syntax(err)
				}
				i += n
				set(key, value)
			} else {
				set(key, "true") // flag
			}
		}
		// Attributes are separated by whitespace (or end at the brace).
		if i < len(s) && s[i] != ' ' && s[i] != '\t' && s[i] != '}' {
			return syntax(fmt.Sprintf("Expected a space between attributes, found %q.", string(s[i])))
		}
	}
}

func parseValue(s string) (string, int, string) {
	if s == "" {
		return "", 0, "Expected a value after \"=\"."
	}
	if s[0] == '"' {
		var b strings.Builder
		for i := 1; i < len(s); i++ {
			switch s[i] {
			case '"':
				return b.String(), i + 1, ""
			case '\\':
				if i+1 < len(s) && (s[i+1] == '"' || s[i+1] == '\\') {
					b.WriteByte(s[i+1])
					i++
					continue
				}
				b.WriteByte('\\')
			default:
				b.WriteByte(s[i])
			}
		}
		return "", 0, "Unterminated quoted value."
	}
	i := 0
	for i < len(s) && isBare(s[i]) {
		i++
	}
	if i == 0 {
		return "", 0, "Expected a value after \"=\"."
	}
	return s[:i], i, ""
}

func isKeyStart(c byte) bool {
	return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isKeyChar(c byte) bool { return isKeyStart(c) || c == '-' || (c >= '0' && c <= '9') }

// isBare reports whether c may appear in an unquoted value, id or class name.
func isBare(c byte) bool {
	if c <= ' ' || c == 0x7f {
		return false
	}
	switch c {
	case '"', '\'', '=', '<', '>', '`', '{', '}':
		return false
	}
	return true
}
