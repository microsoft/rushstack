pub(super) type CodePointRange = (u32, u32);

pub(super) const DIGIT_CODE_POINTS: &[CodePointRange] = &[(0x30, 0x39)];
pub(super) const WORD_CODE_POINTS: &[CodePointRange] =
    &[(0x30, 0x39), (0x41, 0x5a), (0x5f, 0x5f), (0x61, 0x7a)];
pub(super) const WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS: &[CodePointRange] = &[
    (0x09, 0x0d),
    (0x20, 0x20),
    (0xa0, 0xa0),
    (0x1680, 0x1680),
    (0x2000, 0x200a),
    (0x2028, 0x2029),
    (0x202f, 0x202f),
    (0x205f, 0x205f),
    (0x3000, 0x3000),
    (0xfeff, 0xfeff),
];
pub(super) const LINE_TERMINATOR_CODE_POINTS: &[CodePointRange] =
    &[(0x0a, 0x0a), (0x0d, 0x0d), (0x2028, 0x2029)];

const SYNTAX_CHARACTERS: &str = "^$\\.*+?()[]{}|/";

pub(super) fn character_for_control_escape(escape: char) -> Option<char> {
    Some(match escape {
        'n' => '\n',
        'r' => '\r',
        't' => '\t',
        'f' => '\u{c}',
        'v' => '\u{b}',
        _ => return None,
    })
}

pub(super) fn character_for_identity_escape_of_syntax_character(escape: char) -> Option<char> {
    if SYNTAX_CHARACTERS.contains(escape) {
        Some(escape)
    } else {
        None
    }
}

pub(super) fn ranges_contain_code_point(ranges: &[CodePointRange], code_point: u32) -> bool {
    ranges
        .iter()
        .any(|&(first, last)| code_point >= first && code_point <= last)
}
