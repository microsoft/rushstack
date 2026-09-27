pub(super) const SEPARATOR_LEAD_BYTE: u8 = 0xe2;

pub(super) fn is_json_whitespace(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | b'\r')
}

pub(super) fn is_json_string_special_byte(byte: u8) -> bool {
    byte == b'"' || byte == b'\\' || byte < 0x20 || byte == SEPARATOR_LEAD_BYTE
}

pub(super) fn is_line_comment_end_or_separator_lead_byte(byte: u8) -> bool {
    byte == b'\n' || byte == b'\r' || byte == SEPARATOR_LEAD_BYTE
}

fn position_of_first_byte_matching(bytes: &[u8], from: usize, matches: fn(u8) -> bool) -> usize {
    let mut position = from;
    while let Some(&byte) = bytes.get(position) {
        if matches(byte) {
            break;
        }
        position += 1;
    }
    position
}

pub(super) fn position_after_json_whitespace(bytes: &[u8], from: usize) -> usize {
    position_of_first_byte_matching(bytes, from, |byte| !is_json_whitespace(byte))
}

pub(super) fn position_of_json_string_special_byte(bytes: &[u8], from: usize) -> usize {
    position_of_first_byte_matching(bytes, from, is_json_string_special_byte)
}

pub(super) fn position_of_line_comment_end_or_separator_lead_byte(
    bytes: &[u8],
    from: usize,
) -> usize {
    position_of_first_byte_matching(bytes, from, is_line_comment_end_or_separator_lead_byte)
}

pub(super) fn position_of_block_comment_star(bytes: &[u8], from: usize) -> usize {
    position_of_first_byte_matching(bytes, from, |byte| byte == b'*')
}
