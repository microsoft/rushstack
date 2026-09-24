use std::borrow::Cow;

use crate::json::{JsonObject, JsonValue};

use super::compiled_node::{CompiledSchemaNode, DependencyRequirement, UncommonKeywordConstraints};
use super::compiler::CompiledJsonSchema;

impl CompiledJsonSchema<'_> {
    pub(super) fn object_keywords_accept(
        &self,
        node: &CompiledSchemaNode<'_>,
        uncommon: Option<&UncommonKeywordConstraints<'_>>,
        object: &JsonObject<'_>,
        object_as_json: &JsonValue<'_>,
    ) -> bool {
        let required_are_present = node
            .required
            .as_ref()
            .is_none_or(|names| names.iter().all(|name| object.contains_key(name)));
        let property_count = object.len() as u64;
        let count_is_accepted = uncommon.is_none_or(|uncommon| {
            uncommon
                .min_properties
                .is_none_or(|minimum| property_count >= minimum)
                && uncommon
                    .max_properties
                    .is_none_or(|maximum| property_count <= maximum)
        });
        if !required_are_present || !count_is_accepted {
            return false;
        }
        let declared_properties_accept = node.properties.as_ref().is_none_or(|properties| {
            properties.iter().all(|&(name, schema)| {
                object
                    .get(name)
                    .is_none_or(|property_value| self.node_accepts(schema, property_value))
            })
        });
        declared_properties_accept
            && self.undeclared_and_named_properties_accept(node, uncommon, object)
            && uncommon
                .is_none_or(|uncommon| self.dependencies_accept(uncommon, object, object_as_json))
    }

    fn undeclared_and_named_properties_accept(
        &self,
        node: &CompiledSchemaNode<'_>,
        uncommon: Option<&UncommonKeywordConstraints<'_>>,
        object: &JsonObject<'_>,
    ) -> bool {
        let pattern_properties =
            uncommon.and_then(|uncommon| uncommon.pattern_properties.as_deref());
        let property_names = uncommon.and_then(|uncommon| uncommon.property_names);
        if pattern_properties.is_none()
            && node.additional_properties.is_none()
            && property_names.is_none()
        {
            return true;
        }
        for (key, property_value) in object.entries() {
            if let Some(property_names_schema) = property_names {
                let key_as_json = JsonValue::String(Cow::Borrowed(key.as_ref()));
                if !self.node_accepts(property_names_schema, &key_as_json) {
                    return false;
                }
            }
            let mut is_additional = node
                .properties
                .as_ref()
                .is_none_or(|properties| !properties.iter().any(|&(name, _)| name == key.as_ref()));
            for &(regex_index, schema) in pattern_properties.unwrap_or_default() {
                if self.regexes[regex_index].matches_anywhere(key) {
                    is_additional = false;
                    if !self.node_accepts(schema, property_value) {
                        return false;
                    }
                }
            }
            let additional_is_rejected = is_additional
                && node.additional_properties.is_some_and(|additional_schema| {
                    !self.node_accepts(additional_schema, property_value)
                });
            if additional_is_rejected {
                return false;
            }
        }
        true
    }

    fn dependencies_accept(
        &self,
        node: &UncommonKeywordConstraints<'_>,
        object: &JsonObject<'_>,
        object_as_json: &JsonValue<'_>,
    ) -> bool {
        let Some(dependencies) = &node.dependencies else {
            return true;
        };
        dependencies.iter().all(|(name, requirement)| {
            if !object.contains_key(name) {
                return true;
            }
            match requirement {
                DependencyRequirement::RequiredPropertyNames(names) => {
                    names.iter().all(|required| object.contains_key(required))
                }
                DependencyRequirement::Subschema(schema) => {
                    self.node_accepts(*schema, object_as_json)
                }
            }
        })
    }
}
