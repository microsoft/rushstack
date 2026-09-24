use std::borrow::Cow;

use super::javascript_order::order_entries_like_javascript;
use super::merge::{merge_objects, InheritanceType, MergeOptions};
use super::tree::{ConfigTree, NodeId, NodeValue, Slot};
use super::tree_json::tree_to_json_value;
use crate::json::{parse_json_with_comments_exactly_like_jju, write_json_for_javascript};

fn import_annotated<'text>(
    tree: &mut ConfigTree<'text>,
    text: &'text str,
    file: &str,
) -> Result<NodeId, &'static str> {
    let file_index: u32 = tree.add_configuration_file_path(file);
    let parsed = parse_json_with_comments_exactly_like_jju(text).unwrap();
    let root: NodeId = tree
        .import_json(parsed)
        .map_err(|fallback| fallback.reason)?;
    tree.annotate_properties(root, file_index);
    Ok(root)
}

fn merge_texts(parent_text: &str, current_text: &str) -> Result<String, &'static str> {
    let mut tree: ConfigTree = ConfigTree::default();
    let parent: NodeId = import_annotated(&mut tree, parent_text, "/parent.json")?;
    let current: NodeId = import_annotated(&mut tree, current_text, "/current.json")?;
    let options: MergeOptions = MergeOptions {
        configuration_file: 1,
        default_array_inheritance: InheritanceType::Append,
        default_object_inheritance: InheritanceType::Merge,
        ignored_property_names: &["extends", "$schema"],
    };
    let merged: NodeId = merge_objects(&mut tree, Some(parent), current, options)
        .map_err(|fallback| fallback.reason)?;
    let mut out: String = String::new();
    write_json_for_javascript(&tree_to_json_value(&tree, merged), &mut out).unwrap();
    let annotation = &tree.annotations[tree.node(merged).annotation.unwrap() as usize];
    for (key, slot) in &annotation.original_values {
        out.push_str(if *slot == Slot::Undefined { " -" } else { " +" });
        out.push_str(key);
    }
    Ok(out)
}

#[test]
fn object_keys_are_ordered_like_javascript() {
    let mut entries: Vec<(Cow<str>, u8)> =
        ["b", "10", "a", "2", "01", "4294967295", "4294967294", "-1"]
            .iter()
            .map(|key| (Cow::Borrowed(*key), 0))
            .collect();
    order_entries_like_javascript(&mut entries);
    let keys: Vec<&str> = entries.iter().map(|(key, _)| key.as_ref()).collect();
    assert_eq!(
        keys,
        ["2", "10", "4294967294", "b", "a", "01", "4294967295", "-1"]
    );
}

#[test]
fn default_inheritance_appends_arrays_and_merges_objects() {
    let merged = merge_texts(
        r#"{"list":[1],"map":{"a":1,"b":{"x":1}},"text":"p","onlyParent":true}"#,
        r#"{"list":[2],"map":{"b":{"y":2},"c":3},"text":"c","extends":"x","$schema":"s"}"#,
    );
    assert_eq!(
        merged.unwrap(),
        r#"{"list":[1,2],"map":{"a":1,"b":{"x":1,"y":2},"c":3},"text":"c","onlyParent":true} +text +onlyParent"#
    );
}

#[test]
fn inheritance_type_annotations_and_null_deletion() {
    let merged = merge_texts(
        r#"{"list":[1],"map":{"a":1},"gone":{"z":1},"keep":[0]}"#,
        r#"{"$list.inheritanceType":"REPLACE","list":[2],"$map.inheritanceType":"replace","map":{"b":2},"gone":null}"#,
    );
    assert_eq!(
        merged.unwrap(),
        r#"{"list":[2],"map":{"b":2},"keep":[0]} +list +map +gone +keep"#
    );
}

#[test]
fn original_values_of_merged_parent_properties_are_undefined() {
    let mut tree: ConfigTree = ConfigTree::default();
    let grandparent: NodeId =
        import_annotated(&mut tree, r#"{"map":{"a":1}}"#, "/grandparent.json").unwrap();
    let parent: NodeId = import_annotated(&mut tree, r#"{"map":{"b":2}}"#, "/parent.json").unwrap();
    let current: NodeId = import_annotated(&mut tree, r#"{"other":1}"#, "/current.json").unwrap();
    let options: MergeOptions = MergeOptions {
        configuration_file: 2,
        default_array_inheritance: InheritanceType::Append,
        default_object_inheritance: InheritanceType::Merge,
        ignored_property_names: &["extends", "$schema"],
    };
    let first: NodeId = merge_objects(&mut tree, Some(grandparent), parent, options).unwrap();
    let second: NodeId = merge_objects(&mut tree, Some(first), current, options).unwrap();
    assert_eq!(tree.original_value(second, "map"), Slot::Undefined);
    let annotation = &tree.annotations[tree.node(second).annotation.unwrap() as usize];
    assert_eq!(annotation.original_values.len(), 2);
    assert!(matches!(
        tree.node(tree.get(second, "map").unwrap()).value,
        NodeValue::Object(_)
    ));
}

#[test]
fn unsupported_merges_fall_back() {
    assert!(merge_texts(r#"{}"#, r#"{"$a.inheritanceType":"append"}"#).is_err());
    assert!(merge_texts(r#"{}"#, r#"{"$a.inheritanceType":"custom","a":[]}"#).is_err());
    assert!(merge_texts(r#"{}"#, r#"{"$a.inheritanceType":"merge","a":"text"}"#).is_err());
    assert!(merge_texts(r#"{"a":[1]}"#, r#"{"$a.inheritanceType":"merge","a":[2]}"#).is_err());
    assert!(merge_texts(r#"{"a":{}}"#, r#"{"$a.inheritanceType":"append","a":{}}"#).is_err());
    assert!(merge_texts(r#"{}"#, r#"{"nested":{"constructor":1}}"#).is_err());
}
