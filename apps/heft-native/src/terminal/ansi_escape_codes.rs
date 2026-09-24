use std::borrow::Cow;

pub fn bold(text: &str) -> String {
    format!("\x1b[1m{text}\x1b[22m")
}

pub fn red(text: &str) -> String {
    format!("\x1b[31m{text}\x1b[39m")
}

pub fn green(text: &str) -> String {
    format!("\x1b[32m{text}\x1b[39m")
}

pub fn remove_ansi_escape_codes(text: &str) -> Cow<'_, str> {
    let bytes = text.as_bytes();
    if !bytes.contains(&0x1b) {
        return Cow::Borrowed(text);
    }
    let mut text_without_codes = String::with_capacity(text.len());
    let mut copied_until = 0;
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == 0x1b && bytes.get(index + 1) == Some(&b'[') {
            if let Some(sequence_end) = control_sequence_end(bytes, index + 2) {
                text_without_codes.push_str(&text[copied_until..index]);
                index = sequence_end;
                copied_until = sequence_end;
                continue;
            }
        }
        index += 1;
    }
    text_without_codes.push_str(&text[copied_until..]);
    Cow::Owned(text_without_codes)
}

fn control_sequence_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut position = start;
    while position < bytes.len() && (0x30..=0x3f).contains(&bytes[position]) {
        position += 1;
    }
    while position < bytes.len() && (0x20..=0x2f).contains(&bytes[position]) {
        position += 1;
    }
    match bytes.get(position) {
        Some(final_byte) if (0x40..=0x7e).contains(final_byte) => Some(position + 1),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_control_sequences_like_the_terminal_package() {
        assert_eq!(remove_ansi_escape_codes("plain"), "plain");
        assert_eq!(remove_ansi_escape_codes(&bold(&green("done"))), "done");
        assert_eq!(remove_ansi_escape_codes("a\x1b[1;31mb\x1b[0m"), "ab");
        assert_eq!(remove_ansi_escape_codes("\x1b[\x1b[31mm"), "\x1b[m");
        assert_eq!(remove_ansi_escape_codes("\x1b[12"), "\x1b[12");
        assert_eq!(remove_ansi_escape_codes("x\x1b[ é"), "x\x1b[ é");
        assert_eq!(remove_ansi_escape_codes("\x1b[?25l\x1b[2 q"), "");
    }
}
