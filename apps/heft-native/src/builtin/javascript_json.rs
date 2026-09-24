pub fn append_json_string(value: &str, output: &mut String) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{8}' => output.push_str("\\b"),
            '\u{c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                output.push_str(&format!("\\u{:04x}", control as u32));
            }
            other => output.push(other),
        }
    }
    output.push('"');
}

pub fn append_json_string_array<'a>(values: impl Iterator<Item = &'a str>, output: &mut String) {
    output.push('[');
    for (index, value) in values.enumerate() {
        if index > 0 {
            output.push(',');
        }
        append_json_string(value, output);
    }
    output.push(']');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strings_serialize_like_json_stringify() {
        let mut output = String::new();
        append_json_string("a\"b\\c\n\u{1}\u{7f}é\u{2028}", &mut output);
        assert_eq!(output, "\"a\\\"b\\\\c\\n\\u0001\u{7f}é\u{2028}\"");
        let mut array = String::new();
        append_json_string_array(["x", "y"].into_iter(), &mut array);
        assert_eq!(array, "[\"x\",\"y\"]");
    }
}
