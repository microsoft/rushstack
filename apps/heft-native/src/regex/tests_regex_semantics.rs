use super::compile_unicode_regex_subset;

fn matches(pattern: &str, text: &str) -> bool {
    compile_unicode_regex_subset(pattern)
        .unwrap_or_else(|| panic!("pattern {:?} should be supported", pattern))
        .matches_anywhere(text)
}

#[test]
fn heft_schema_patterns_behave_like_ecmascript_unicode_regexps() {
    let package_name_without_backslash = "[^\\\\]";
    assert!(matches(package_name_without_backslash, "@rushstack/heft"));
    assert!(!matches(package_name_without_backslash, "\\"));
    let kebab_case_name = "^[a-z][a-z0-9]*([-][a-z0-9]+)*$";
    assert!(matches(kebab_case_name, "copy-json-schemas"));
    assert!(!matches(kebab_case_name, "Copy"));
    assert!(!matches(kebab_case_name, "a--b"));
    let file_extension = "^\\.[A-z0-9-_.]*[A-z0-9-_]+$";
    assert!(matches(file_extension, ".schema.json"));
    assert!(matches(file_extension, ".d_ts"));
    assert!(!matches(file_extension, ".json."));
    let long_parameter_name = "^-(-[a-z0-9]+)+$";
    assert!(matches(long_parameter_name, "--lint-fix"));
    assert!(!matches(long_parameter_name, "-x"));
}

#[test]
fn dot_matches_code_points_but_not_line_terminators() {
    assert!(matches("^.$", "\u{1F600}"));
    assert!(matches("^\u{1F600}+$", "\u{1F600}\u{1F600}"));
    assert!(!matches("^.$", "\n"));
    assert!(!matches("^.$", "\u{2028}"));
    assert!(matches("^[^]$", "\n"));
    assert!(!matches("^[]$", "a"));
}

#[test]
fn quantifiers_alternation_and_classes() {
    assert!(matches("^(ab|cd){2,3}$", "abcdab"));
    assert!(!matches("^(ab|cd){2,3}$", "ab"));
    assert!(matches("^a*?b+?c??$", "aabb"));
    assert!(matches("\\s", "x\u{3000}y"));
    assert!(matches("^\\w+$", "abc_123"));
    assert!(!matches("^\\w+$", "é"));
    assert!(matches("^\\D\\W\\S$", "a-b"));
}

#[test]
fn refuses_syntax_outside_the_supported_subset_or_invalid_in_unicode_mode() {
    for pattern in [
        "(?=a)",
        "(?!a)",
        "(?<name>a)",
        "\\1",
        "\\b",
        "\\B",
        "\\p{L}",
        "\\u0041",
        "\\x41",
        "\\0",
        "\\Z",
        "a\\Z",
        "[\\w-_]",
        "[z-a]",
        "a{2,1}",
        "a{101}",
        "*",
        "a**",
        "{",
        "a{",
        "a{1,x}",
        "}",
        "]",
        "(",
        ")",
        "\\-",
        "[\\D]",
        "^*",
    ] {
        assert!(
            compile_unicode_regex_subset(pattern).is_none(),
            "expected {:?} to be refused",
            pattern
        );
    }
}

#[test]
fn non_unicode_matching_is_only_answered_for_basic_multilingual_plane_text() {
    let regex = compile_unicode_regex_subset("^x-").unwrap();
    assert_eq!(
        regex.matches_anywhere_without_unicode_flag("x-y"),
        Some(true)
    );
    assert_eq!(
        regex.matches_anywhere_without_unicode_flag("y"),
        Some(false)
    );
    assert_eq!(
        regex.matches_anywhere_without_unicode_flag("x-\u{1F600}"),
        None
    );
    let astral_pattern = compile_unicode_regex_subset("\u{1F600}").unwrap();
    assert_eq!(
        astral_pattern.matches_anywhere_without_unicode_flag("a"),
        None
    );
    assert!(compile_unicode_regex_subset("[\u{1F600}-\u{1F602}]").is_none());
}
