pub fn ends_with_256_color_pattern(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.ends_with("-256") || lower.ends_with("-256color")
}

pub fn matches_basic_term_pattern(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("screen")
        || lower.starts_with("xterm")
        || lower.starts_with("vt100")
        || lower.starts_with("vt220")
        || lower.starts_with("rxvt")
        || lower.contains("color")
        || lower.contains("ansi")
        || lower.contains("cygwin")
        || lower.contains("linux")
}

pub fn matches_teamcity_version_pattern(value: &str) -> bool {
    matches_teamcity_nine_pattern(value) || matches_two_or_more_digit_major_pattern(value)
}

fn matches_teamcity_nine_pattern(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("9.") else {
        return false;
    };
    let Some(dot_index) = rest.find('.') else {
        return false;
    };
    let middle = &rest[..dot_index];
    if middle.is_empty() || !middle.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    middle.bytes().any(|byte| byte != b'0')
}

fn matches_two_or_more_digit_major_pattern(value: &str) -> bool {
    let Some(dot_index) = value.find('.') else {
        return false;
    };
    dot_index >= 2 && value[..dot_index].bytes().all(|byte| byte.is_ascii_digit())
}
