use super::fallback::{fallback, ConfigResult};
use super::fs_probe::{exists_like_exists_sync, read_text_or_missing, FileSystemProbeCache};
use super::node_path::{dirname, join, resolve_absolute};
use super::node_resolve::resolve_node_modules_file;
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonObject, JsonValue};

#[derive(Clone, Debug, PartialEq)]
pub struct RigConfigData {
    pub project_folder_original_path: String,
    pub project_folder_path: String,
    pub rig_found: bool,
    pub file_path: String,
    pub rig_package_name: String,
    pub rig_profile: String,
    pub relative_profile_folder_path: String,
}

fn is_rig_package_name(name: &str) -> bool {
    let is_name_char = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.');
    let unscoped_name: &str = match name.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, unscoped)) if !scope.is_empty() && scope.chars().all(is_name_char) => {
                unscoped
            }
            _ => return false,
        },
        None => name,
    };
    !unscoped_name.is_empty()
        && unscoped_name.chars().all(is_name_char)
        && (name.ends_with("-rig") || name.ends_with("-rig-test"))
}

fn is_rig_profile_name(profile: &str) -> bool {
    let is_word_char =
        |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '.');
    !profile.is_empty()
        && profile
            .split('-')
            .all(|word| !word.is_empty() && word.chars().all(is_word_char))
}

pub fn load_rig_config_data(project_folder_path: &str) -> ConfigResult<RigConfigData> {
    let rig_config_file_path: String = join(project_folder_path, "config/rig.json");
    let not_found: RigConfigData = RigConfigData {
        project_folder_original_path: project_folder_path.to_string(),
        project_folder_path: resolve_absolute(project_folder_path),
        rig_found: false,
        file_path: String::new(),
        rig_package_name: String::new(),
        rig_profile: String::new(),
        relative_profile_folder_path: String::new(),
    };
    let text: String = match read_text_or_missing(&rig_config_file_path)? {
        Some(text) => text,
        None => return Ok(not_found),
    };
    let object: JsonObject = match parse_json_with_comments_exactly_like_jju(&text) {
        Ok(JsonValue::Object(object)) => object,
        _ => return fallback("rig.json can't be parsed exactly"),
    };
    let mut rig_package_name: Option<&str> = None;
    let mut rig_profile: Option<&str> = None;
    for (key, value) in object.entries() {
        match (key.as_ref(), value) {
            ("$schema", _) => {}
            ("rigPackageName", JsonValue::String(name)) => rig_package_name = Some(name),
            ("rigProfile", JsonValue::String(profile)) => rig_profile = Some(profile),
            _ => return fallback("rig.json has a field that RigConfig might treat differently"),
        }
    }
    let rig_package_name: &str = match rig_package_name {
        Some(name) if is_rig_package_name(name) => name,
        _ => return fallback("rig.json has an invalid rigPackageName"),
    };
    let rig_profile: &str = match rig_profile {
        None => "default",
        Some(profile) if is_rig_profile_name(profile) => profile,
        Some(_) => return fallback("rig.json has an invalid rigProfile"),
    };
    let mut relative_profile_folder_path: String = String::with_capacity(9 + rig_profile.len());
    relative_profile_folder_path.push_str("profiles/");
    relative_profile_folder_path.push_str(rig_profile);
    Ok(RigConfigData {
        rig_found: true,
        file_path: rig_config_file_path,
        rig_package_name: rig_package_name.to_string(),
        rig_profile: rig_profile.to_string(),
        relative_profile_folder_path,
        ..not_found
    })
}

pub fn resolve_rig_profile_folder(
    file_system: &mut FileSystemProbeCache,
    rig: &RigConfigData,
) -> ConfigResult<String> {
    if !rig.rig_found {
        return fallback("there is no rig");
    }
    let mut request: String = String::with_capacity(rig.rig_package_name.len() + 13);
    request.push_str(&rig.rig_package_name);
    request.push_str("/package.json");
    let rig_package_json_path: String =
        resolve_node_modules_file(file_system, &request, &rig.project_folder_path, true)?;
    let profile_folder: String = join(
        dirname(&rig_package_json_path),
        &rig.relative_profile_folder_path,
    );
    if !exists_like_exists_sync(&profile_folder) {
        return fallback("the rig profile folder does not exist");
    }
    Ok(profile_folder)
}
