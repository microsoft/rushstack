use super::build_info_json::{is_array_index_key, parse_build_info_json};

fn entries(text: &str) -> Option<(String, Vec<(String, String)>)> {
    parse_build_info_json(text).map(|parsed| (parsed.configuration_hash, parsed.input_file_versions))
}

fn owned(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs.iter().map(|(key, value)| ((*key).to_owned(), (*value).to_owned())).collect()
}

#[test]
fn reads_the_state_json_parse_would_read() {
    assert_eq!(
        entries(r#"{"configHash":"h","inputFileVersions":{"../a.txt":"v1","../b\u00e9.txt":"v2"}}"#),
        Some(("h".to_owned(), owned(&[("../a.txt", "v1"), ("../bé.txt", "v2")])))
    );
    assert_eq!(entries(" { \"configHash\" : \"h\" , \"inputFileVersions\" : { } } "), Some(("h".to_owned(), Vec::new())));
    assert_eq!(
        entries(r#"{"inputFileVersions":{"x":"1"},"configHash":"\"q\\"}"#),
        Some(("\"q\\".to_owned(), owned(&[("x", "1")])))
    );
}

#[test]
fn refuses_everything_outside_the_shape_heft_writes() {
    for text in [
        "",
        "{}",
        r#"{"configHash":"h"}"#,
        r#"{"configHash":1,"inputFileVersions":{}}"#,
        r#"{"configHash":"h","inputFileVersions":{"a":1}}"#,
        r#"{"configHash":"h","inputFileVersions":{"a":"1","a":"2"}}"#,
        r#"{"configHash":"h","inputFileVersions":{"7":"1"}}"#,
        r#"{"configHash":"h","inputFileVersions":{},"fileDependencies":{}}"#,
        r#"{"configHash":"h","configHash":"h","inputFileVersions":{}}"#,
        r#"{"configHash":"h","inputFileVersions":{}} x"#,
        r#"{"configHash":"h","inputFileVersions":{},}"#,
        "{\"configHash\":\"\u{1}\",\"inputFileVersions\":{}}",
        r#"{"configHash":"\ud800","inputFileVersions":{}}"#,
        "\u{feff}{\"configHash\":\"h\",\"inputFileVersions\":{}}",
    ] {
        assert!(parse_build_info_json(text).is_none(), "{text:?}");
    }
}

#[test]
fn array_index_keys_follow_ecmascript() {
    assert!(is_array_index_key("0") && is_array_index_key("42") && is_array_index_key("4294967294"));
    assert!(!is_array_index_key("") && !is_array_index_key("01") && !is_array_index_key("4294967295"));
    assert!(!is_array_index_key("-1") && !is_array_index_key("1.5") && !is_array_index_key("../1"));
}
