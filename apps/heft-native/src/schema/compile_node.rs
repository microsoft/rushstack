use crate::json::{JsonObject, JsonValue};

use super::compiled_node::{NodeIdentifier, NodeKind, SchemaNodeUnderConstruction};
use super::compiler::SchemaCompiler;
use super::keyword_tables::{
    data_type_that_type_specific_keyword_applies_to, type_bit_for_json_schema_type_name,
    type_list_has_type_applicable_to_keyword, type_list_includes_type_like_ajv,
};
use super::schema_keywords::{Keyword, SchemaKeywordValues};

fn keyword_is_absent_or(
    keywords: &SchemaKeywordValues<'_>,
    keyword: Keyword,
    expected_shape: fn(&JsonValue<'_>) -> bool,
) -> bool {
    keywords.value(keyword).is_none_or(expected_shape)
}

fn is_string_value(value: &JsonValue<'_>) -> bool {
    matches!(value, JsonValue::String(_))
}

fn is_boolean_value(value: &JsonValue<'_>) -> bool {
    matches!(value, JsonValue::Boolean(_))
}

fn is_array_value(value: &JsonValue<'_>) -> bool {
    matches!(value, JsonValue::Array(_))
}

fn annotation_keywords_have_metaschema_shapes(
    keywords: &SchemaKeywordValues<'_>,
    is_draft_04: bool,
    is_root: bool,
) -> bool {
    let common_annotations_are_valid = [Keyword::Title, Keyword::Description, Keyword::Comment]
        .into_iter()
        .all(|keyword| keyword_is_absent_or(keywords, keyword, is_string_value));
    if !common_annotations_are_valid || (!is_root && keywords.has(Keyword::Schema)) {
        return false;
    }
    is_draft_04
        || (keyword_is_absent_or(keywords, Keyword::Examples, is_array_value)
            && [Keyword::ReadOnly, Keyword::WriteOnly, Keyword::Deprecated]
                .into_iter()
                .all(|keyword| keyword_is_absent_or(keywords, keyword, is_boolean_value))
            && [Keyword::ContentMediaType, Keyword::ContentEncoding]
                .into_iter()
                .all(|keyword| keyword_is_absent_or(keywords, keyword, is_string_value)))
}

impl<'schema> SchemaCompiler<'schema> {
    pub(super) fn compile_node(
        &mut self,
        schema: &'schema JsonValue<'schema>,
        context_types: &[&'schema str],
        is_root: bool,
    ) -> Option<NodeIdentifier> {
        let object = match schema {
            JsonValue::Boolean(accepts_everything) => {
                if self.is_draft_04 {
                    return None;
                }
                let kind = if *accepts_everything {
                    NodeKind::AlwaysValid
                } else {
                    NodeKind::AlwaysInvalid
                };
                return Some(self.allocate_node(SchemaNodeUnderConstruction::of_kind(kind)));
            }
            JsonValue::Object(object) => object,
            _ => return None,
        };
        let keywords = SchemaKeywordValues::gather_known_to_ajv(
            object,
            self.is_draft_04,
            is_root,
            &self.vendor_keywords,
        )?;
        if !annotation_keywords_have_metaschema_shapes(&keywords, self.is_draft_04, is_root) {
            return None;
        }
        let mut node = SchemaNodeUnderConstruction::of_kind(NodeKind::Regular);
        let data_types = compile_type_keyword_like_ajv_strict_types(
            keywords.value(Keyword::Type),
            context_types,
            &mut node,
        )?;
        verify_type_specific_keywords_have_applicable_data_types(object, &data_types)?;
        self.compile_enum_and_const_keywords(&keywords, &mut node)?;
        self.compile_number_keywords(&keywords, &mut node)?;
        self.compile_string_and_length_keywords(&keywords, &mut node)?;
        self.compile_array_keywords(&keywords, &mut node)?;
        self.compile_object_keywords(&keywords, &data_types, &mut node)?;
        self.compile_applicator_keywords(&keywords, &data_types, &mut node)?;
        self.compile_definitions_and_reference(&keywords, is_root, &mut node)?;
        Some(self.allocate_node(node))
    }
}

fn compile_type_keyword_like_ajv_strict_types<'schema>(
    type_keyword: Option<&'schema JsonValue<'schema>>,
    context_types: &[&'schema str],
    node: &mut SchemaNodeUnderConstruction<'schema>,
) -> Option<Vec<&'schema str>> {
    let mut schema_types: Vec<&'schema str> = Vec::new();
    if let Some(type_value) = type_keyword {
        match type_value {
            JsonValue::String(type_name) => schema_types.push(type_name.as_ref()),
            JsonValue::Array(items) if !items.is_empty() => {
                schema_types.reserve_exact(items.len());
                for item in items {
                    schema_types.push(item.as_str()?);
                }
            }
            _ => return None,
        }
        for (index, type_name) in schema_types.iter().enumerate() {
            let type_bit = type_bit_for_json_schema_type_name(type_name)?;
            if schema_types[..index].contains(type_name) {
                return None;
            }
            node.allowed_type_bits |= type_bit;
        }
    }
    if schema_types.is_empty() {
        return Some(context_types.to_vec());
    }
    if context_types.is_empty() {
        return Some(schema_types);
    }
    if !schema_types
        .iter()
        .all(|type_name| type_list_includes_type_like_ajv(context_types, type_name))
    {
        return None;
    }
    let mut narrowed_types: Vec<&'schema str> = Vec::with_capacity(context_types.len());
    for context_type in context_types {
        if type_list_includes_type_like_ajv(&schema_types, context_type) {
            narrowed_types.push(context_type);
        } else if *context_type == "number" && schema_types.contains(&"integer") {
            narrowed_types.push("integer");
        }
    }
    Some(narrowed_types)
}

fn verify_type_specific_keywords_have_applicable_data_types(
    object: &JsonObject<'_>,
    data_types: &[&str],
) -> Option<()> {
    for (key, _) in object.entries() {
        if let Some(keyword_type) = data_type_that_type_specific_keyword_applies_to(key) {
            if !type_list_has_type_applicable_to_keyword(data_types, keyword_type) {
                return None;
            }
        }
    }
    Some(())
}
