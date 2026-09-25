use super::base64::append_standard_base64;
use super::file_selection::{AbsoluteFileSelection, FileSelectionSpecifier};
use super::javascript_json::{append_json_string, append_json_string_array};
use super::posix_path::{relative_path, resolve_path};
use super::sha256::Sha256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CopyOperationField {
    SourcePath,
    DestinationFolders,
    FileExtensions,
    ExcludeGlobs,
    IncludeGlobs,
    Flatten,
    Hardlink,
}

#[derive(Clone, Debug)]
pub struct CopyOperation {
    pub selection: FileSelectionSpecifier,
    pub destination_folders: Vec<String>,
    pub flatten: Option<bool>,
    pub hardlink: Option<bool>,
    pub field_order: Vec<CopyOperationField>,
}

pub struct AbsoluteCopyOperation {
    pub selection: AbsoluteFileSelection,
    pub destination_folder_paths: Vec<String>,
    pub flatten: bool,
    pub hardlink: bool,
}

pub fn plan_copy_operations(
    root_folder_path: &str,
    copy_operations: &[CopyOperation],
) -> Option<(Vec<AbsoluteCopyOperation>, String)> {
    let mut hasher = Sha256::new();
    let mut absolute_operations = Vec::with_capacity(copy_operations.len());
    for copy_operation in copy_operations {
        let selection = copy_operation.selection.to_absolute_selection(root_folder_path)?;
        let destination_folder_paths: Vec<String> = copy_operation
            .destination_folders
            .iter()
            .map(|folder| resolve_path(root_folder_path, folder))
            .collect();
        if destination_folder_paths.iter().any(|path| path.contains('\\')) {
            return None;
        }
        let portable_json = portable_operation_json(root_folder_path, copy_operation, &selection, &destination_folder_paths);
        hasher.update(portable_json.as_bytes());
        absolute_operations.push(AbsoluteCopyOperation {
            selection,
            destination_folder_paths,
            flatten: copy_operation.flatten.unwrap_or(false),
            hardlink: copy_operation.hardlink.unwrap_or(false),
        });
    }
    let mut configuration_hash = String::with_capacity(44);
    append_standard_base64(&hasher.finalize(), &mut configuration_hash);
    Some((absolute_operations, configuration_hash))
}

fn portable_operation_json(
    root_folder_path: &str,
    copy_operation: &CopyOperation,
    selection: &AbsoluteFileSelection,
    destination_folder_paths: &[String],
) -> String {
    let mut field_order = copy_operation.field_order.clone();
    for appended_field in [CopyOperationField::SourcePath, CopyOperationField::IncludeGlobs] {
        if !field_order.contains(&appended_field) {
            field_order.push(appended_field);
        }
    }
    let mut json = String::from("{");
    for field in field_order {
        let before_field = json.len();
        if json.len() > 1 {
            json.push(',');
        }
        match field {
            CopyOperationField::SourcePath => {
                json.push_str("\"sourcePath\":");
                append_json_string(&relative_path(root_folder_path, &selection.source_folder_path), &mut json);
            }
            CopyOperationField::DestinationFolders => {
                json.push_str("\"destinationFolders\":");
                let relative_folders: Vec<String> = destination_folder_paths
                    .iter()
                    .map(|folder| relative_path(root_folder_path, folder))
                    .collect();
                append_json_string_array(relative_folders.iter().map(String::as_str), &mut json);
            }
            CopyOperationField::FileExtensions => json.truncate(before_field),
            CopyOperationField::ExcludeGlobs => match &copy_operation.selection.exclude_globs {
                Some(exclude_globs) => {
                    json.push_str("\"excludeGlobs\":");
                    append_json_string_array(exclude_globs.iter().map(String::as_str), &mut json);
                }
                None => json.truncate(before_field),
            },
            CopyOperationField::IncludeGlobs => {
                json.push_str("\"includeGlobs\":");
                append_json_string_array(selection.include_globs.iter().map(String::as_str), &mut json);
            }
            CopyOperationField::Flatten => append_boolean_field(&mut json, "flatten", copy_operation.flatten, before_field),
            CopyOperationField::Hardlink => append_boolean_field(&mut json, "hardlink", copy_operation.hardlink, before_field),
        }
    }
    json.push('}');
    json
}

fn append_boolean_field(json: &mut String, name: &str, value: Option<bool>, before_field: usize) {
    match value {
        Some(value) => {
            json.push('"');
            json.push_str(name);
            json.push_str("\":");
            json.push_str(if value { "true" } else { "false" });
        }
        None => json.truncate(before_field),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use CopyOperationField::*;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    fn copy_operation(selection: FileSelectionSpecifier, destinations: &[&str], field_order: Vec<CopyOperationField>) -> CopyOperation {
        CopyOperation { selection, destination_folders: strings(destinations), flatten: None, hardlink: None, field_order }
    }

    #[test]
    fn configuration_hashes_match_heft_for_the_same_options() {
        let extensions = FileSelectionSpecifier {
            source_path: Some("src".into()),
            file_extensions: Some(strings(&[".txt", ".json"])),
            ..Default::default()
        };
        let operation = copy_operation(extensions, &["lib"], vec![SourcePath, DestinationFolders, FileExtensions]);
        let (_, hash) = plan_copy_operations("/p", &[operation]).unwrap();
        assert_eq!(hash, "Gq3fRWEm4dEAs+3oVto6GIrpNKnSLQ/XBYVSpRegiZo=");
        let everything = FileSelectionSpecifier { source_path: Some("src/a".into()), include_globs: Some(strings(&["**/*"])), ..Default::default() };
        let operation = copy_operation(everything, &["lib-a"], vec![SourcePath, DestinationFolders, IncludeGlobs]);
        assert_eq!(plan_copy_operations("/p", &[operation]).unwrap().1, "9+DnO5MwqlLC5GeUyIJuG6xrulClDZhgS+BkuxHPFKA=");
    }

    #[test]
    fn configuration_hash_follows_key_order_and_appends_computed_keys() {
        let first_selection = FileSelectionSpecifier { source_path: Some(".".into()), include_globs: Some(strings(&["a.txt", "**/*"])), ..Default::default() };
        let mut first = copy_operation(first_selection, &["out"], vec![DestinationFolders, SourcePath, Flatten, Hardlink, IncludeGlobs]);
        first.flatten = Some(true);
        first.hardlink = Some(false);
        let second_selection = FileSelectionSpecifier {
            source_path: Some("src".into()),
            exclude_globs: Some(Vec::new()),
            include_globs: Some(strings(&["**/*.md"])),
            ..Default::default()
        };
        let second = copy_operation(second_selection, &["x", "../y"], vec![SourcePath, DestinationFolders, ExcludeGlobs, IncludeGlobs]);
        let (operations, hash) = plan_copy_operations("/p", &[first, second]).unwrap();
        assert_eq!(hash, "8UB3GDscKljuhypd+V2Z1Vswt+/+JjoZWSnXRJFyqdM=");
        assert_eq!(operations[1].destination_folder_paths, strings(&["/p/x", "/y"]));
        assert!(operations[0].flatten && !operations[0].hardlink);
    }
}
