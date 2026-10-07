package directive

import "github.com/jav-ram/rosetta/packages/contracts"

func ptr[T any](v T) *T { return &v }

// Builtins returns the M1 component definitions (spec section 9.2).
// The fields of statblock come from a system plugin, so none are declared here.
func Builtins() []contracts.ComponentDefinition {
	return []contracts.ComponentDefinition{
		{
			Name: "statblock", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindData,
			Breakable:  ptr(false),
			Attributes: []contracts.Attribute{{Name: "system", Type: contracts.AttributeTypeString}},
		},
		{
			Name: "readaloud", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindContainer,
			Breakable: ptr(true),
		},
		{
			Name: "sidebar", Form: contracts.ComponentDefinitionFormBlock, Kind: contracts.ComponentDefinitionKindContainer,
			Breakable:  ptr(true),
			Attributes: []contracts.Attribute{{Name: "title", Type: contracts.AttributeTypeString}},
		},
		{Name: "pagebreak", Form: contracts.ComponentDefinitionFormLeaf, Kind: contracts.ComponentDefinitionKindLeaf},
	}
}
