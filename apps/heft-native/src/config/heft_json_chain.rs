use super::fallback::{fallback, ConfigResult};
use super::fs_probe::{read_text_or_missing, FileSystemProbeCache};
use super::node_path::{dirname, resolve};
use super::node_resolve::resolve_module;
use super::package_json::PackageJsonLookup;
use super::rig::{resolve_rig_profile_folder, RigConfigData};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};

pub const HEFT_JSON_PROJECT_RELATIVE_PATH: &str = "config/heft.json";

pub struct ConfigurationFileText {
    pub path: String,
    pub text: String,
    pub parent: Option<usize>,
}

#[derive(Default)]
pub struct HeftJsonChain {
    pub files: Vec<ConfigurationFileText>,
    pub debug_messages: Vec<String>,
    pub configuration_file_paths: Vec<String>,
    pub entry: usize,
}

fn read_extends_property(text: &str) -> ConfigResult<Option<String>> {
    let parsed: JsonValue = match parse_json_with_comments_exactly_like_jju(text) {
        Ok(value @ JsonValue::Object(_)) => value,
        _ => return fallback("heft.json can't be parsed exactly"),
    };
    match parsed.get("extends") {
        None | Some(JsonValue::Null) | Some(JsonValue::Boolean(false)) => Ok(None),
        Some(JsonValue::Number(number)) if number.value == 0.0 => Ok(None),
        Some(JsonValue::String(extends_path)) if extends_path.is_empty() => Ok(None),
        Some(JsonValue::String(extends_path)) => Ok(Some(extends_path.to_string())),
        Some(_) => fallback("extends is not a string"),
    }
}

pub fn discover_heft_json_chain(
    lookup: &mut PackageJsonLookup,
    project_path: &str,
    rig: &RigConfigData,
) -> ConfigResult<HeftJsonChain> {
    lookup.try_get_package_folder_for(project_path)?;
    let project_file_path: String = resolve(project_path, HEFT_JSON_PROJECT_RELATIVE_PATH);
    let mut chain: HeftJsonChain = HeftJsonChain::default();
    let mut visited: Vec<String> = Vec::with_capacity(4);
    if let Some(entry) =
        chain.load_file(&mut lookup.file_system, &project_file_path, &mut visited)?
    {
        chain.entry = entry;
        return Ok(chain);
    }
    if !rig.rig_found {
        return fallback("heft.json does not exist and there is no rig");
    }
    let profile_folder: String = resolve_rig_profile_folder(&mut lookup.file_system, rig)?;
    chain.debug_messages.push(format!(
        "Configuration file \"{project_file_path}\" does not exist. Attempting to load via rig (\"{profile_folder}\")."
    ));
    let rig_file_path: String = resolve(&profile_folder, HEFT_JSON_PROJECT_RELATIVE_PATH);
    match chain.load_file(&mut lookup.file_system, &rig_file_path, &mut visited)? {
        Some(entry) => {
            chain.entry = entry;
            Ok(chain)
        }
        None => fallback("heft.json does not exist in the project or in the rig"),
    }
}

impl HeftJsonChain {
    fn load_file(
        &mut self,
        file_system: &mut FileSystemProbeCache,
        path: &str,
        visited: &mut Vec<String>,
    ) -> ConfigResult<Option<usize>> {
        if visited.iter().any(|visited_path| visited_path == path) {
            return fallback("a loop in the extends chain");
        }
        visited.push(path.to_string());
        let text: String = match read_text_or_missing(path)? {
            Some(text) => text,
            None => return Ok(None),
        };
        let extends_path: Option<String> = read_extends_property(&text)?;
        self.configuration_file_paths.push(path.to_string());
        let parent: Option<usize> = match extends_path {
            None => None,
            Some(extends_path) => {
                let parent_path: String =
                    resolve_module(file_system, &extends_path, dirname(path))?;
                match self.load_file(file_system, &parent_path, visited)? {
                    Some(parent) => Some(parent),
                    None => return fallback("a file referenced by extends does not exist"),
                }
            }
        };
        self.files.push(ConfigurationFileText {
            path: path.to_string(),
            text,
            parent,
        });
        Ok(Some(self.files.len() - 1))
    }
}
