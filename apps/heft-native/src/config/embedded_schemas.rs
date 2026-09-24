use super::fallback::{fallback, ConfigResult};
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};

pub const HEFT_JSON_SCHEMA_TEXT: &str = include_str!("../../../heft/src/schemas/heft.schema.json");
pub const HEFT_PLUGIN_JSON_SCHEMA_TEXT: &str =
    include_str!("../../../heft/src/schemas/heft-plugin.schema.json");

pub fn parse_embedded_schema(schema_text: &'static str) -> ConfigResult<JsonValue<'static>> {
    match parse_json_with_comments_exactly_like_jju(schema_text) {
        Ok(schema_document) => Ok(schema_document),
        Err(_) => fallback("an embedded schema can't be parsed"),
    }
}
