use crate::builtin::{BuiltinTaskOptions, CopyOperation, CopyOperationField, FileSelectionSpecifier};
use crate::json::{JsonObject, JsonValue};

pub const HEFT_PACKAGE_NAME: &str = "@rushstack/heft";

pub fn builtin_task_options_from_json(plugin_name: &str, options: Option<&JsonValue<'_>>) -> Option<BuiltinTaskOptions> {
    let options = options?.as_object()?;
    let (option_name, option_value) = single_entry(options)?;
    match (plugin_name, option_name) {
        ("copy-files-plugin", "copyOperations") => option_value
            .as_array()?
            .iter()
            .map(copy_operation_from_json)
            .collect::<Option<Vec<_>>>()
            .map(BuiltinTaskOptions::CopyFiles),
        ("delete-files-plugin", "deleteOperations") => option_value
            .as_array()?
            .iter()
            .map(|operation| file_selection_from_json(operation.as_object()?, false))
            .collect::<Option<Vec<_>>>()
            .map(BuiltinTaskOptions::DeleteFiles),
        ("set-environment-variables-plugin", "environmentVariablesToSet") => option_value
            .as_object()?
            .entries()
            .iter()
            .map(|(name, value)| Some((name.to_string(), value.as_str()?.to_owned())))
            .collect::<Option<Vec<_>>>()
            .map(BuiltinTaskOptions::SetEnvironmentVariables),
        _ => None,
    }
}

fn single_entry<'object, 'text>(object: &'object JsonObject<'text>) -> Option<(&'object str, &'object JsonValue<'text>)> {
    match object.entries() {
        [(name, value)] => Some((name.as_ref(), value)),
        _ => None,
    }
}

fn copy_operation_from_json(operation: &JsonValue<'_>) -> Option<CopyOperation> {
    let operation = operation.as_object()?;
    let selection = file_selection_from_json(operation, true)?;
    let mut destination_folders = None;
    let mut flatten = None;
    let mut hardlink = None;
    let mut field_order = Vec::with_capacity(operation.len());
    for (name, value) in operation.entries() {
        let field = match name.as_ref() {
            "sourcePath" => CopyOperationField::SourcePath,
            "fileExtensions" => CopyOperationField::FileExtensions,
            "excludeGlobs" => CopyOperationField::ExcludeGlobs,
            "includeGlobs" => CopyOperationField::IncludeGlobs,
            "destinationFolders" => {
                destination_folders = Some(string_array(value)?);
                CopyOperationField::DestinationFolders
            }
            "flatten" => {
                flatten = Some(value.as_bool()?);
                CopyOperationField::Flatten
            }
            "hardlink" => {
                hardlink = Some(value.as_bool()?);
                CopyOperationField::Hardlink
            }
            _ => return None,
        };
        field_order.push(field);
    }
    Some(CopyOperation {
        selection,
        destination_folders: destination_folders?,
        flatten,
        hardlink,
        field_order,
    })
}

pub fn file_selection_from_json(operation: &JsonObject<'_>, allows_copy_fields: bool) -> Option<FileSelectionSpecifier> {
    let mut selection = FileSelectionSpecifier::default();
    for (name, value) in operation.entries() {
        match name.as_ref() {
            "sourcePath" => selection.source_path = Some(value.as_str()?.to_owned()),
            "fileExtensions" => selection.file_extensions = Some(string_array(value)?),
            "excludeGlobs" => selection.exclude_globs = Some(string_array(value)?),
            "includeGlobs" => selection.include_globs = Some(string_array(value)?),
            "destinationFolders" | "flatten" | "hardlink" if allows_copy_fields => {}
            _ => return None,
        }
    }
    Some(selection)
}

fn string_array(value: &JsonValue<'_>) -> Option<Vec<String>> {
    value.as_array()?.iter().map(|item| item.as_str().map(str::to_owned)).collect()
}
