use std::path::Path;

use crate::json::{parse_json_exactly_like_json_parse, JsonValue};

const HEFT_PACKAGE_NAME: &str = "@rushstack/heft";

#[derive(Debug, PartialEq, Eq)]
pub enum ProjectPackageJsonProbe {
    MustBeProbedByJavaScript,
    DeclaresNoHeftDependency,
    DeclaresHeftDependency,
}

pub fn probe_project_package_json(package_json_path: &Path) -> ProjectPackageJsonProbe {
    let Ok(package_json_text) = std::fs::read_to_string(package_json_path) else {
        return ProjectPackageJsonProbe::MustBeProbedByJavaScript;
    };
    match parse_json_exactly_like_json_parse(&package_json_text) {
        Ok(JsonValue::Object(package_json)) => {
            if dependency_map_declares_heft(package_json.get("dependencies"))
                || dependency_map_declares_heft(package_json.get("devDependencies"))
            {
                ProjectPackageJsonProbe::DeclaresHeftDependency
            } else {
                ProjectPackageJsonProbe::DeclaresNoHeftDependency
            }
        }
        Ok(JsonValue::Null) | Err(_) => ProjectPackageJsonProbe::MustBeProbedByJavaScript,
        Ok(_) => ProjectPackageJsonProbe::DeclaresNoHeftDependency,
    }
}

pub fn package_json_declares_version(package_json_path: &Path, expected_version: &str) -> bool {
    let Ok(package_json_text) = std::fs::read_to_string(package_json_path) else {
        return false;
    };
    match parse_json_exactly_like_json_parse(&package_json_text) {
        Ok(package_json) => {
            package_json.get("version").and_then(JsonValue::as_str) == Some(expected_version)
        }
        Err(_) => false,
    }
}

fn dependency_map_declares_heft(dependency_map: Option<&JsonValue>) -> bool {
    match dependency_map {
        Some(JsonValue::Object(dependencies)) => dependencies
            .get(HEFT_PACKAGE_NAME)
            .is_some_and(is_truthy_in_javascript),
        _ => false,
    }
}

fn is_truthy_in_javascript(value: &JsonValue) -> bool {
    match value {
        JsonValue::Null => false,
        JsonValue::Boolean(flag) => *flag,
        JsonValue::Number(number) => number.value != 0.0 && !number.value.is_nan(),
        JsonValue::String(text) => !text.is_empty(),
        JsonValue::Array(_) | JsonValue::Object(_) => true,
    }
}
