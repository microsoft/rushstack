pub fn resolve_path(base_folder: &str, path: &str) -> String {
    if path.starts_with('/') {
        normalize_absolute_path(path)
    } else if path.is_empty() {
        normalize_absolute_path(base_folder)
    } else {
        normalize_absolute_path(&format!("{base_folder}/{path}"))
    }
}

pub fn normalize_absolute_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }
    let mut normalized = String::with_capacity(path.len() + 1);
    for segment in &segments {
        normalized.push('/');
        normalized.push_str(segment);
    }
    if normalized.is_empty() {
        normalized.push('/');
    }
    normalized
}

pub fn is_normalized_absolute_folder_path(path: &str) -> bool {
    path.strip_prefix('/').is_some_and(|rest| rest.split('/').all(|segment| !matches!(segment, "" | "." | "..")))
}

pub fn resolve_relative_path_against_normalized_folder(normalized_folder_path: &str, relative_path: &str) -> Option<String> {
    let mut folder_path = normalized_folder_path;
    let mut remaining_path = relative_path;
    while let Some(rest) = remaining_path.strip_prefix("../") {
        folder_path = &folder_path[..folder_path.rfind('/').filter(|separator_index| *separator_index > 0)?];
        remaining_path = rest;
    }
    if remaining_path.split('/').any(|segment| matches!(segment, "" | "." | "..")) {
        return None;
    }
    let mut resolved_path = String::with_capacity(folder_path.len() + 1 + remaining_path.len());
    resolved_path.push_str(folder_path);
    resolved_path.push('/');
    resolved_path.push_str(remaining_path);
    Some(resolved_path)
}

pub fn relative_path(from_folder: &str, to_path: &str) -> String {
    let from_segments: Vec<&str> = from_folder.split('/').filter(|s| !s.is_empty()).collect();
    let to_segments: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    let common_length = from_segments
        .iter()
        .zip(to_segments.iter())
        .take_while(|(from_segment, to_segment)| from_segment == to_segment)
        .count();
    let mut relative = String::new();
    for _ in common_length..from_segments.len() {
        if !relative.is_empty() {
            relative.push('/');
        }
        relative.push_str("..");
    }
    for segment in &to_segments[common_length..] {
        if !relative.is_empty() {
            relative.push('/');
        }
        relative.push_str(segment);
    }
    relative
}

pub fn base_name(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        Some(separator_index) => &trimmed[separator_index + 1..],
        None => trimmed,
    }
}

pub fn path_contains(outer_path: &str, inner_path: &str) -> bool {
    outer_path == "/"
        || inner_path == outer_path
        || (inner_path.starts_with(outer_path) && inner_path.as_bytes().get(outer_path.len()) == Some(&b'/'))
}

pub fn directory_name(path: &str) -> &str {
    match path.rfind('/') {
        Some(0) => "/",
        Some(separator_index) => &path[..separator_index],
        None => ".",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_relative_path_fast_path_agrees_with_resolve_path() {
        let folders = ["/p/temp/build/copy-assets", "/p", "/a/b", "/p/x y/z"];
        let relatives = [
            "../../../src/a.txt", "src/a.txt", "a", "../a", "../../a", "../../../../../../a", "./a", "a/./b", "a//b", "a/",
            "..", "../", "a/../b", "../..", "", ".", "../src/../a", "d000/file-000.txt",
        ];
        for folder in folders {
            assert!(is_normalized_absolute_folder_path(folder));
            for relative in relatives {
                if let Some(resolved) = resolve_relative_path_against_normalized_folder(folder, relative) {
                    assert_eq!(resolved, resolve_path(folder, relative), "{folder} + {relative}");
                }
            }
        }
        assert_eq!(resolve_relative_path_against_normalized_folder("/p/t/b", "../../s/a.txt").as_deref(), Some("/p/s/a.txt"));
        for not_normalized in ["/", "p", "/p/", "/p//q", "/p/./q", "/p/../q", ""] {
            assert!(!is_normalized_absolute_folder_path(not_normalized), "{not_normalized}");
        }
    }

    #[test]
    fn paths_resolve_and_relativize_like_node_posix_path() {
        assert_eq!(resolve_path("/p", "src"), "/p/src");
        assert_eq!(resolve_path("/p", "./a//b/../c/"), "/p/a/c");
        assert_eq!(resolve_path("/p", "/abs/x"), "/abs/x");
        assert_eq!(resolve_path("/p", "../../.."), "/");
        assert_eq!(resolve_path("/p/q", ""), "/p/q");
        assert_eq!(relative_path("/p", "/p"), "");
        assert_eq!(relative_path("/p", "/p/lib/a"), "lib/a");
        assert_eq!(relative_path("/p/temp/build/copy", "/p/src/x.txt"), "../../../src/x.txt");
        assert_eq!(relative_path("/foo/bar", "/foo/barbaz"), "../barbaz");
        assert_eq!(relative_path("/", "/foo"), "foo");
        assert_eq!(relative_path("/foo/bar", "/"), "../..");
        assert_eq!(base_name("/p/src/x.txt"), "x.txt");
        assert_eq!(directory_name("/p/temp/file-copy.json"), "/p/temp");
        assert!(path_contains("/p/lib", "/p/lib") && path_contains("/p/lib", "/p/lib/a") && path_contains("/", "/p"));
        assert!(!path_contains("/p/lib", "/p/lib2") && !path_contains("/p/lib/a", "/p/lib"));
    }
}
