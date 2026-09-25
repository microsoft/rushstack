pub fn parse_int_base_ten_like_javascript(value: &str) -> f64 {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() && is_javascript_whitespace(bytes[index]) {
        index += 1;
    }
    let mut sign = 1.0;
    if index < bytes.len() && bytes[index] == b'+' {
        index += 1;
    } else if index < bytes.len() && bytes[index] == b'-' {
        sign = -1.0;
        index += 1;
    }
    let start = index;
    let mut number = 0.0;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        number = number * 10.0 + f64::from(bytes[index] - b'0');
        index += 1;
    }
    if index == start {
        f64::NAN
    } else {
        sign * number
    }
}

fn is_javascript_whitespace(byte: u8) -> bool {
    matches!(byte, b'\t' | b'\n' | b'\x0B' | b'\x0C' | b'\r' | b' ')
}
