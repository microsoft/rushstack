use super::fallback::{fallback, ConfigResult};
use super::fs_probe::read_text_or_missing;
use super::plugin_manifest::PluginDefinition;
use super::plugin_references::PluginReferences;
use super::tree::{ConfigTree, NodeId};
use super::tree_json::{empty_json_object, tree_to_json_value};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};
use crate::schema::{compile_json_schema_for_fast_validation, CompiledJsonSchema};

fn options_are_definitely_valid(schema_path: &str, options: &JsonValue) -> ConfigResult<bool> {
    let schema_text: String = match read_text_or_missing(schema_path)? {
        Some(schema_text) => schema_text,
        None => return fallback("a plugin options schema file disappeared"),
    };
    let schema_document: JsonValue = match parse_json_with_comments_exactly_like_jju(&schema_text) {
        Ok(schema_document) => schema_document,
        Err(_) => return fallback("a plugin options schema can't be parsed exactly"),
    };
    let compiled_schema: CompiledJsonSchema =
        match compile_json_schema_for_fast_validation(&schema_document) {
            Some(compiled_schema) => compiled_schema,
            None => {
                return fallback("a plugin options schema is outside the fast validation subset")
            }
        };
    Ok(compiled_schema.is_definitely_valid(options))
}

fn options_or_empty_object<'text>(
    tree: &ConfigTree<'text>,
    options: Option<NodeId>,
) -> JsonValue<'text> {
    match options {
        Some(options) if !tree.is_falsy(options) => tree_to_json_value(tree, options),
        _ => empty_json_object(),
    }
}

pub fn validate_plugin_options(
    tree: &ConfigTree,
    references: &PluginReferences,
    selected: &[usize],
    definitions: &[PluginDefinition],
) -> ConfigResult<()> {
    for (reference, definition) in references.all_plugin_references().zip(selected) {
        if let Some(schema_path) = &definitions[*definition].options_schema_path {
            let options: JsonValue = options_or_empty_object(tree, reference.options);
            if !options_are_definitely_valid(schema_path, &options)? {
                return fallback("plugin options are not definitely valid");
            }
        }
    }
    Ok(())
}
