use super::text::{is_javascript_whitespace, javascript_substring};

fn is_wrap_delimiter(byte: u8) -> bool {
    matches!(byte, b' ' | b'.' | b',' | b'!' | b'?')
}

fn find_last_delimiter_index(segment: &str) -> f64 {
    match segment.bytes().rposition(is_wrap_delimiter) {
        Some(index) => index as f64,
        None => f64::NAN,
    }
}

fn normalize_help_whitespace(text: &str) -> String {
    let mut normalized: String = String::with_capacity(text.len());
    let mut pending_space: bool = false;
    for character in text.chars() {
        let is_whitespace: bool = matches!(character, '|') || (character.is_ascii() && is_javascript_whitespace(character as u8));
        if is_whitespace {
            pending_space = !normalized.is_empty();
        } else {
            if pending_space {
                normalized.push(' ');
                pending_space = false;
            }
            normalized.push(character);
        }
    }
    normalized
}

pub fn for_each_help_line(text: &str, width: f64, mut emit: impl FnMut(usize, &str)) {
    let line: String = normalize_help_whitespace(text);
    let length: f64 = line.len() as f64;
    if width >= length {
        emit(0, &line);
        return;
    }
    let mut line_index: usize = 0;
    let mut wrap_start: f64 = 0.0;
    let mut wrap_end: f64 = width;
    while wrap_end <= length {
        if wrap_end != length {
            let segment: &str = javascript_substring(&line, wrap_start, wrap_end);
            wrap_end = wrap_start + find_last_delimiter_index(segment) + 1.0;
        }
        emit(line_index, javascript_substring(&line, wrap_start, wrap_end));
        line_index += 1;
        wrap_start = wrap_end;
        wrap_end += width;
    }
    if wrap_start < length {
        emit(line_index, javascript_substring(&line, wrap_start, wrap_end));
    }
}

pub fn fill_help_text(output: &mut String, text: &str, width: f64, indent: &str) {
    for_each_help_line(text, width, |line_index, line| {
        if line_index > 0 {
            output.push('\n');
        }
        output.push_str(indent);
        output.push_str(line);
    });
}
