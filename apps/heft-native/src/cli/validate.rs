use super::defined_parameter::DefinedParameter;
use super::model::{DefaultValue, ParameterKind};

fn is_lower_alphanumeric(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit()
}

fn is_lower_alphanumeric_word(word: &str) -> bool {
    !word.is_empty() && word.bytes().all(is_lower_alphanumeric)
}

pub fn is_valid_long_name(name: &str) -> bool {
    match name.strip_prefix('-') {
        Some(rest) => rest.starts_with('-') && rest[1..].split('-').all(is_lower_alphanumeric_word),
        None => false,
    }
}

pub fn is_valid_short_name(name: &str) -> bool {
    let bytes: &[u8] = name.as_bytes();
    bytes.len() == 2 && bytes[0] == b'-' && bytes[1].is_ascii_alphabetic()
}

pub fn is_valid_scope(scope: &str) -> bool {
    scope.split('-').all(is_lower_alphanumeric_word)
}

pub fn is_valid_argument_name(name: &str) -> bool {
    !name.is_empty() && name.bytes().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

pub fn is_valid_action_name(name: &str) -> bool {
    let bytes: &[u8] = name.as_bytes();
    if bytes.is_empty() || !bytes[0].is_ascii_lowercase() {
        return false;
    }
    let mut previous_was_separator: bool = false;
    for byte in &bytes[1..] {
        if *byte == b'-' || *byte == b':' {
            if previous_was_separator {
                return false;
            }
            previous_was_separator = true;
        } else if is_lower_alphanumeric(*byte) {
            previous_was_separator = false;
        } else {
            return false;
        }
    }
    !previous_was_separator
}

fn is_truthy_default(default_value: Option<DefaultValue<'_>>) -> bool {
    match default_value {
        Some(DefaultValue::Text(text)) => !text.is_empty(),
        Some(DefaultValue::Number(number)) => number != 0.0 && !number.is_nan(),
        None => false,
    }
}

pub fn is_valid_definition(parameter: &DefinedParameter<'_>) -> bool {
    if !is_valid_long_name(parameter.long_name) {
        return false;
    }
    if parameter.short_name.is_some_and(|short_name| !is_valid_short_name(short_name)) {
        return false;
    }
    if parameter.scope.is_some_and(|scope| !is_valid_scope(scope)) {
        return false;
    }
    let needs_argument_name: bool = matches!(
        parameter.kind,
        ParameterKind::String | ParameterKind::StringList | ParameterKind::Integer | ParameterKind::IntegerList
    );
    match parameter.argument_name {
        Some(argument_name) if needs_argument_name => {
            if !is_valid_argument_name(argument_name) {
                return false;
            }
        }
        None if needs_argument_name => return false,
        Some(_) => return false,
        None => {}
    }
    if parameter.kind.has_alternatives() {
        if parameter.alternatives.is_empty() {
            return false;
        }
        if let Some(DefaultValue::Text(default_text)) = parameter.default_value {
            if !default_text.is_empty() && !parameter.alternatives.contains(&default_text) {
                return false;
            }
        }
    } else if !parameter.alternatives.is_empty() {
        return false;
    }
    let default_matches_kind: bool = matches!(
        (parameter.kind, parameter.default_value),
        (_, None)
            | (ParameterKind::Choice | ParameterKind::String, Some(DefaultValue::Text(_)))
            | (ParameterKind::Integer, Some(DefaultValue::Number(_)))
    );
    if !default_matches_kind {
        return false;
    }
    !(parameter.required && is_truthy_default(parameter.default_value))
}
