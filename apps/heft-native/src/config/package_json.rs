use std::collections::HashMap;

use super::fallback::{fallback, ConfigResult};
use super::fs_probe::{read_text_or_missing, FileSystemProbeCache};
use super::node_path::{dirname, join, resolve_absolute};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};

#[derive(Clone)]
pub struct PackageJsonIdentity {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Default)]
pub struct PackageJsonLookup {
    package_folder_by_path: HashMap<String, Option<String>>,
    identity_by_real_path: HashMap<String, PackageJsonIdentity>,
    pub file_system: FileSystemProbeCache,
}

fn optional_string_field(value: &JsonValue, key: &str) -> ConfigResult<Option<String>> {
    match value.get(key) {
        None | Some(JsonValue::Null) | Some(JsonValue::Boolean(false)) => Ok(None),
        Some(JsonValue::String(text)) if text.is_empty() => Ok(None),
        Some(JsonValue::String(text)) => Ok(Some(text.to_string())),
        Some(JsonValue::Number(number)) if number.value == 0.0 => Ok(None),
        Some(_) => fallback("a package.json identity field is not a string"),
    }
}

impl PackageJsonLookup {
    fn try_load_identity(
        &mut self,
        package_json_path: &str,
    ) -> ConfigResult<Option<PackageJsonIdentity>> {
        let real_path: String = match self.file_system.real_path_or_missing(package_json_path)? {
            Some(real_path) => real_path,
            None => return Ok(None),
        };
        if let Some(identity) = self.identity_by_real_path.get(&real_path) {
            return Ok(Some(identity.clone()));
        }
        let text: String = match read_text_or_missing(&real_path)? {
            Some(text) => text,
            None => return fallback("a package.json disappeared while it was read"),
        };
        let parsed: JsonValue = match parse_json_with_comments_exactly_like_jju(&text) {
            Ok(value @ JsonValue::Object(_)) => value,
            _ => return fallback("a package.json can't be parsed exactly"),
        };
        let identity: PackageJsonIdentity = PackageJsonIdentity {
            name: optional_string_field(&parsed, "name")?,
            version: optional_string_field(&parsed, "version")?,
        };
        self.identity_by_real_path
            .insert(real_path, identity.clone());
        Ok(Some(identity))
    }

    pub fn try_get_package_folder_for(
        &mut self,
        file_or_folder_path: &str,
    ) -> ConfigResult<Option<String>> {
        let resolved_path: String = resolve_absolute(file_or_folder_path);
        if let Some(cached) = self.package_folder_by_path.get(&resolved_path) {
            return Ok(cached.clone());
        }
        let mut package_json_path: String = String::with_capacity(resolved_path.len() + 13);
        package_json_path.push_str(&resolved_path);
        package_json_path.push_str("/package.json");
        let identity: Option<PackageJsonIdentity> = self.try_load_identity(&package_json_path)?;
        let result: Option<String> = if identity.is_some_and(|identity| identity.name.is_some()) {
            Some(resolved_path.clone())
        } else {
            let parent_folder: &str = dirname(&resolved_path);
            if parent_folder.is_empty() || parent_folder == resolved_path {
                None
            } else {
                let parent_folder: String = parent_folder.to_string();
                self.try_get_package_folder_for(&parent_folder)?
            }
        };
        self.package_folder_by_path
            .insert(resolved_path, result.clone());
        Ok(result)
    }

    pub fn load_identity_for_folder(
        &mut self,
        package_folder: &str,
    ) -> ConfigResult<(String, String)> {
        let package_json_path: String = join(package_folder, "package.json");
        match self.try_load_identity(&package_json_path)? {
            Some(PackageJsonIdentity {
                name: Some(name),
                version: Some(version),
            }) => Ok((name, version)),
            _ => fallback("a package.json is missing its name or version"),
        }
    }
}
