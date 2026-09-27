use super::fallback::{fallback, ConfigResult};
use super::fs_probe::FileSystemProbeCache;
use super::plugin_manifest::PluginDefinition;
use super::plugin_references::PluginReferences;
use super::tree::{ConfigTree, NodeId};
use super::tree_json::{empty_json_object, tree_to_json_value};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};
use crate::schema::{compile_json_schema_for_fast_validation, CompiledJsonSchema};

fn options_or_empty_object<'text>(
    tree: &ConfigTree<'text>,
    options: Option<NodeId>,
) -> JsonValue<'text> {
    match options {
        Some(options) if !tree.is_falsy(options) => tree_to_json_value(tree, options),
        _ => empty_json_object(),
    }
}

fn read_options_schema_texts(
    file_system: &mut FileSystemProbeCache,
    schema_paths: &[&str],
) -> ConfigResult<Vec<String>> {
    let mut schema_texts: Vec<String> = Vec::with_capacity(schema_paths.len());
    for schema_path in schema_paths {
        match file_system.read_text_or_missing(schema_path)? {
            Some(schema_text) => schema_texts.push(schema_text),
            None => return fallback("a plugin options schema file disappeared"),
        }
    }
    Ok(schema_texts)
}

fn parse_options_schema(schema_text: &str) -> ConfigResult<JsonValue<'_>> {
    match parse_json_with_comments_exactly_like_jju(schema_text) {
        Ok(schema_document) => Ok(schema_document),
        Err(_) => fallback("a plugin options schema can't be parsed exactly"),
    }
}

fn compile_options_schema<'schema>(
    schema_document: &'schema JsonValue<'schema>,
) -> ConfigResult<CompiledJsonSchema<'schema>> {
    match compile_json_schema_for_fast_validation(schema_document) {
        Some(compiled_schema) => Ok(compiled_schema),
        None => fallback("a plugin options schema is outside the fast validation subset"),
    }
}

pub fn validate_plugin_options(
    file_system: &mut FileSystemProbeCache,
    tree: &ConfigTree,
    references: &PluginReferences,
    selected: &[usize],
    definitions: &[PluginDefinition],
) -> ConfigResult<()> {
    let mut schema_paths: Vec<&str> = Vec::new();
    for definition in selected {
        if let Some(schema_path) = &definitions[*definition].options_schema_path {
            if !schema_paths.contains(&schema_path.as_str()) {
                schema_paths.push(schema_path);
            }
        }
    }
    let schema_texts: Vec<String> = read_options_schema_texts(file_system, &schema_paths)?;
    let schema_documents: Vec<JsonValue> = schema_texts
        .iter()
        .map(|schema_text| parse_options_schema(schema_text))
        .collect::<ConfigResult<Vec<JsonValue>>>()?;
    let compiled_schemas: Vec<CompiledJsonSchema> = schema_documents
        .iter()
        .map(compile_options_schema)
        .collect::<ConfigResult<Vec<CompiledJsonSchema>>>()?;
    for (reference, definition) in references.all_plugin_references().zip(selected) {
        if let Some(schema_path) = &definitions[*definition].options_schema_path {
            let schema_index: Option<usize> =
                schema_paths.iter().position(|path| path == schema_path);
            let options: JsonValue = options_or_empty_object(tree, reference.options);
            let valid: bool = schema_index
                .is_some_and(|index| compiled_schemas[index].is_definitely_valid(&options));
            if !valid {
                return fallback("plugin options are not definitely valid");
            }
        }
    }
    Ok(())
}
