package render

import (
	"bytes"

	"github.com/jav-ram/rosetta/packages/contracts"
	"gopkg.in/yaml.v3"
)

type frontMatter struct {
	values  map[string]any
	raw     string
	warning *contracts.Warning
}

// splitFrontMatter finds YAML front matter at the very start of the document: a "---" line,
// the YAML, and a closing "---" line (spec section 7). It returns the source with that block
// blanked out, keeping every line number and byte offset unchanged. An opening "---" with no
// closing line is not front matter.
func splitFrontMatter(src []byte) ([]byte, frontMatter) {
	rest := bytes.TrimPrefix(src, []byte("\xef\xbb\xbf"))
	bom := len(src) - len(rest)
	first, after, ok := bytes.Cut(rest, []byte("\n"))
	if !ok || string(bytes.TrimRight(first, " \t\r")) != "---" {
		return src, frontMatter{}
	}
	pos := bom + len(first) + 1
	end := -1
	line := 2
	closeLine := 0
	for len(after) > 0 {
		l, next, _ := bytes.Cut(after, []byte("\n"))
		if string(bytes.TrimRight(l, " \t\r")) == "---" {
			end = pos + len(l)
			if len(next) > 0 || bytes.HasSuffix(after, []byte("\n")) {
				end++
			}
			closeLine = line
			break
		}
		pos += len(l) + 1
		after = next
		line++
	}
	if end < 0 {
		return src, frontMatter{}
	}
	if end > len(src) {
		end = len(src)
	}
	body := src[bom+len(first)+1 : pos] // the YAML between the two "---" lines
	fm := frontMatter{raw: string(bytes.TrimRight(body, "\r\n"))}
	var values map[string]any
	if err := yaml.Unmarshal(body, &values); err != nil {
		w := contracts.Warning{
			Code: "frontmatter.syntax", Severity: contracts.WarningSeverityWarning,
			Message: "The front matter is not valid YAML; it is kept but ignored.",
			Range:   &contracts.Position{Start: contracts.Point{Line: 1, Column: 1}, End: contracts.Point{Line: closeLine, Column: 4}},
		}
		fm.warning = &w
	} else {
		if values == nil {
			values = map[string]any{}
		}
		fm.values = values
	}
	// Blank the block but keep newlines, so lines and offsets are unchanged.
	out := make([]byte, len(src))
	copy(out, src)
	for i := 0; i < end; i++ {
		if out[i] != '\n' && out[i] != '\r' {
			out[i] = ' '
		}
	}
	return out, fm
}
