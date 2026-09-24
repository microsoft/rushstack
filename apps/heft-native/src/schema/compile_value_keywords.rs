use crate::json::JsonValue;

use super::compiled_node::SchemaNodeUnderConstruction;
use super::compiler::SchemaCompiler;
use super::data_rules::{
    is_simple_json_data, json_values_are_deeply_equal, non_negative_safe_integer_value,
};
use super::schema_keywords::{Keyword, SchemaKeywordValues};

fn optional_number_keyword(keyword_value: Option<&JsonValue<'_>>) -> Option<Option<f64>> {
    match keyword_value {
        None => Some(None),
        Some(JsonValue::Number(number)) => Some(Some(number.value)),
        Some(_) => None,
    }
}

pub(super) fn optional_count_keyword(keyword_value: Option<&JsonValue<'_>>) -> Option<Option<u64>> {
    match keyword_value {
        None => Some(None),
        Some(value) => non_negative_safe_integer_value(value).map(Some),
    }
}

fn apply_draft_04_boolean_exclusive_bound(
    exclusive_keyword: Option<&JsonValue<'_>>,
    inclusive_bound: &mut Option<f64>,
    exclusive_bound: &mut Option<f64>,
) -> Option<()> {
    let Some(exclusive_keyword) = exclusive_keyword else {
        return Some(());
    };
    let bound_is_exclusive = exclusive_keyword.as_bool()?;
    inclusive_bound.as_ref()?;
    if bound_is_exclusive {
        *exclusive_bound = inclusive_bound.take();
    }
    Some(())
}

fn has_duplicate_values(values: &[JsonValue<'_>]) -> bool {
    (1..values.len()).any(|index| {
        values[..index]
            .iter()
            .any(|earlier| json_values_are_deeply_equal(earlier, &values[index]))
    })
}

impl<'schema> SchemaCompiler<'schema> {
    pub(super) fn compile_enum_and_const_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        if let Some(enum_value) = keywords.value(Keyword::Enum) {
            let allowed_values = enum_value.as_array()?;
            if allowed_values.is_empty()
                || !is_simple_json_data(enum_value, 0)
                || has_duplicate_values(allowed_values)
            {
                return None;
            }
            node.enum_values = Some(allowed_values);
        }
        if let Some(const_value) = keywords.value(Keyword::Const) {
            if !is_simple_json_data(const_value, 0) {
                return None;
            }
            node.uncommon.const_value = Some(const_value);
        }
        Some(())
    }

    pub(super) fn compile_number_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        node.uncommon.minimum = optional_number_keyword(keywords.value(Keyword::Minimum))?;
        node.uncommon.maximum = optional_number_keyword(keywords.value(Keyword::Maximum))?;
        if self.is_draft_04 {
            apply_draft_04_boolean_exclusive_bound(
                keywords.value(Keyword::ExclusiveMinimum),
                &mut node.uncommon.minimum,
                &mut node.uncommon.exclusive_minimum,
            )?;
            apply_draft_04_boolean_exclusive_bound(
                keywords.value(Keyword::ExclusiveMaximum),
                &mut node.uncommon.maximum,
                &mut node.uncommon.exclusive_maximum,
            )?;
        } else {
            node.uncommon.exclusive_minimum =
                optional_number_keyword(keywords.value(Keyword::ExclusiveMinimum))?;
            node.uncommon.exclusive_maximum =
                optional_number_keyword(keywords.value(Keyword::ExclusiveMaximum))?;
        }
        if let Some(divisor) = optional_number_keyword(keywords.value(Keyword::MultipleOf))? {
            if divisor.is_nan() || divisor <= 0.0 {
                return None;
            }
            node.uncommon.multiple_of = Some(divisor);
        }
        Some(())
    }

    pub(super) fn compile_string_and_length_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        node.uncommon.min_length = optional_count_keyword(keywords.value(Keyword::MinLength))?;
        node.uncommon.max_length = optional_count_keyword(keywords.value(Keyword::MaxLength))?;
        if let Some(pattern) = keywords.value(Keyword::Pattern) {
            node.pattern_regex_index = Some(self.regex_index_for_pattern(pattern.as_str()?)?);
        }
        Some(())
    }

    pub(super) fn compile_array_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        node.uncommon.min_items = optional_count_keyword(keywords.value(Keyword::MinItems))?;
        node.uncommon.max_items = optional_count_keyword(keywords.value(Keyword::MaxItems))?;
        if let Some(unique_items) = keywords.value(Keyword::UniqueItems) {
            node.uncommon.unique_items = unique_items.as_bool()?;
        }
        if let Some(items) = keywords.value(Keyword::Items) {
            if matches!(items, JsonValue::Array(_)) {
                return None;
            }
            node.items = Some(self.compile_node(items, &[], false)?);
        }
        if let Some(contains) = keywords.value(Keyword::Contains) {
            node.uncommon.contains = Some(self.compile_node(contains, &[], false)?);
        }
        Some(())
    }
}
