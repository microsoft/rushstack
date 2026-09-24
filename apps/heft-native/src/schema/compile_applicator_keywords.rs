use crate::json::JsonValue;

use super::compiled_node::{NodeIdentifier, SchemaNodeUnderConstruction};
use super::compiler::SchemaCompiler;
use super::schema_keywords::{Keyword, SchemaKeywordValues};

const DEFINITIONS_KEYWORDS: [(Keyword, &str); 2] = [
    (Keyword::Definitions, "definitions"),
    (Keyword::DollarDefinitions, "$defs"),
];

fn local_reference_to_definition(definitions_keyword: &str, definition_name: &str) -> String {
    let escaped_name = definition_name.replace('~', "~0").replace('/', "~1");
    let mut reference = String::with_capacity(3 + definitions_keyword.len() + escaped_name.len());
    reference.push_str("#/");
    reference.push_str(definitions_keyword);
    reference.push('/');
    reference.push_str(&escaped_name);
    reference
}

impl<'schema> SchemaCompiler<'schema> {
    fn move_inline_subschemas_before_references(&self, schemas: &mut [NodeIdentifier]) {
        let mut inline_schema_count = 0;
        for index in 0..schemas.len() {
            let schema = schemas[index];
            if self.nodes[schema as usize].reference.is_none() {
                schemas.copy_within(inline_schema_count..index, inline_schema_count + 1);
                schemas[inline_schema_count] = schema;
                inline_schema_count += 1;
            }
        }
    }

    pub(super) fn compile_applicator_keywords(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        data_types: &[&'schema str],
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        if let Some(all_of) = keywords.value(Keyword::AllOf) {
            let mut all_of_schemas = self.compile_schema_array(all_of, data_types)?;
            self.move_inline_subschemas_before_references(&mut all_of_schemas);
            node.all_of = Some(all_of_schemas);
        }
        if let Some(any_of) = keywords.value(Keyword::AnyOf) {
            node.uncommon.any_of = Some(self.compile_schema_array(any_of, data_types)?);
        }
        if let Some(one_of) = keywords.value(Keyword::OneOf) {
            node.uncommon.one_of = Some(self.compile_schema_array(one_of, data_types)?);
        }
        if let Some(not) = keywords.value(Keyword::Not) {
            node.uncommon.not = Some(self.compile_node(not, data_types, false)?);
        }
        let if_value = keywords.value(Keyword::If);
        let then_value = keywords.value(Keyword::Then);
        let else_value = keywords.value(Keyword::Else);
        if if_value.is_none() && then_value.is_none() && else_value.is_none() {
            return Some(());
        }
        let if_value = if_value?;
        if then_value.is_none() && else_value.is_none() {
            return None;
        }
        node.uncommon.if_schema = Some(self.compile_node(if_value, data_types, false)?);
        if let Some(then_value) = then_value {
            node.uncommon.then_schema = Some(self.compile_node(then_value, data_types, false)?);
        }
        if let Some(else_value) = else_value {
            node.uncommon.else_schema = Some(self.compile_node(else_value, data_types, false)?);
        }
        Some(())
    }

    pub(super) fn compile_definitions_and_reference(
        &mut self,
        keywords: &SchemaKeywordValues<'schema>,
        is_root: bool,
        node: &mut SchemaNodeUnderConstruction<'schema>,
    ) -> Option<()> {
        for (definitions_keyword, definitions_keyword_name) in DEFINITIONS_KEYWORDS {
            let Some(definitions) = keywords.value(definitions_keyword) else {
                continue;
            };
            let definitions = match definitions {
                JsonValue::Object(definitions) if is_root => definitions,
                _ => return None,
            };
            for (definition_name, _) in definitions.entries() {
                self.compile_reference(&local_reference_to_definition(
                    definitions_keyword_name,
                    definition_name,
                ))?;
            }
        }
        if let Some(reference) = keywords.value(Keyword::Reference) {
            node.reference = Some(self.compile_reference(reference.as_str()?)?);
        }
        Some(())
    }
}
