use std::fmt::{self, Write};

use super::value::JsonValue;
use crate::simd::position_of_json_string_special_byte;

pub fn write_json_for_javascript<Output: Write>(
    value: &JsonValue<'_>,
    output: &mut Output,
) -> fmt::Result {
    match value {
        JsonValue::Null => output.write_str("null"),
        JsonValue::Boolean(true) => output.write_str("true"),
        JsonValue::Boolean(false) => output.write_str("false"),
        JsonValue::Number(number) if !number.source_text.is_empty() => {
            output.write_str(number.source_text)
        }
        JsonValue::Number(number) => write!(output, "{}", number.value),
        JsonValue::String(text) => write_json_string_for_javascript(text, output),
        JsonValue::Array(items) => {
            output.write_char('[')?;
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.write_char(',')?;
                }
                write_json_for_javascript(item, output)?;
            }
            output.write_char(']')
        }
        JsonValue::Object(object) => {
            output.write_char('{')?;
            for (index, (key, item)) in object.entries().iter().enumerate() {
                if index > 0 {
                    output.write_char(',')?;
                }
                write_json_string_for_javascript(key, output)?;
                output.write_char(':')?;
                write_json_for_javascript(item, output)?;
            }
            output.write_char('}')
        }
    }
}

const HEXADECIMAL_DIGITS: &[u8; 16] = b"0123456789abcdef";

const SEPARATOR_LEAD_BYTE: u8 = 0xe2;
const LINE_SEPARATOR_LAST_BYTE: u8 = 0xa8;
const PARAGRAPH_SEPARATOR_LAST_BYTE: u8 = 0xa9;

fn separator_last_byte_at(bytes: &[u8], position: usize) -> Option<u8> {
    match bytes.get(position..position + 3) {
        Some(
            &[SEPARATOR_LEAD_BYTE, 0x80, last @ (LINE_SEPARATOR_LAST_BYTE | PARAGRAPH_SEPARATOR_LAST_BYTE)],
        ) => Some(last),
        _ => None,
    }
}

fn write_escape_sequence<Output: Write>(
    byte: u8,
    separator_last_byte: Option<u8>,
    output: &mut Output,
) -> fmt::Result {
    match (byte, separator_last_byte) {
        (_, Some(LINE_SEPARATOR_LAST_BYTE)) => output.write_str("\\u2028"),
        (_, Some(_)) => output.write_str("\\u2029"),
        (b'"', None) => output.write_str("\\\""),
        (b'\\', None) => output.write_str("\\\\"),
        (control, None) => {
            output.write_str("\\u00")?;
            output.write_char(HEXADECIMAL_DIGITS[(control >> 4) as usize] as char)?;
            output.write_char(HEXADECIMAL_DIGITS[(control & 0xf) as usize] as char)
        }
    }
}

pub fn write_json_string_for_javascript<Output: Write>(
    text: &str,
    output: &mut Output,
) -> fmt::Result {
    output.write_char('"')?;
    let bytes = text.as_bytes();
    let mut unescaped_run_start = 0;
    let mut position = position_of_json_string_special_byte(bytes, 0);
    while let Some(&byte) = bytes.get(position) {
        let separator_last_byte = separator_last_byte_at(bytes, position);
        if byte == SEPARATOR_LEAD_BYTE && separator_last_byte.is_none() {
            position = position_of_json_string_special_byte(bytes, position + 1);
            continue;
        }
        output.write_str(&text[unescaped_run_start..position])?;
        write_escape_sequence(byte, separator_last_byte, output)?;
        position += if separator_last_byte.is_some() { 3 } else { 1 };
        unescaped_run_start = position;
        position = position_of_json_string_special_byte(bytes, position);
    }
    output.write_str(&text[unescaped_run_start..])?;
    output.write_char('"')
}
