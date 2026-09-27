pub fn is_absolute(path: &str) -> bool {
    path.starts_with('/')
}

const LOW_SEVEN_BITS: u64 = 0x7f7f_7f7f_7f7f_7f7f;
const SEPARATORS: u64 = 0x2f2f_2f2f_2f2f_2f2f;

fn zero_byte_mask(word: u64) -> u64 {
    !(((word & LOW_SEVEN_BITS).wrapping_add(LOW_SEVEN_BITS)) | word) & !LOW_SEVEN_BITS
}

fn has_separator_before_dot_or_separator(bytes: &[u8]) -> bool {
    let (words, rest) = bytes.as_chunks::<8>();
    let mut tail: [u8; 8] = [0; 8];
    tail[..rest.len()].copy_from_slice(rest);
    let mut previous_ends_with_separator: bool = false;
    for word in words.iter().chain(std::iter::once(&tail)) {
        let word: u64 = u64::from_le_bytes(*word);
        let separators: u64 = zero_byte_mask(word ^ SEPARATORS);
        let dots_or_separators: u64 = zero_byte_mask((word | 0x0101_0101_0101_0101) ^ SEPARATORS);
        if separators & (dots_or_separators >> 8) != 0
            || (previous_ends_with_separator && dots_or_separators & 0x80 != 0)
        {
            return true;
        }
        previous_ends_with_separator = separators >> 63 != 0;
    }
    false
}

fn is_normalized_absolute_path(path: &str) -> bool {
    let bytes: &[u8] = path.as_bytes();
    bytes == b"/"
        || (bytes.first() == Some(&b'/')
            && bytes.last() != Some(&b'/')
            && !has_separator_before_dot_or_separator(bytes))
}

fn normalize_segments(path: &str, allow_above_root: bool) -> String {
    let mut segments: Vec<&str> = Vec::with_capacity(16);
    let mut leading_parent_count: usize = 0;
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.pop().is_none() && allow_above_root {
                    leading_parent_count += 1;
                }
            }
            _ => segments.push(segment),
        }
    }
    let mut result: String = String::with_capacity(path.len());
    for _ in 0..leading_parent_count {
        if !result.is_empty() {
            result.push('/');
        }
        result.push_str("..");
    }
    for segment in segments {
        if !result.is_empty() {
            result.push('/');
        }
        result.push_str(segment);
    }
    result
}

pub fn normalize(path: &str) -> String {
    if is_normalized_absolute_path(path) {
        return path.to_string();
    }
    normalize_slowly(path)
}

fn normalize_slowly(path: &str) -> String {
    if path.is_empty() {
        return ".".to_string();
    }
    let absolute: bool = is_absolute(path);
    let trailing_separator: bool = path.ends_with('/');
    let mut normalized: String = normalize_segments(path, !absolute);
    if normalized.is_empty() {
        if absolute {
            return "/".to_string();
        }
        return if trailing_separator {
            "./".to_string()
        } else {
            ".".to_string()
        };
    }
    if trailing_separator {
        normalized.push('/');
    }
    if absolute {
        normalized.insert(0, '/');
    }
    normalized
}

pub fn resolve(base: &str, relative: &str) -> String {
    if is_absolute(relative) {
        return resolve_absolute(relative);
    }
    let relative: &str = relative.trim_start_matches("./");
    let mut combined: String = String::with_capacity(base.len() + relative.len() + 1);
    combined.push_str(base);
    combined.push('/');
    combined.push_str(relative);
    if is_normalized_absolute_path(&combined) {
        return combined;
    }
    resolve_absolute_slowly(&combined)
}

pub fn resolve_absolute(absolute_path: &str) -> String {
    if is_normalized_absolute_path(absolute_path) {
        return absolute_path.to_string();
    }
    resolve_absolute_slowly(absolute_path)
}

fn resolve_absolute_slowly(absolute_path: &str) -> String {
    let normalized: String = normalize_segments(absolute_path, false);
    let mut result: String = String::with_capacity(normalized.len() + 1);
    result.push('/');
    result.push_str(&normalized);
    result
}

pub fn join(base: &str, relative: &str) -> String {
    if relative.is_empty() {
        return normalize(base);
    }
    if base.is_empty() {
        return normalize(relative);
    }
    let relative: &str = relative.trim_start_matches("./");
    let mut combined: String = String::with_capacity(base.len() + relative.len() + 1);
    combined.push_str(base);
    combined.push('/');
    combined.push_str(relative);
    if is_normalized_absolute_path(&combined) {
        return combined;
    }
    normalize_slowly(&combined)
}

pub fn dirname(path: &str) -> &str {
    let bytes: &[u8] = path.as_bytes();
    if bytes.is_empty() {
        return ".";
    }
    let has_root: bool = bytes[0] == b'/';
    let mut end: Option<usize> = None;
    let mut matched_slash: bool = true;
    let mut index: usize = bytes.len() - 1;
    while index >= 1 {
        if bytes[index] == b'/' {
            if !matched_slash {
                end = Some(index);
                break;
            }
        } else {
            matched_slash = false;
        }
        index -= 1;
    }
    match end {
        None => {
            if has_root {
                "/"
            } else {
                "."
            }
        }
        Some(1) if has_root => "//",
        Some(end_index) => &path[..end_index],
    }
}
