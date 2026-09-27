use std::fs;
use std::os::unix::fs::symlink;
use std::path::PathBuf;

use super::path_component_cache::PathComponentCache;
use super::path_probes::EntryKind;

fn canonicalize_or_missing(path: &str) -> Option<String> {
    fs::canonicalize(path)
        .ok()
        .map(|real_path| real_path.to_str().unwrap().to_string())
}

#[test]
fn real_paths_match_the_operating_system_realpath() {
    let root: PathBuf =
        std::env::temp_dir().join(format!("heft-native-real-path-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("store/pkg/lib")).unwrap();
    fs::write(root.join("store/pkg/package.json"), "{}").unwrap();
    fs::create_dir_all(root.join("project/node_modules/@scope")).unwrap();
    symlink(
        "../../../store/pkg",
        root.join("project/node_modules/@scope/pkg"),
    )
    .unwrap();
    symlink(
        root.join("project/node_modules"),
        root.join("absolute-link"),
    )
    .unwrap();
    symlink("absolute-link/@scope/pkg/lib/..", root.join("chained-link")).unwrap();
    symlink("loop-b", root.join("loop-a")).unwrap();
    symlink("loop-a", root.join("loop-b")).unwrap();
    let root: String = fs::canonicalize(&root)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let mut resolver: PathComponentCache = PathComponentCache::default();
    for relative_path in [
        "project/node_modules/@scope/pkg/package.json",
        "project/node_modules/@scope/pkg",
        "absolute-link/@scope/pkg/package.json",
        "chained-link/package.json",
        "chained-link/lib/../package.json",
        "project/node_modules/@scope/pkg/missing.json",
        "project/node_modules/@scope/pkg/package.json/child",
        "store/./pkg/../pkg/lib",
        "",
    ] {
        let path: String = format!("{root}/{relative_path}");
        for _ in 0..2 {
            let resolved = resolver.resolve(&path).unwrap();
            let real_path = resolved.as_ref().map(|entry| entry.real_path.clone());
            assert_eq!(real_path, canonicalize_or_missing(&path), "{path}");
            if let (Some(entry), Ok(metadata)) = (&resolved, fs::metadata(&path)) {
                let expected_kind = if metadata.is_dir() {
                    EntryKind::Directory
                } else {
                    EntryKind::File
                };
                assert_eq!(entry.kind, expected_kind, "{path}");
                if metadata.is_file() {
                    assert_eq!(entry.size, metadata.len(), "{path}");
                }
            }
        }
    }
    assert!(resolver.resolve(&format!("{root}/loop-a/x")).is_err());
    assert!(resolver.resolve("relative/path").is_err());
    let root_entry = resolver.resolve("/").unwrap().map(|entry| entry.real_path);
    assert_eq!(root_entry.as_deref(), Some("/"));
    let _ = fs::remove_dir_all(&root);
}
