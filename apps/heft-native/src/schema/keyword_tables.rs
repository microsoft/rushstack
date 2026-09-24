pub(super) const TYPE_BIT_NULL: u8 = 1;
pub(super) const TYPE_BIT_BOOLEAN: u8 = 2;
pub(super) const TYPE_BIT_OBJECT: u8 = 4;
pub(super) const TYPE_BIT_ARRAY: u8 = 8;
pub(super) const TYPE_BIT_NUMBER: u8 = 16;
pub(super) const TYPE_BIT_INTEGER: u8 = 32;
pub(super) const TYPE_BIT_STRING: u8 = 64;

pub(super) fn type_bit_for_json_schema_type_name(type_name: &str) -> Option<u8> {
    Some(match type_name {
        "null" => TYPE_BIT_NULL,
        "boolean" => TYPE_BIT_BOOLEAN,
        "object" => TYPE_BIT_OBJECT,
        "array" => TYPE_BIT_ARRAY,
        "number" => TYPE_BIT_NUMBER,
        "integer" => TYPE_BIT_INTEGER,
        "string" => TYPE_BIT_STRING,
        _ => return None,
    })
}

pub(super) fn data_type_that_type_specific_keyword_applies_to(
    keyword: &str,
) -> Option<&'static str> {
    Some(match keyword {
        "maximum" | "minimum" | "exclusiveMaximum" | "exclusiveMinimum" | "multipleOf" => "number",
        "maxLength" | "minLength" | "pattern" => "string",
        "maxProperties"
        | "minProperties"
        | "required"
        | "properties"
        | "patternProperties"
        | "additionalProperties"
        | "dependencies"
        | "propertyNames" => "object",
        "maxItems" | "minItems" | "uniqueItems" | "items" | "contains" => "array",
        _ => return None,
    })
}

pub(super) fn is_vendor_extension_keyword(key: &str) -> bool {
    let Some(rest) = key.strip_prefix("x-") else {
        return false;
    };
    let mut segment_count = 0;
    for segment in rest.split('-') {
        let segment_is_valid = !segment.is_empty()
            && segment
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
        if !segment_is_valid {
            return false;
        }
        segment_count += 1;
    }
    segment_count >= 2
}

const OBJECT_PROTOTYPE_MEMBER_NAMES: [&str; 12] = [
    "constructor",
    "__defineGetter__",
    "__defineSetter__",
    "hasOwnProperty",
    "__lookupGetter__",
    "__lookupSetter__",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toString",
    "valueOf",
    "__proto__",
    "toLocaleString",
];

pub(super) fn is_object_prototype_member_name(name: &str) -> bool {
    OBJECT_PROTOTYPE_MEMBER_NAMES.contains(&name)
}

pub(super) fn type_list_includes_type_like_ajv(types: &[&str], type_name: &str) -> bool {
    types.contains(&type_name) || (type_name == "integer" && types.contains(&"number"))
}

pub(super) fn type_list_has_type_applicable_to_keyword(types: &[&str], keyword_type: &str) -> bool {
    types.contains(&keyword_type) || (keyword_type == "number" && types.contains(&"integer"))
}
