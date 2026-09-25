use std::fs;
use std::os::unix::fs::symlink;
use std::path::PathBuf;

use super::real_path_resolver::RealPathResolver;

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
    let mut resolver: RealPathResolver = RealPathResolver::default();
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
        assert_eq!(
            resolver.resolve_real_path(&path).unwrap(),
            canonicalize_or_missing(&path),
            "{path}"
        );
        assert_eq!(
            resolver.resolve_real_path(&path).unwrap(),
            canonicalize_or_missing(&path),
            "{path}"
        );
    }
    assert!(resolver
        .resolve_real_path(&format!("{root}/loop-a/x"))
        .is_err());
    assert!(resolver.resolve_real_path("relative/path").is_err());
    assert_eq!(
        resolver.resolve_real_path("/").unwrap().as_deref(),
        Some("/")
    );
    let _ = fs::remove_dir_all(&root);
}
