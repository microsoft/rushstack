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
    }
}
