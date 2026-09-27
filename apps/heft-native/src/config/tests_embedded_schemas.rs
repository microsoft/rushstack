use super::embedded_schemas::{HEFT_JSON_SCHEMA_TEXT, HEFT_PLUGIN_JSON_SCHEMA_TEXT};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonObject, JsonValue};
use crate::schema::compile_json_schema_for_fast_validation;

const ORIGINAL_HEFT_JSON_SCHEMA_TEXT: &str =
    include_str!("../../../heft/src/schemas/heft.schema.json");
const ORIGINAL_HEFT_PLUGIN_JSON_SCHEMA_TEXT: &str =
    include_str!("../../../heft/src/schemas/heft-plugin.schema.json");

fn without_annotations(value: JsonValue<'_>) -> JsonValue<'_> {
    match value {
        JsonValue::Array(items) => {
            JsonValue::Array(items.into_iter().map(without_annotations).collect())
        }
        JsonValue::Object(object) => {
            let mut stripped: JsonObject = JsonObject::with_capacity(object.len());
            for (key, member) in object.into_entries() {
                let is_annotation: bool = matches!(key.as_ref(), "title" | "description")
                    && matches!(member, JsonValue::String(_));
                if is_annotation {
                    continue;
                }
                let member: JsonValue = match key.as_ref() {
                    "enum" | "const" | "default" | "examples" => member,
                    _ => without_annotations(member),
                };
                stripped.set_keeping_first_position(key, member);
            }
            JsonValue::Object(stripped)
        }
        other => other,
    }
}

fn parse(text: &str) -> JsonValue<'_> {
    parse_json_with_comments_exactly_like_jju(text).expect("the schema text parses")
}

#[test]
fn embedded_schemas_are_the_heft_schemas_without_annotations() {
    for (embedded, original) in [
        (HEFT_JSON_SCHEMA_TEXT, ORIGINAL_HEFT_JSON_SCHEMA_TEXT),
        (HEFT_PLUGIN_JSON_SCHEMA_TEXT, ORIGINAL_HEFT_PLUGIN_JSON_SCHEMA_TEXT),
    ] {
        assert_eq!(
            parse(embedded),
            without_annotations(parse(original)),
            "regenerate src/config/*_schema_without_annotations.json from apps/heft/src/schemas"
        );
        assert!(!embedded.contains('\n') && embedded.len() * 2 < original.len());
    }
}

#[test]
fn embedded_and_original_schemas_accept_the_same_documents() {
    let documents: [&str; 8] = [
        r#"{}"#,
        r#"{"phasesByName":{"build":{"tasksByName":{"t":{"taskPlugin":{"pluginPackage":"p"}}}}}}"#,
        r#"{"phasesByName":{"Build":{}}}"#,
        r#"{"heftPlugins":[{"pluginPackage":"a\\b"}]}"#,
        r#"{"aliasesByName":{"a":{"actionName":"build","defaultParameters":["--x"]}}}"#,
        r#"{"taskPlugins":[{"pluginName":"a","entryPoint":"./a"}]}"#,
        r#"{"lifecyclePlugins":[{"pluginName":"a","entryPoint":"./a","parameterScope":"s"}]}"#,
        r#"{"extends":5}"#,
    ];
    for (embedded, original) in [
        (HEFT_JSON_SCHEMA_TEXT, ORIGINAL_HEFT_JSON_SCHEMA_TEXT),
        (HEFT_PLUGIN_JSON_SCHEMA_TEXT, ORIGINAL_HEFT_PLUGIN_JSON_SCHEMA_TEXT),
    ] {
        let (embedded_document, original_document) = (parse(embedded), parse(original));
        let embedded_schema = compile_json_schema_for_fast_validation(&embedded_document).unwrap();
        let original_schema = compile_json_schema_for_fast_validation(&original_document).unwrap();
        for document in documents {
            let value: JsonValue = parse(document);
            assert_eq!(
                embedded_schema.is_definitely_valid(&value),
                original_schema.is_definitely_valid(&value),
                "{document}"
            );
        }
    }
}
