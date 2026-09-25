use super::cursor::JsonTextNeedsJavaScriptParser;
use super::{
    parse_json_exactly_like_json_parse, parse_json_with_comments_exactly_like_jju, JsonValue,
};

fn parses(text: &str) -> bool {
    parse_json_with_comments_exactly_like_jju(text).is_ok()
}

fn refuses(text: &str) -> bool {
    parse_json_with_comments_exactly_like_jju(text) == Err(JsonTextNeedsJavaScriptParser)
}

#[test]
fn accepts_strict_json_comments_and_single_trailing_commas() {
    assert!(parses(
        "{\"a\": [1, 2, 3], \"b\": {\"c\": null, \"d\": true, \"e\": false}}"
    ));
    assert!(parses("// leading\n{ /* inner */ \"a\": 1 }"));
    assert!(parses("[1, 2,]"));
    assert!(parses("{\"a\": 1,}"));
    assert!(parses("  \t\r\n \"text\" \n"));
    assert!(parses("-0.5e+10"));
}

#[test]
fn refuses_everything_that_only_jju_json5_mode_would_accept_or_reject() {
    for text in [
        "\u{feff}{}",
        "{'a': 1}",
        "{a: 1}",
        "[1,,2]",
        "[,]",
        "{,}",
        "0x10",
        "+1",
        ".5",
        "5.",
        "01",
        "Infinity",
        "NaN",
        "\"\\v\"",
        "\"\\x41\"",
        "\"\\0\"",
        "\"line\\\ncontinuation\"",
        "\"tab\there\"",
        "\"\u{2028}\"",
        "// comment \u{2029} end\n1",
        "\"\\ud83d\"",
        "\"\\udc00\"",
        "nullx",
        "truee",
        "1 2",
        "/* unterminated",
        "",
        "   ",
        "\u{a0}1",
    ] {
        assert!(refuses(text), "expected a refusal for {:?}", text);
    }
}

#[test]
fn refuses_nesting_deeper_than_the_supported_depth() {
    let deep_but_supported = format!("{}{}", "[".repeat(512), "]".repeat(512));
    assert!(parses(&deep_but_supported));
    let too_deep = format!("{}{}", "[".repeat(513), "]".repeat(513));
    assert!(refuses(&too_deep));
}

#[test]
fn duplicate_keys_keep_the_first_position_and_take_the_last_value() {
    let value =
        parse_json_with_comments_exactly_like_jju("{\"a\": 1, \"b\": 2, \"a\": 3}").unwrap();
    let object = value.as_object().unwrap();
    assert_eq!(object.len(), 2);
    assert_eq!(object.entries()[0].0, "a");
    assert_eq!(object.get("a").and_then(JsonValue::as_f64), Some(3.0));
}

#[test]
fn decodes_escapes_and_surrogate_pairs_like_javascript() {
    let value =
        parse_json_with_comments_exactly_like_jju("\"\\u0041\\ud83d\\ude00\\n\\/\\\"\"").unwrap();
    assert_eq!(value.as_str(), Some("A\u{1F600}\n/\""));
}

#[test]
fn numbers_keep_their_source_text_and_javascript_values() {
    let value =
        parse_json_with_comments_exactly_like_jju("[1e400, -0, 9007199254740993, 5e-324]").unwrap();
    let items = value.as_array().unwrap();
    match (&items[0], &items[1], &items[2], &items[3]) {
        (
            JsonValue::Number(huge),
            JsonValue::Number(negative_zero),
            JsonValue::Number(rounded),
            JsonValue::Number(tiny),
        ) => {
            assert!(huge.value.is_infinite());
            assert_eq!(huge.source_text, "1e400");
            assert!(negative_zero.value == 0.0 && negative_zero.value.is_sign_negative());
            assert_eq!(rounded.value, 9007199254740992.0);
            assert_eq!(tiny.value, 5e-324);
        }
        _ => panic!("expected four numbers"),
    }
}

#[test]
fn strict_variant_accepts_only_what_json_parse_accepts_with_identical_values() {
    assert_eq!(
        parse_json_exactly_like_json_parse(
            "{\"name\": \"@rushstack/heft\", \"dependencies\": {}, \"list\": [1, 2]}"
        )
        .ok(),
        parse_json_with_comments_exactly_like_jju(
            "{\"name\": \"@rushstack/heft\", \"dependencies\": {}, \"list\": [1, 2]}"
        )
        .ok()
    );
    assert!(parse_json_exactly_like_json_parse("[]").is_ok());
    assert!(parse_json_exactly_like_json_parse("{}").is_ok());
    for text in [
        "{\"a\": 1,}",
        "[1,]",
        "// comment\n{}",
        "{} /* trailing */",
        "{\"a\": /* inner */ 1}",
    ] {
        assert_eq!(
            parse_json_exactly_like_json_parse(text),
            Err(JsonTextNeedsJavaScriptParser),
            "expected {:?} to be refused",
            text
        );
        assert!(parses(text), "the jju variant should accept {:?}", text);
    }
}
