use std::fmt::{self, Write};

use super::value::JsonValue;

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

pub fn write_json_string_for_javascript<Output: Write>(
    text: &str,
    output: &mut Output,
) -> fmt::Result {
    output.write_char('"')?;
    let mut unescaped_run_start = 0;
    for (index, character) in text.char_indices() {
        let escape: Option<&str> = match character {
            '"' => Some("\\\""),
            '\\' => Some("\\\\"),
            '\u{2028}' => Some("\\u2028"),
            '\u{2029}' => Some("\\u2029"),
            control if (control as u32) < 0x20 => None,
            _ => continue,
        };
        output.write_str(&text[unescaped_run_start..index])?;
        match escape {
            Some(sequence) => output.write_str(sequence)?,
            None => {
                let byte = character as u8;
                output.write_str("\\u00")?;
                output.write_char(HEXADECIMAL_DIGITS[(byte >> 4) as usize] as char)?;
                output.write_char(HEXADECIMAL_DIGITS[(byte & 0xf) as usize] as char)?;
            }
        }
        unescaped_run_start = index + character.len_utf8();
    }
    output.write_str(&text[unescaped_run_start..])?;
    output.write_char('"')
}
