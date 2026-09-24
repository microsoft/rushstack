use super::companion::locate_heft_bin_next_to_executable;
use super::tests_fixture_folder::{
    heft_package_json, FixtureFolder, DELEGATE, HEFT_DEPENDENCY, LOCAL_HEFT,
    LOCAL_HEFT_PACKAGE_JSON, LOCAL_HEFT_START,
};
use super::{
    HeftImplementationSelection, NativeHeftContext, VersionSelectorBanner,
    HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY,
};

#[test]
fn local_heft_that_is_the_companion_is_served_by_this_binary() {
    let this_version = heft_package_json(HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY);
    let fixture = FixtureFolder::with_files(&[
        ("package.json", HEFT_DEPENDENCY),
        (LOCAL_HEFT_START, ""),
        (LOCAL_HEFT_PACKAGE_JSON, &this_version),
        ("src/sub/file.ts", ""),
    ]);
    assert_eq!(fixture.select(""), fixture.this_binary(LOCAL_HEFT));
    assert_eq!(fixture.select("src/sub"), fixture.this_binary(LOCAL_HEFT));
}

#[test]
fn same_version_local_heft_in_another_real_folder_is_delegated_unless_it_links_to_the_companion() {
    let this_version = heft_package_json(HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY);
    let patched_copy = FixtureFolder::with_files(&[
        ("package.json", HEFT_DEPENDENCY),
        (LOCAL_HEFT_START, ""),
        (LOCAL_HEFT_PACKAGE_JSON, &this_version),
        ("store/heft/lib-commonjs/start.js", ""),
        ("store/heft/package.json", &this_version),
    ]);
    assert_eq!(
        patched_copy.select_with_companion("", Some("store/heft")),
        DELEGATE
    );
    let linked = FixtureFolder::with_files(&[
        ("package.json", HEFT_DEPENDENCY),
        ("store/heft/lib-commonjs/start.js", ""),
        ("store/heft/package.json", &this_version),
    ]);
    std::fs::create_dir_all(linked.0.join("node_modules/@rushstack")).unwrap();
    std::os::unix::fs::symlink(linked.0.join("store/heft"), linked.0.join(LOCAL_HEFT)).unwrap();
    assert_eq!(
        linked.select_with_companion("", Some("store/heft")),
        linked.this_binary("store/heft")
    );
}

#[test]
fn companion_of_another_version_is_always_delegated_to() {
    let other_version = heft_package_json("9.9.9");
    let fixture = FixtureFolder::with_files(&[
        ("package.json", "{}"),
        ("companion/package.json", &other_version),
    ]);
    assert_eq!(
        fixture.select_with_companion("", Some("companion")),
        DELEGATE
    );
    assert_eq!(
        fixture.select_with_companion("", None),
        HeftImplementationSelection::ThisBinary(NativeHeftContext {
            version_selector_banner: VersionSelectorBanner::Silent,
            companion_heft_package_folder: None,
        })
    );
}

#[test]
fn other_local_heft_versions_layouts_and_missing_entry_points_are_delegated() {
    let other_version = heft_package_json("9.9.9");
    let this_version = heft_package_json(HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY);
    let legacy_start = "node_modules/@rushstack/heft/lib/start.js";
    for files in [
        vec![
            (LOCAL_HEFT_START, ""),
            (LOCAL_HEFT_PACKAGE_JSON, other_version.as_str()),
        ],
        vec![
            (legacy_start, ""),
            (LOCAL_HEFT_PACKAGE_JSON, this_version.as_str()),
        ],
        vec![(LOCAL_HEFT_PACKAGE_JSON, this_version.as_str())],
        vec![(LOCAL_HEFT_START, "")],
        vec![
            (LOCAL_HEFT_START, ""),
            (LOCAL_HEFT_PACKAGE_JSON, "{\"version\":\"1.3.1\",}"),
        ],
        vec![],
    ] {
        let mut fixture_files = files.clone();
        fixture_files.push(("package.json", HEFT_DEPENDENCY));
        assert_eq!(
            FixtureFolder::with_files(&fixture_files).select(""),
            DELEGATE,
            "{files:?}"
        );
    }
}

#[test]
fn companion_is_found_in_the_repository_and_the_npm_scope_layouts() {
    let fixture =
        FixtureFolder::with_files(&[("apps/heft/bin/heft", ""), ("scope/heft/bin/heft", "")]);
    let repository_binary = fixture.0.join("apps/heft-native/target/release/heft");
    let npm_binary = fixture.0.join("scope/heft-native-linux-x64/bin/heft");
    assert_eq!(
        locate_heft_bin_next_to_executable(&repository_binary),
        Some(fixture.0.join("apps/heft/bin/heft"))
    );
    assert_eq!(
        locate_heft_bin_next_to_executable(&npm_binary),
        Some(fixture.0.join("scope/heft/bin/heft"))
    );
    assert_eq!(
        locate_heft_bin_next_to_executable(&fixture.0.join("elsewhere/heft")),
        None
    );
}
