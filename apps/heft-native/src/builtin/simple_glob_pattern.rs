#[derive(Debug, PartialEq, Eq)]
pub enum SimpleGlobPattern {
    Literal(String),
    AnyRecursive,
    AnyTopLevel,
    Suffix(String),
    TopLevelPrefix(String),
}

pub fn parse_simple_glob_pattern(pattern: &str) -> Option<Vec<SimpleGlobPattern>> {
    if pattern == "**/*" {
        return Some(vec![SimpleGlobPattern::AnyRecursive]);
    }
    if pattern == "*" {
        return Some(vec![SimpleGlobPattern::AnyTopLevel]);
    }
    if let Some(extension_part) = pattern.strip_prefix("**/*.") {
        if let Some(extension_list) = extension_part.strip_prefix('{') {
            let extension_list = extension_list.strip_suffix('}')?;
            if extension_list.contains(['/', '{', '}']) || extension_list.is_empty() {
                return None;
            }
            let extensions: Vec<&str> = extension_list.split(',').collect();
            if extensions.len() < 2 || !extensions.iter().all(|extension| is_extension(extension)) {
                return None;
            }
            return Some(
                extensions
                    .into_iter()
                    .map(|extension| SimpleGlobPattern::Suffix(format!(".{extension}")))
                    .collect(),
            );
        }
        if extension_part.is_empty() || extension_part.contains(['/', '{', '}']) {
            return None;
        }
        return is_extension(extension_part)
            .then(|| vec![SimpleGlobPattern::Suffix(format!(".{extension_part}"))]);
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        if prefix.ends_with('.') && is_extension(&prefix[..prefix.len() - 1]) {
            return Some(vec![SimpleGlobPattern::TopLevelPrefix(prefix.to_owned())]);
        }
    }
    let every_segment_is_literal = pattern.split('/').all(|segment| {
        !segment.is_empty()
            && segment.bytes().all(is_literal_segment_byte)
            && !segment.bytes().all(|byte| byte == b'.')
    });
    every_segment_is_literal.then(|| vec![SimpleGlobPattern::Literal(pattern.to_owned())])
}

fn is_literal_segment_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'.' || byte == b'-'
}

fn is_extension_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

pub fn is_extension(text: &str) -> bool {
    !text.is_empty()
        && text
            .split('.')
            .all(|word| !word.is_empty() && word.bytes().all(is_extension_word_byte))
}

#[cfg(test)]
mod tests {
    use super::*;
    use SimpleGlobPattern::*;

    #[test]
    fn patterns_parse_like_the_heft_simple_glob() {
        assert_eq!(parse_simple_glob_pattern("**/*"), Some(vec![AnyRecursive]));
        assert_eq!(parse_simple_glob_pattern("*"), Some(vec![AnyTopLevel]));
        assert_eq!(parse_simple_glob_pattern("**/*.txt"), Some(vec![Suffix(".txt".into())]));
        assert_eq!(parse_simple_glob_pattern("**/*.d.ts"), Some(vec![Suffix(".d.ts".into())]));
        assert_eq!(
            parse_simple_glob_pattern("**/*.{txt,json}"),
            Some(vec![Suffix(".txt".into()), Suffix(".json".into())])
        );
        assert_eq!(parse_simple_glob_pattern("**/*.{txt}"), None);
        assert_eq!(parse_simple_glob_pattern("**/*.{txt,}"), None);
        assert_eq!(parse_simple_glob_pattern("**/*.t?t"), None);
        assert_eq!(parse_simple_glob_pattern("build.*"), Some(vec![TopLevelPrefix("build.".into())]));
        assert_eq!(parse_simple_glob_pattern("lib"), Some(vec![Literal("lib".into())]));
        assert_eq!(parse_simple_glob_pattern("a/b.txt"), Some(vec![Literal("a/b.txt".into())]));
        assert_eq!(parse_simple_glob_pattern("a/../b"), None);
        assert_eq!(parse_simple_glob_pattern("./a"), None);
        assert_eq!(parse_simple_glob_pattern("a//b"), None);
        assert_eq!(parse_simple_glob_pattern("src/**/*.txt"), None);
        assert_eq!(parse_simple_glob_pattern(".*"), None);
        assert_eq!(parse_simple_glob_pattern(""), None);
    }
}
