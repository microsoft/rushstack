use crate::json::parse_json_with_comments_exactly_like_jju;

use super::compile_json_schema_for_fast_validation;

fn verdicts_for(schema_text: &str, data_texts: &[&str]) -> Option<Vec<bool>> {
    let schema_document = parse_json_with_comments_exactly_like_jju(schema_text).unwrap();
    let compiled_schema = compile_json_schema_for_fast_validation(&schema_document)?;
    let verdicts = data_texts
        .iter()
        .map(|data_text| {
            let data = parse_json_with_comments_exactly_like_jju(data_text).unwrap();
            compiled_schema.is_definitely_valid(&data)
        })
        .collect();
    Some(verdicts)
}

const HEFT_LIKE_SCHEMA: &str = r##"{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "additionalProperties": false,
  "definitions": {
    "plugin": {
      "type": "object",
      "required": ["pluginPackage"],
      "additionalProperties": false,
      "properties": { "pluginPackage": { "type": "string", "pattern": "[^\\\\]" }, "options": { "type": "object" } }
    }
  },
  "properties": {
    "$schema": { "type": "string" },
    "heftPlugins": { "type": "array", "items": { "$ref": "#/definitions/plugin" } },
    "phasesByName": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": { "^[a-z][a-z0-9]*([-][a-z0-9]+)*$": { "type": "object" } }
    }
  }
}"##;

#[test]
fn heft_like_schema_accepts_valid_and_rejects_invalid_data() {
    let verdicts = verdicts_for(
        HEFT_LIKE_SCHEMA,
        &[
            r#"{"heftPlugins": [{"pluginPackage": "a"}], "phasesByName": {"build": {}}}"#,
            r#"{"heftPlugins": [{"pluginPackage": "a", "extra": 1}]}"#,
            r#"{"heftPlugins": [{}]}"#,
            r#"{"phasesByName": {"Build": {}}}"#,
            r#"{"unknown": true}"#,
            r#"{"heftPlugins": [{"pluginPackage": "\\"}]}"#,
        ],
    );
    assert_eq!(
        verdicts,
        Some(vec![true, false, false, false, false, false])
    );
}

#[test]
fn refuses_schemas_that_ajv_strict_mode_would_reject_or_warn_about() {
    for schema_text in [
        r#"{"foo": 1}"#,
        r#"{"properties": {}}"#,
        r#"{"$schema": "http://json-schema.org/draft-04/schema#", "type": "object", "required": []}"#,
        r#"{"type": "string", "format": "uri"}"#,
        r#"{"type": "array", "items": [{}]}"#,
        r#"{"if": {}}"#,
        r#"{"then": {}}"#,
        r#"{"type": "object", "properties": {"a": {}}, "patternProperties": {"^a": {}}}"#,
        r#"{"type": "string", "pattern": "("}"#,
        r##"{"$ref": "#/definitions/missing"}"##,
        r#"{"type": "object", "properties": {"constructor": {}}}"#,
        r#"{"enum": [1, 1]}"#,
        r#"{"$schema": "http://json-schema.org/draft-06/schema#"}"#,
        r#"{"$id": "http://example.com/schema"}"#,
        r#"{"$schema": "http://json-schema.org/draft-04/schema#", "examples": []}"#,
        r#"{"$schema": "http://json-schema.org/draft-04/schema#", "type": "number", "exclusiveMinimum": true}"#,
        r#"{"type": "string", "title": 5}"#,
        r#"{"type": "string", "minLength": 1.5}"#,
    ] {
        assert!(
            verdicts_for(schema_text, &[]).is_none(),
            "expected {} to be refused",
            schema_text
        );
    }
}

#[test]
fn context_types_flow_into_in_place_applicators_like_ajv() {
    let verdicts = verdicts_for(
        r#"{"type": "object", "anyOf": [{"required": ["a"]}, {"required": ["b"]}]}"#,
        &[r#"{"a": 1}"#, r#"{"b": 1}"#, r#"{"c": 1}"#],
    );
    assert_eq!(verdicts, Some(vec![true, true, false]));
}

#[test]
fn data_that_ajv_would_see_differently_is_never_definitely_valid() {
    let verdicts = verdicts_for(
        r#"{"type": ["object", "array"]}"#,
        &[r#"{"toString": 1}"#, r#"[1e400]"#, r#"{"a": [1]}"#],
    );
    assert_eq!(verdicts, Some(vec![false, false, true]));
}

#[test]
fn draft_07_numbers_strings_and_multiple_of_follow_javascript_semantics() {
    let verdicts = verdicts_for(
        r#"{"type": "number", "exclusiveMinimum": 0, "maximum": 10, "multipleOf": 0.5}"#,
        &["0", "0.5", "10", "10.5", "0.3"],
    );
    assert_eq!(verdicts, Some(vec![false, true, true, false, false]));
    let lengths = verdicts_for(
        r#"{"type": "string", "minLength": 2, "maxLength": 2}"#,
        &[r#""\ud83d\ude00a""#, r#""a""#],
    );
    assert_eq!(lengths, Some(vec![true, false]));
}

#[test]
fn every_all_of_member_still_applies_after_inline_members_move_before_references() {
    let schema = r##"{
      "type": "object",
      "definitions": {
        "hasName": { "type": "object", "required": ["name"] },
        "hasKind": { "type": "object", "required": ["kind"] }
      },
      "allOf": [
        { "$ref": "#/definitions/hasName" },
        { "properties": { "kind": { "enum": ["flag", "string"] } } },
        { "$ref": "#/definitions/hasKind" },
        { "properties": { "name": { "type": "string", "pattern": "^-(-[a-z0-9]+)+$" } } }
      ]
    }"##;
    let verdicts = verdicts_for(
        schema,
        &[
            r#"{"name": "--verbose", "kind": "flag"}"#,
            r#"{"kind": "flag"}"#,
            r#"{"name": "--verbose", "kind": "choice"}"#,
            r#"{"name": "--verbose"}"#,
            r#"{"name": "verbose", "kind": "flag"}"#,
        ],
    );
    assert_eq!(verdicts, Some(vec![true, false, false, false, false]));
}
