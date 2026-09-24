pub fn push_spaces(output: &mut String, count: f64) {
    let mut remaining: f64 = count;
    while remaining > 0.0 {
        output.push(' ');
        remaining -= 1.0;
    }
}

pub fn is_javascript_whitespace(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | 0x0b | 0x0c | b'\r')
}

pub fn trim_javascript_whitespace(text: &str) -> &str {
    let bytes: &[u8] = text.as_bytes();
    let mut start: usize = 0;
    let mut end: usize = bytes.len();
    while start < end && is_javascript_whitespace(bytes[start]) {
        start += 1;
    }
    while end > start && is_javascript_whitespace(bytes[end - 1]) {
        end -= 1;
    }
    &text[start..end]
}

pub fn javascript_substring(text: &str, start: f64, end: f64) -> &str {
    let length: f64 = text.len() as f64;
    let clamp = |value: f64| -> f64 {
        if value.is_nan() || value < 0.0 {
            0.0
        } else if value > length {
            length
        } else {
            value.floor()
        }
    };
    let (mut from, mut to) = (clamp(start), clamp(end));
    if from > to {
        std::mem::swap(&mut from, &mut to);
    }
    &text[from as usize..to as usize]
}

pub fn push_json_string(output: &mut String, value: &str) -> bool {
    output.push('"');
    for byte in value.bytes() {
        match byte {
            b'"' => output.push_str("\\\""),
            b'\\' => output.push_str("\\\\"),
            0x08 => output.push_str("\\b"),
            0x0c => output.push_str("\\f"),
            b'\n' => output.push_str("\\n"),
            b'\r' => output.push_str("\\r"),
            b'\t' => output.push_str("\\t"),
            0x00..=0x1f => {
                const HEX: &[u8; 16] = b"0123456789abcdef";
                output.push_str("\\u00");
                output.push(HEX[(byte >> 4) as usize] as char);
                output.push(HEX[(byte & 0x0f) as usize] as char);
            }
            0x80..=0xff => return false,
            _ => output.push(byte as char),
        }
    }
    output.push('"');
    true
}

pub fn format_javascript_integer(value: f64) -> Option<String> {
    if value.fract() != 0.0 || value.abs() >= 1e15 || value.is_nan() {
        return None;
    }
    if value == 0.0 {
        return Some("0".to_string());
    }
    Some(format!("{}", value as i64))
}
