use std::borrow::Cow;

use super::fallback::{fallback, ConfigResult};
use super::heft_json_chain::{ConfigurationFileText, HeftJsonChain};
use super::merge::{merge_objects, InheritanceType, MergeOptions};
use super::node_path::{dirname, join};
use super::node_resolve::resolve_package;
use super::package_json::PackageJsonLookup;
use super::tree::{ConfigTree, NodeId, NodeValue, Slot};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};

const HEFT_MODULE_THAT_RESOLVES_ITS_OWN_PACKAGE: &str = "CoreConfigFiles.js";

const PLUGIN_PACKAGE_JSON_PATHS: [&[&str]; 2] = [
    &["heftPlugins", "*", "pluginPackage"],
    &[
        "phasesByName",
        "*",
        "tasksByName",
        "*",
        "taskPlugin",
        "pluginPackage",
    ],
];

pub struct PluginPackageResolver<'lookup> {
    pub lookup: &'lookup mut PackageJsonLookup,
    pub heft_module_folder: &'lookup str,
    pub heft_package_folder: Option<String>,
}

impl PluginPackageResolver<'_> {
    pub fn resolve_plugin_package(
        &mut self,
        package_name: &str,
        configuration_file_path: &str,
    ) -> ConfigResult<String> {
        if package_name != "@rushstack/heft" {
            return resolve_package(
                self.lookup,
                package_name,
                dirname(configuration_file_path),
                true,
            );
        }
        if self.heft_package_folder.is_none() {
            let module_path: String = join(
                self.heft_module_folder,
                HEFT_MODULE_THAT_RESOLVES_ITS_OWN_PACKAGE,
            );
            let real_module_path: String = self.lookup.file_system.real_path(&module_path)?;
            self.heft_package_folder = self
                .lookup
                .try_get_package_folder_for(dirname(&real_module_path))?;
        }
        match &self.heft_package_folder {
            Some(folder) => Ok(folder.clone()),
            None => fallback("the @rushstack/heft package folder was not found"),
        }
    }
}

pub fn merge_heft_json_chain<'text>(
    tree: &mut ConfigTree<'text>,
    chain: &'text HeftJsonChain,
    index: usize,
    resolver: &mut PluginPackageResolver,
) -> ConfigResult<NodeId> {
    let file: &'text ConfigurationFileText = &chain.files[index];
    let parent: Option<NodeId> = match file.parent {
        Some(parent) => Some(merge_heft_json_chain(tree, chain, parent, resolver)?),
        None => None,
    };
    let configuration_file: u32 = tree.add_configuration_file_path(&file.path);
    let current: NodeId = contextualize(tree, file, configuration_file, resolver)?;
    let options: MergeOptions = MergeOptions {
        configuration_file,
        default_array_inheritance: InheritanceType::Append,
        default_object_inheritance: InheritanceType::Merge,
        ignored_property_names: &["extends", "$schema"],
    };
    let result: NodeId = merge_objects(tree, parent, current, options)?;
    let schema_original_value: Slot = tree
        .get(current, "$schema")
        .map_or(Slot::Undefined, Slot::Node);
    if let Some(annotation) = tree.node(result).annotation {
        tree.annotations[annotation as usize].schema_property_original_value =
            Some(schema_original_value);
    }
    Ok(result)
}

fn contextualize<'text>(
    tree: &mut ConfigTree<'text>,
    file: &'text ConfigurationFileText,
    configuration_file: u32,
    resolver: &mut PluginPackageResolver,
) -> ConfigResult<NodeId> {
    let parsed: JsonValue<'text> = match parse_json_with_comments_exactly_like_jju(&file.text) {
        Ok(parsed) => parsed,
        Err(_) => return fallback("heft.json can't be parsed exactly"),
    };
    let root: NodeId = tree.import_json(parsed)?;
    tree.annotate_properties(root, configuration_file);
    for json_path in PLUGIN_PACKAGE_JSON_PATHS {
        let mut matches: Vec<(NodeId, usize)> = Vec::new();
        collect_json_path_matches(tree, root, json_path, &mut matches);
        for (parent, entry_index) in matches {
            let value_node: NodeId = tree.object_entries(parent)[entry_index].1;
            let package_name: String = match tree.string_value(value_node) {
                Some(package_name) => package_name.to_string(),
                None => return fallback("a pluginPackage is not a string"),
            };
            let resolved: String = resolver.resolve_plugin_package(&package_name, &file.path)?;
            let resolved_node: NodeId =
                tree.add_node(NodeValue::String(Cow::Owned(resolved)), None);
            if let NodeValue::Object(entries) = &mut tree.nodes[parent as usize].value {
                entries[entry_index].1 = resolved_node;
            }
        }
    }
    Ok(root)
}

fn collect_json_path_matches(
    tree: &ConfigTree,
    node: NodeId,
    path: &[&str],
    matches: &mut Vec<(NodeId, usize)>,
) {
    let (segment, rest) = match path.split_first() {
        Some(split) => split,
        None => return,
    };
    if *segment != "*" {
        if let Some(index) = tree
            .object_entries(node)
            .iter()
            .position(|(key, _)| key == segment)
        {
            match rest.is_empty() {
                true => matches.push((node, index)),
                false => collect_json_path_matches(
                    tree,
                    tree.object_entries(node)[index].1,
                    rest,
                    matches,
                ),
            }
        }
        return;
    }
    let children: Vec<NodeId> = match &tree.node(node).value {
        NodeValue::Object(entries) => entries.iter().map(|(_, child)| *child).collect(),
        NodeValue::Array(items) => items.clone(),
        _ => Vec::new(),
    };
    for child in children {
        collect_json_path_matches(tree, child, rest, matches);
    }
}
