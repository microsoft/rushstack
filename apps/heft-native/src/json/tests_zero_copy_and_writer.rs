use std::borrow::Cow;

use super::{parse_json_with_comments_exactly_like_jju, write_json_for_javascript, JsonValue};

fn every_string_is_borrowed(value: &JsonValue<'_>) -> bool {
    match value {
        JsonValue::String(text) => matches!(text, Cow::Borrowed(_)),
        JsonValue::Array(items) => items.iter().all(every_string_is_borrowed),
        JsonValue::Object(object) => object
            .entries()
            .iter()
            .all(|(key, item)| matches!(key, Cow::Borrowed(_)) && every_string_is_borrowed(item)),
        _ => true,
    }
}

#[test]
fn strings_and_keys_without_escapes_borrow_from_the_input_buffer() {
    let text = "{\"phasesByName\": {\"build\": {\"tasksByName\": {\"typescript\": {\"taskPlugin\": {\"pluginPackage\": \"@rushstack/heft-typescript-plugin\"}}}}}}";
    let value = parse_json_with_comments_exactly_like_jju(text).unwrap();
    assert!(every_string_is_borrowed(&value));
}

#[test]
fn strings_with_escapes_are_owned() {
    let value = parse_json_with_comments_exactly_like_jju("{\"a\\u0062\": \"c\\\\d\"}").unwrap();
    let (key, item) = &value.as_object().unwrap().entries()[0];
    assert!(matches!(key, Cow::Owned(_)));
    assert_eq!(key, "ab");
    assert!(matches!(item, JsonValue::String(Cow::Owned(_))));
    assert_eq!(item.as_str(), Some("c\\d"));
}

#[test]
fn writer_output_round_trips_and_escapes_like_json_stringify() {
    let text = "{\"a\": [1, -0, 1e400, 2.50], \"b\": \"q\\\"uote\\\\ \\u0001 \\u2028 \u{1F600}\", \"c\": {}, \"d\": null}";
    let value = parse_json_with_comments_exactly_like_jju(text).unwrap();
    let mut output = String::new();
    write_json_for_javascript(&value, &mut output).unwrap();
    assert_eq!(
        output,
        "{\"a\":[1,-0,1e400,2.50],\"b\":\"q\\\"uote\\\\ \\u0001 \\u2028 \u{1F600}\",\"c\":{},\"d\":null}"
    );
    let reparsed = parse_json_with_comments_exactly_like_jju(&output).unwrap();
    assert_eq!(reparsed, value);
}
