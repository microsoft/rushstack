use super::fallback::{fallback, ConfigResult};
use super::fs_probe::FileSystemProbeCache;
use super::node_builtins::is_node_builtin_module_name;
use super::node_path::{dirname, is_absolute, join, resolve, resolve_absolute};
use super::package_json::PackageJsonLookup;

pub fn is_definitely_valid_package_name(package_name: &str) -> bool {
    if package_name.is_empty() || package_name.len() > 214 {
        return false;
    }
    let (scope, unscoped_name) = match package_name.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, name)) => (Some(scope), name),
            None => return false,
        },
        None => (None, package_name),
    };
    let is_scope_char =
        |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_' | '.');
    let is_name_char = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.');
    if let Some(scope) = scope {
        if scope.is_empty() || !scope.chars().all(is_scope_char) || scope.chars().all(|c| c == '.')
        {
            return false;
        }
    }
    match unscoped_name.chars().next() {
        Some(first) if first.is_ascii_alphanumeric() || first == '-' => {}
        _ => return false,
    }
    unscoped_name.chars().all(is_name_char) && unscoped_name != "." && unscoped_name != ".."
}

pub fn node_modules_folders(start: &str) -> Vec<String> {
    let absolute_start: String = resolve_absolute(start);
    let mut folders: Vec<String> = Vec::with_capacity(16);
    let mut current: String = absolute_start;
    loop {
        folders.push(resolve(&current, "node_modules"));
        let parent: &str = dirname(&current);
        if parent == current {
            break;
        }
        current = parent.to_string();
    }
    folders
}

fn realpath_like_resolve(
    file_system: &mut FileSystemProbeCache,
    path: String,
) -> ConfigResult<String> {
    Ok(file_system.real_path_or_missing(&path)?.unwrap_or(path))
}

pub fn resolve_node_modules_file(
    file_system: &mut FileSystemProbeCache,
    request: &str,
    base_folder: &str,
    preserve_symlinks: bool,
) -> ConfigResult<String> {
    for node_modules_folder in node_modules_folders(base_folder) {
        let candidate: String = join(&node_modules_folder, request);
        if file_system.is_directory_like_resolve(dirname(&candidate))? {
            if file_system.is_file_like_resolve(&candidate)? {
                return if preserve_symlinks {
                    Ok(candidate)
                } else {
                    realpath_like_resolve(file_system, candidate)
                };
            }
            let mut with_extension: String = String::with_capacity(candidate.len() + 3);
            with_extension.push_str(&candidate);
            with_extension.push_str(".js");
            if file_system.is_file_like_resolve(&with_extension)?
                || file_system.is_directory_like_resolve(&candidate)?
            {
                return fallback("resolve would probe extensions or a folder");
            }
        }
    }
    fallback("a module was not found in node_modules")
}

pub fn resolve_package(
    lookup: &mut PackageJsonLookup,
    package_name: &str,
    base_folder_path: &str,
    allow_self_reference: bool,
) -> ConfigResult<String> {
    let normalized_root_path: String = lookup.file_system.real_path(base_folder_path)?;
    if allow_self_reference {
        if let Some(own_package_folder) =
            lookup.try_get_package_folder_for(&normalized_root_path)?
        {
            let (own_name, _) = lookup.load_identity_for_folder(&own_package_folder)?;
            if own_name == package_name {
                return Ok(dirname(&join(&own_package_folder, "package.json")).to_string());
            }
        }
    }
    if !is_definitely_valid_package_name(package_name) {
        return fallback("a package name might be invalid");
    }
    let mut request: String = String::with_capacity(package_name.len() + 13);
    request.push_str(package_name);
    request.push_str("/package.json");
    let package_json_path: String = resolve_node_modules_file(
        &mut lookup.file_system,
        &request,
        &normalized_root_path,
        false,
    )?;
    Ok(dirname(&package_json_path).to_string())
}

pub fn resolve_module(
    file_system: &mut FileSystemProbeCache,
    module_path: &str,
    base_folder_path: &str,
) -> ConfigResult<String> {
    if is_absolute(module_path) {
        return Ok(module_path.to_string());
    }
    let normalized_root_path: String = file_system.real_path(base_folder_path)?;
    if module_path.starts_with('.') {
        return Ok(resolve(&normalized_root_path, module_path));
    }
    let module_name: &str = module_path.split('/').next().unwrap_or(module_path);
    if is_node_builtin_module_name(module_name)
        || module_path.contains('\\')
        || module_path.contains(':')
    {
        return fallback("a module path might refer to a builtin module");
    }
    resolve_node_modules_file(file_system, module_path, &normalized_root_path, false)
}
