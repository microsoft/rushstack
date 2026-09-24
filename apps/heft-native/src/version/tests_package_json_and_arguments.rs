use std::ffi::OsString;
use std::path::Path;

use super::selector::find_version_selector_tool_parameters;
use super::tests_fixture_folder::{
    fixture_for_project_package_json, FixtureFolder, DELEGATE, HEFT_DEPENDENCY, LOCAL_HEFT,
    LOCAL_HEFT_START,
};
use super::HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY;

#[test]
fn package_json_without_a_truthy_heft_dependency_runs_the_invoked_heft() {
    for package_json in [
        "{}",
        "[]",
        "\"text\"",
        "5",
        "true",
        r#"{"dependencies":{"@rushstack/heft":""}}"#,
        r#"{"dependencies":{"@rushstack/heft":0}}"#,
        r#"{"dependencies":{"@rushstack/heft":-0.0}}"#,
        r#"{"dependencies":{"@rushstack/heft":false}}"#,
        r#"{"dependencies":{"@rushstack/heft":null}}"#,
        r#"{"dependencies":"@rushstack/heft"}"#,
        r#"{"dependencies":["@rushstack/heft"]}"#,
        r#"{"dependencies":{"__proto__":{"@rushstack/heft":"*"}}}"#,
        r#"{"dependencies":{"@rushstack/heft":"*"},"dependencies":{}}"#,
        r#"{"peerDependencies":{"@rushstack/heft":"*"}}"#,
    ] {
        let fixture = fixture_for_project_package_json(package_json);
        assert_eq!(
            fixture.select(""),
            fixture.this_binary(LOCAL_HEFT),
            "{package_json}"
        );
    }
}

#[test]
fn truthy_heft_dependencies_select_the_local_heft() {
    for package_json in [
        HEFT_DEPENDENCY,
        r#"{"devDependencies":{"@rushstack/heft":"workspace:*"}}"#,
        r#"{"dependencies":{"@rushstack/heft":{}}}"#,
        r#"{"dependencies":{"@rushstack/heft":[]}}"#,
        r#"{"dependencies":{"@rushstack/heft":true}}"#,
        r#"{"dependencies":{"@rushstack/heft":1e-5}}"#,
        r#"{"dependencies":{"@rushstack\/heft":"*"}}"#,
        r#"{"dependencies":{},"dependencies":{"@rushstack/heft":"*"}}"#,
    ] {
        let fixture = fixture_for_project_package_json(package_json);
        std::fs::remove_file(fixture.0.join(LOCAL_HEFT_START)).unwrap();
        assert_eq!(fixture.select(""), DELEGATE, "{package_json}");
    }
}

#[test]
fn package_json_that_json_parse_rejects_or_that_throws_is_delegated() {
    for package_json in ["{ nope", "null", "{\"a\":1,}", "// c\n{}", "\u{feff}{}", ""] {
        assert_eq!(
            fixture_for_project_package_json(package_json).select(""),
            DELEGATE,
            "{package_json:?}"
        );
    }
    let fixture = FixtureFolder::with_files(&[("package.json/placeholder", "")]);
    assert_eq!(fixture.select(""), DELEGATE);
}

#[test]
fn only_leading_dash_arguments_are_version_selector_tool_parameters() {
    let parameters = |arguments: &[&str]| {
        let arguments: Vec<OsString> = arguments.iter().map(OsString::from).collect();
        find_version_selector_tool_parameters(&arguments)
    };
    assert_eq!(parameters(&["--unmanaged", "build"]), (true, false));
    assert_eq!(parameters(&["--debug", "--unmanaged"]), (true, true));
    assert_eq!(parameters(&["--debug", "x"]), (false, true));
    assert_eq!(
        parameters(&["build", "--unmanaged", "--debug"]),
        (false, false)
    );
    assert_eq!(parameters(&["", "--debug"]), (false, false));
    assert_eq!(
        parameters(&["--unmanaged=true", "--debug-x"]),
        (false, false)
    );
}

#[test]
fn binary_version_matches_the_heft_package_it_implements() {
    let heft_package_json =
        std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../heft/package.json"))
            .unwrap();
    assert!(heft_package_json.contains(&format!(
        "\"version\": \"{HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY}\""
    )));
}
