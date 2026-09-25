use crate::json::JsonValue;

use super::keyword_tables::{
    TYPE_BIT_ARRAY, TYPE_BIT_BOOLEAN, TYPE_BIT_INTEGER, TYPE_BIT_NULL, TYPE_BIT_NUMBER,
    TYPE_BIT_OBJECT, TYPE_BIT_STRING,
};

const OWN_KEYS_THAT_CHANGE_AJV_OR_FAST_DEEP_EQUAL_BEHAVIOR: [&str; 4] =
    ["__proto__", "constructor", "valueOf", "toString"];
const MAXIMUM_SIMPLE_DATA_DEPTH: u32 = 256;
const LARGEST_SAFE_INTEGER: f64 = 9007199254740991.0;

pub(super) fn is_simple_json_data(value: &JsonValue<'_>, depth: u32) -> bool {
    if depth > MAXIMUM_SIMPLE_DATA_DEPTH {
        return false;
    }
    match value {
        JsonValue::Number(number) => number.value.is_finite(),
        JsonValue::Array(items) => items
            .iter()
            .all(|item| is_simple_json_data(item, depth + 1)),
        JsonValue::Object(object) => object.entries().iter().all(|(key, item)| {
            !OWN_KEYS_THAT_CHANGE_AJV_OR_FAST_DEEP_EQUAL_BEHAVIOR.contains(&key.as_ref())
                && is_simple_json_data(item, depth + 1)
        }),
        _ => true,
    }
}

pub(super) fn json_values_are_deeply_equal(first: &JsonValue<'_>, second: &JsonValue<'_>) -> bool {
    match (first, second) {
        (JsonValue::Null, JsonValue::Null) => true,
        (JsonValue::Boolean(left), JsonValue::Boolean(right)) => left == right,
        (JsonValue::Number(left), JsonValue::Number(right)) => left.value == right.value,
        (JsonValue::String(left), JsonValue::String(right)) => left == right,
        (JsonValue::Array(left), JsonValue::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right.iter())
                    .all(|(left_item, right_item)| {
                        json_values_are_deeply_equal(left_item, right_item)
                    })
        }
        (JsonValue::Object(left), JsonValue::Object(right)) => {
            left.len() == right.len()
                && left.entries().iter().all(|(key, left_item)| {
                    right.get(key).is_some_and(|right_item| {
                        json_values_are_deeply_equal(left_item, right_item)
                    })
                })
        }
        _ => false,
    }
}

pub(super) fn json_schema_type_bits_of_data(value: &JsonValue<'_>) -> u8 {
    match value {
        JsonValue::Null => TYPE_BIT_NULL,
        JsonValue::Boolean(_) => TYPE_BIT_BOOLEAN,
        JsonValue::String(_) => TYPE_BIT_STRING,
        JsonValue::Array(_) => TYPE_BIT_ARRAY,
        JsonValue::Object(_) => TYPE_BIT_OBJECT,
        JsonValue::Number(number) if !number.value.is_finite() => 0,
        JsonValue::Number(number) if number.value.fract() == 0.0 => {
            TYPE_BIT_NUMBER | TYPE_BIT_INTEGER
        }
        JsonValue::Number(_) => TYPE_BIT_NUMBER,
    }
}

pub(super) fn non_negative_safe_integer_value(value: &JsonValue<'_>) -> Option<u64> {
    let number = value.as_f64()?;
    let is_non_negative_safe_integer =
        number >= 0.0 && number.fract() == 0.0 && number <= LARGEST_SAFE_INTEGER;
    if is_non_negative_safe_integer {
        Some(number as u64)
    } else {
        None
    }
}

fn leading_decimal_digits_of_exponential_notation(magnitude: f64) -> f64 {
    let exponential_notation = format!("{:e}", magnitude);
    let digit_count = exponential_notation
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    exponential_notation[..digit_count]
        .parse()
        .unwrap_or(f64::NAN)
}

pub(super) fn javascript_parse_int_of_number_to_string(number: f64) -> f64 {
    if !number.is_finite() {
        return f64::NAN;
    }
    let magnitude = number.abs();
    let uses_exponential_notation = magnitude >= 1e21 || (magnitude != 0.0 && magnitude < 1e-6);
    if uses_exponential_notation {
        let digits = leading_decimal_digits_of_exponential_notation(magnitude);
        return if number < 0.0 { -digits } else { digits };
    }
    let truncated = number.trunc();
    if truncated == 0.0 && number < 0.0 {
        return -0.0;
    }
    truncated
}
