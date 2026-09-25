use super::embedded_schemas::{
    parse_embedded_schema, HEFT_JSON_SCHEMA_TEXT, HEFT_PLUGIN_JSON_SCHEMA_TEXT,
};
use super::fallback::{fallback, ConfigResult};
use super::heft_json_chain::{discover_heft_json_chain, HeftJsonChain};
use super::heft_json_merge::{merge_heft_json_chain, PluginPackageResolver};
use super::normalize::normalize_heft_configuration;
use super::package_json::PackageJsonLookup;
use super::plugin_manifest::{
    load_plugin_definitions, parse_plugin_package_manifest, read_plugin_package_manifest,
};
use super::plugin_manifest::{PluginDefinition, PluginPackageManifest};
use super::plugin_options::validate_plugin_options;
use super::plugin_references::{collect_plugin_references, PluginReferences};
use super::plugin_selection::select_plugin_definitions;
use super::rig::{load_rig_config_data, RigConfigData};
use super::tree::{ConfigTree, NodeId};
use super::tree_json::tree_to_json_value;
use crate::json::JsonValue;
use crate::schema::{compile_json_schema_for_fast_validation, CompiledJsonSchema};

pub struct HeftConfigurationRequest<'request> {
    pub build_folder_path: &'request str,
    pub heft_module_folder: &'request str,
}

pub struct LoadedHeftConfiguration<'loaded> {
    pub build_folder_path: &'loaded str,
    pub rig: &'loaded RigConfigData,
    pub heft_json_chain: &'loaded HeftJsonChain,
    pub tree: &'loaded ConfigTree<'loaded>,
    pub heft_json: NodeId,
    pub references: &'loaded PluginReferences<'loaded>,
    pub manifests: &'loaded [PluginPackageManifest],
    pub parsed_manifests: &'loaded [JsonValue<'loaded>],
    pub definitions: &'loaded [PluginDefinition<'loaded>],
    pub selected_definitions: &'loaded [usize],
}

fn compile_embedded_schema<'schema>(
    schema_document: &'schema JsonValue<'schema>,
) -> ConfigResult<CompiledJsonSchema<'schema>> {
    match compile_json_schema_for_fast_validation(schema_document) {
        Some(compiled_schema) => Ok(compiled_schema),
        None => fallback("an embedded schema is outside the fast validation subset"),
    }
}

fn validate_merged_heft_json(tree: &ConfigTree, merged: NodeId) -> ConfigResult<()> {
    let schema_document: JsonValue<'static> = parse_embedded_schema(HEFT_JSON_SCHEMA_TEXT)?;
    let compiled_schema: CompiledJsonSchema = compile_embedded_schema(&schema_document)?;
    if compiled_schema.is_definitely_valid(&tree_to_json_value(tree, merged)) {
        Ok(())
    } else {
        fallback("heft.json is not definitely valid")
    }
}

fn read_plugin_package_manifests(
    references: &PluginReferences,
) -> ConfigResult<Vec<PluginPackageManifest>> {
    let mut manifests: Vec<PluginPackageManifest> = Vec::new();
    for reference in references.all_plugin_references() {
        if !manifests
            .iter()
            .any(|manifest| manifest.package_root == reference.package_root)
        {
            manifests.push(read_plugin_package_manifest(
                reference.package_root,
                reference.package_name,
            )?);
        }
    }
    Ok(manifests)
}

fn parse_plugin_package_manifests(
    manifests: &[PluginPackageManifest],
) -> ConfigResult<Vec<JsonValue<'_>>> {
    let schema_document: JsonValue<'static> = parse_embedded_schema(HEFT_PLUGIN_JSON_SCHEMA_TEXT)?;
    let compiled_schema: CompiledJsonSchema = compile_embedded_schema(&schema_document)?;
    manifests
        .iter()
        .map(|manifest| parse_plugin_package_manifest(manifest, &compiled_schema))
        .collect()
}

pub fn load_heft_configuration_and_then<Output>(
    request: &HeftConfigurationRequest,
    lookup: &mut PackageJsonLookup,
    consume: impl FnOnce(&LoadedHeftConfiguration) -> Output,
) -> ConfigResult<Output> {
    if cfg!(not(unix)) {
        return fallback("native configuration loading implements POSIX paths only");
    }
    let rig: RigConfigData = load_rig_config_data(request.build_folder_path)?;
    let heft_json_chain: HeftJsonChain =
        discover_heft_json_chain(lookup, request.build_folder_path, &rig)?;
    let mut tree: ConfigTree = ConfigTree::default();
    let mut resolver: PluginPackageResolver = PluginPackageResolver {
        lookup,
        heft_module_folder: request.heft_module_folder,
        heft_package_folder: None,
    };
    let merged: NodeId = merge_heft_json_chain(
        &mut tree,
        &heft_json_chain,
        heft_json_chain.entry,
        &mut resolver,
    )?;
    validate_merged_heft_json(&tree, merged)?;
    let heft_json: NodeId = normalize_heft_configuration(&mut tree, merged)?;
    let tree: ConfigTree = tree;
    let references: PluginReferences = collect_plugin_references(&tree, heft_json)?;
    let manifests: Vec<PluginPackageManifest> = read_plugin_package_manifests(&references)?;
    let parsed_manifests: Vec<JsonValue> = parse_plugin_package_manifests(&manifests)?;
    let mut definitions: Vec<PluginDefinition> = Vec::new();
    for (package, (manifest, parsed)) in manifests.iter().zip(&parsed_manifests).enumerate() {
        load_plugin_definitions(package, manifest, parsed, &mut definitions)?;
    }
    let package_roots: Vec<&str> = manifests
        .iter()
        .map(|manifest| manifest.package_root.as_str())
        .collect();
    let selected_definitions: Vec<usize> =
        select_plugin_definitions(&references, &package_roots, &definitions)?;
    validate_plugin_options(&tree, &references, &selected_definitions, &definitions)?;
    Ok(consume(&LoadedHeftConfiguration {
        build_folder_path: request.build_folder_path,
        rig: &rig,
        heft_json_chain: &heft_json_chain,
        tree: &tree,
        heft_json,
        references: &references,
        manifests: &manifests,
        parsed_manifests: &parsed_manifests,
        definitions: &definitions,
        selected_definitions: &selected_definitions,
    }))
}
