use crate::json::JsonValue;

use super::compile_value_keywords::optional_count_keyword;
use super::compiled_node::{
    DependencyRequirement, NodeIdentifier, NodeKind, SchemaNodeUnderConstruction,
};
use super::compiler::SchemaCompiler;
use super::keyword_tables::is_object_prototype_member_name;
use super::schema_keywords::{Keyword, SchemaKeywordValues};

fn unique_property_name_list<'schema>(
    value: &'schema JsonValue<'schema>,
) -> Option<Vec<&'schema str>> {
    let items = value.as_array()?;
    let mut names: Vec<&'schema str> = Vec::with_capacity(items.len());
    for item in items {
        let name = item.as_str()?;
        if is_object_prototype_member_name(name) || names.contains(&name) {
            return None;
        }
        names.push(name);
    }
    Some(names)
}

impl<'schema> SchemaCompiler<'schema> {
    pub(super) fn compile_object_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        data_types: &[&'schema str],
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        if let Some(required) = keywords.value(Keyword::Required) {
            let names = unique_property_name_list(required)?;
            if self.is_draft_04 && names.is_empty() {
                return None;
            }
            node.required = Some(names);
        }
        node.uncommon.min_properties =
            optional_count_keyword(keywords.value(Keyword::MinProperties))?;
        node.uncommon.max_properties =
            optional_count_keyword(keywords.value(Keyword::MaxProperties))?;
        if let Some(properties) = keywords.value(Keyword::Properties) {
            node.properties = Some(self.compile_properties_keyword(properties)?);
        }
        if let Some(pattern_properties) = keywords.value(Keyword::PatternProperties) {
            let compiled = self.compile_pattern_properties_keyword(
                pattern_properties,
                node.properties.as_deref(),
            )?;
            node.uncommon.pattern_properties = Some(compiled);
        }
        if let Some(additional_properties) = keywords.value(Keyword::AdditionalProperties) {
            node.additional_properties = Some(match additional_properties {
                JsonValue::Boolean(true) => {
                    self.allocate_node(SchemaNodeUnderConstruction::of_kind(NodeKind::AlwaysValid))
                }
                JsonValue::Boolean(false) => self.allocate_node(
                    SchemaNodeUnderConstruction::of_kind(NodeKind::AlwaysInvalid),
                ),
                _ => self.compile_node(additional_properties, &[], false)?,
            });
        }
        if let Some(dependencies) = keywords.value(Keyword::Dependencies) {
            node.uncommon.dependencies =
                Some(self.compile_dependencies_keyword(dependencies, data_types)?);
        }
        if let Some(property_names) = keywords.value(Keyword::PropertyNames) {
            node.uncommon.property_names =
                Some(self.compile_node(property_names, &["string"], false)?);
        }
        Some(())
    }

    fn compile_properties_keyword(
        &mut self,
        properties: &'schema JsonValue<'schema>,
    ) -> Option<Vec<(&'schema str, NodeIdentifier)>> {
        let properties = properties.as_object()?;
        let mut compiled = Vec::with_capacity(properties.len());
        for (name, subschema) in properties.entries() {
            if is_object_prototype_member_name(name) {
                return None;
            }
            compiled.push((name.as_ref(), self.compile_node(subschema, &[], false)?));
        }
        Some(compiled)
    }

    fn compile_pattern_properties_keyword(
        &mut self,
        pattern_properties: &'schema JsonValue<'schema>,
        sibling_properties: Option<&[(&'schema str, NodeIdentifier)]>,
    ) -> Option<Vec<(usize, NodeIdentifier)>> {
        let pattern_properties = pattern_properties.as_object()?;
        let mut compiled = Vec::with_capacity(pattern_properties.len());
        for (pattern, subschema) in pattern_properties.entries() {
            if pattern == "__proto__" {
                return None;
            }
            let regex_index = self.regex_index_for_pattern(pattern.as_ref())?;
            for (property_name, _) in sibling_properties.unwrap_or_default() {
                let property_matches_pattern = self.regexes[regex_index]
                    .matches_anywhere_without_unicode_flag(property_name)?;
                if property_matches_pattern {
                    return None;
                }
            }
            compiled.push((regex_index, self.compile_node(subschema, &[], false)?));
        }
        Some(compiled)
    }

    fn compile_dependencies_keyword(
        &mut self,
        dependencies: &'schema JsonValue<'schema>,
        data_types: &[&'schema str],
    ) -> Option<Vec<(&'schema str, DependencyRequirement<'schema>)>> {
        let dependencies = dependencies.as_object()?;
        let mut compiled = Vec::with_capacity(dependencies.len());
        for (name, dependency) in dependencies.entries() {
            if is_object_prototype_member_name(name) {
                return None;
            }
            let requirement = if matches!(dependency, JsonValue::Array(_)) {
                let names = unique_property_name_list(dependency)?;
                if self.is_draft_04 && names.is_empty() {
                    return None;
                }
                DependencyRequirement::RequiredPropertyNames(names)
            } else {
                DependencyRequirement::Subschema(self.compile_node(dependency, data_types, false)?)
            };
            compiled.push((name.as_ref(), requirement));
        }
        Some(compiled)
    }
}
