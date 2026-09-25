use crate::json::JsonValue;

use super::compiled_node::{
    CompiledSchemaNode, NodeIdentifier, NodeKind, UncommonKeywordConstraints,
};
use super::compiler::CompiledJsonSchema;
use super::data_rules::{
    is_simple_json_data, javascript_parse_int_of_number_to_string, json_schema_type_bits_of_data,
    json_values_are_deeply_equal,
};
use super::keyword_tables::TYPE_BIT_NUMBER;

impl CompiledJsonSchema<'_> {
    pub fn is_definitely_valid(&self, data: &JsonValue<'_>) -> bool {
        is_simple_json_data(data, 0) && self.node_accepts(self.root, data)
    }

    pub(super) fn node_accepts(&self, identifier: NodeIdentifier, data: &JsonValue<'_>) -> bool {
        let node = &self.nodes[identifier as usize];
        match node.kind {
            NodeKind::AlwaysValid => return true,
            NodeKind::AlwaysInvalid => return false,
            NodeKind::Regular => {}
        }
        let data_type_bits = json_schema_type_bits_of_data(data);
        if node.allowed_type_bits != 0 && node.allowed_type_bits & data_type_bits == 0 {
            return false;
        }
        let enum_accepts = node.enum_values.is_none_or(|allowed_values| {
            allowed_values
                .iter()
                .any(|allowed_value| json_values_are_deeply_equal(allowed_value, data))
        });
        let uncommon = node.uncommon.as_deref();
        let const_accepts = uncommon
            .and_then(|uncommon| uncommon.const_value)
            .is_none_or(|expected_value| json_values_are_deeply_equal(expected_value, data));
        if !enum_accepts || !const_accepts {
            return false;
        }
        let type_specific_keywords_accept = match data {
            JsonValue::Number(number) if data_type_bits & TYPE_BIT_NUMBER != 0 => {
                uncommon.is_none_or(|uncommon| number_keywords_accept(uncommon, number.value))
            }
            JsonValue::String(text) => self.string_keywords_accept(node, uncommon, text),
            JsonValue::Array(items) => self.array_keywords_accept(node, uncommon, items),
            JsonValue::Object(object) => self.object_keywords_accept(node, uncommon, object, data),
            _ => true,
        };
        type_specific_keywords_accept && self.applicator_keywords_accept(node, uncommon, data)
    }

    fn string_keywords_accept(
        &self,
        node: &CompiledSchemaNode<'_>,
        uncommon: Option<&UncommonKeywordConstraints<'_>>,
        text: &str,
    ) -> bool {
        if let Some(uncommon) = uncommon
            .filter(|uncommon| uncommon.min_length.is_some() || uncommon.max_length.is_some())
        {
            let code_point_count = text.chars().count() as u64;
            let length_is_accepted = uncommon
                .min_length
                .is_none_or(|minimum| code_point_count >= minimum)
                && uncommon
                    .max_length
                    .is_none_or(|maximum| code_point_count <= maximum);
            if !length_is_accepted {
                return false;
            }
        }
        node.pattern_regex_index
            .is_none_or(|regex_index| self.regexes[regex_index].matches_anywhere(text))
    }

    fn array_keywords_accept(
        &self,
        node: &CompiledSchemaNode<'_>,
        uncommon: Option<&UncommonKeywordConstraints<'_>>,
        items: &[JsonValue<'_>],
    ) -> bool {
        if uncommon.is_some_and(|uncommon| !array_count_and_uniqueness_accept(uncommon, items)) {
            return false;
        }
        let every_item_is_accepted = node.items.is_none_or(|item_schema| {
            items
                .iter()
                .all(|item| self.node_accepts(item_schema, item))
        });
        every_item_is_accepted
            && uncommon
                .and_then(|uncommon| uncommon.contains)
                .is_none_or(|contained_schema| {
                    items
                        .iter()
                        .any(|item| self.node_accepts(contained_schema, item))
                })
    }

    fn applicator_keywords_accept(
        &self,
        node: &CompiledSchemaNode<'_>,
        uncommon: Option<&UncommonKeywordConstraints<'_>>,
        data: &JsonValue<'_>,
    ) -> bool {
        let all_of_accepts = node.all_of.as_ref().is_none_or(|schemas| {
            schemas
                .iter()
                .all(|&schema| self.node_accepts(schema, data))
        });
        all_of_accepts
            && uncommon.is_none_or(|uncommon| self.uncommon_applicators_accept(uncommon, data))
            && node
                .reference
                .is_none_or(|referenced_schema| self.node_accepts(referenced_schema, data))
    }

    fn uncommon_applicators_accept(
        &self,
        node: &UncommonKeywordConstraints<'_>,
        data: &JsonValue<'_>,
    ) -> bool {
        let any_of_accepts = node.any_of.as_ref().is_none_or(|schemas| {
            schemas
                .iter()
                .any(|&schema| self.node_accepts(schema, data))
        });
        if !any_of_accepts {
            return false;
        }
        if let Some(schemas) = &node.one_of {
            let mut accepting_schema_count = 0;
            for &schema in schemas {
                if self.node_accepts(schema, data) {
                    accepting_schema_count += 1;
                    if accepting_schema_count > 1 {
                        return false;
                    }
                }
            }
            if accepting_schema_count != 1 {
                return false;
            }
        }
        if node
            .not
            .is_some_and(|negated_schema| self.node_accepts(negated_schema, data))
        {
            return false;
        }
        if let Some(condition) = node.if_schema {
            let branch = if self.node_accepts(condition, data) {
                node.then_schema
            } else {
                node.else_schema
            };
            if branch.is_some_and(|branch_schema| !self.node_accepts(branch_schema, data)) {
                return false;
            }
        }
        true
    }
}

fn array_count_and_uniqueness_accept(
    uncommon: &UncommonKeywordConstraints<'_>,
    items: &[JsonValue<'_>],
) -> bool {
    let item_count = items.len() as u64;
    let count_is_accepted = uncommon
        .min_items
        .is_none_or(|minimum| item_count >= minimum)
        && uncommon
            .max_items
            .is_none_or(|maximum| item_count <= maximum);
    count_is_accepted
        && !(uncommon.unique_items
            && (1..items.len()).any(|index| {
                items[..index]
                    .iter()
                    .any(|earlier| json_values_are_deeply_equal(earlier, &items[index]))
            }))
}

fn number_keywords_accept(node: &UncommonKeywordConstraints<'_>, number: f64) -> bool {
    let bounds_accept = node.minimum.is_none_or(|minimum| number >= minimum)
        && node.maximum.is_none_or(|maximum| number <= maximum)
        && node
            .exclusive_minimum
            .is_none_or(|minimum| number > minimum)
        && node
            .exclusive_maximum
            .is_none_or(|maximum| number < maximum);
    bounds_accept
        && node.multiple_of.is_none_or(|divisor| {
            let quotient = number / divisor;
            quotient == javascript_parse_int_of_number_to_string(quotient)
        })
}
