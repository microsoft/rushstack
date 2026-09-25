use super::help_model::{HelpAction, HelpNargs};

pub fn build_metavar(action: &HelpAction<'_>, default_metavar: &str) -> String {
    if let Some(metavar) = action.metavar {
        return metavar.to_string();
    }
    if let Some(choices) = &action.choices {
        let mut result: String = String::from("{");
        for (choice_index, choice) in choices.iter().enumerate() {
            if choice_index > 0 {
                result.push(',');
            }
            result.push_str(choice);
        }
        result.push('}');
        return result;
    }
    default_metavar.to_string()
}

pub fn format_args(action: &HelpAction<'_>, default_metavar: &str) -> String {
    let metavar: String = build_metavar(action, default_metavar);
    match action.nargs {
        HelpNargs::Single | HelpNargs::Zero => metavar,
        HelpNargs::ZeroOrMore => format!("[{} [{} ...]]", metavar, metavar),
        HelpNargs::Remainder => String::from("..."),
        HelpNargs::Parser => format!("{} ...", metavar),
    }
}

pub fn format_action_invocation(action: &HelpAction<'_>) -> String {
    if !action.is_optional() {
        return build_metavar(action, &action.dest);
    }
    let mut result: String = String::new();
    if action.nargs == HelpNargs::Zero {
        for (index, option_string) in action.option_strings.iter().enumerate() {
            if index > 0 {
                result.push_str(", ");
            }
            result.push_str(option_string);
        }
        return result;
    }
    let args_string: String = format_args(action, &action.dest.to_ascii_uppercase());
    for (index, option_string) in action.option_strings.iter().enumerate() {
        if index > 0 {
            result.push_str(", ");
        }
        result.push_str(option_string);
        result.push(' ');
        result.push_str(&args_string);
    }
    result
}

pub fn format_actions_usage(actions: &[&HelpAction<'_>]) -> String {
    let mut text: String = String::new();
    for action in actions {
        if action.help.is_suppressed() {
            continue;
        }
        let part: String = if !action.is_optional() {
            format_args(action, &action.dest)
        } else {
            let option_string: &str = &action.option_strings[0];
            let unbracketed: String = if action.nargs == HelpNargs::Zero {
                option_string.to_string()
            } else {
                format!("{} {}", option_string, format_args(action, &action.dest.to_ascii_uppercase()))
            };
            if action.required {
                unbracketed
            } else {
                format!("[{}]", unbracketed)
            }
        };
        if part.is_empty() {
            continue;
        }
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(&part);
    }
    clean_usage_separators(&text)
}

fn clean_usage_separators(text: &str) -> String {
    let without_space_after_open: String = remove_space_after_open_bracket(text);
    let without_space_before_close: String = remove_space_before_close_bracket(&without_space_after_open);
    let without_empty_brackets: String = remove_empty_pair(&without_space_before_close, b'[', b']');
    let without_empty_parens: String = remove_empty_pair(&without_empty_brackets, b'(', b')');
    let unwrapped: String = unwrap_single_parenthesized_groups(&without_empty_parens);
    super::text::trim_javascript_whitespace(&unwrapped).to_string()
}

fn remove_space_after_open_bracket(text: &str) -> String {
    let bytes: &[u8] = text.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index: usize = 0;
    while index < bytes.len() {
        output.push(bytes[index]);
        if (bytes[index] == b'[' || bytes[index] == b'(') && bytes.get(index + 1) == Some(&b' ') {
            index += 2;
        } else {
            index += 1;
        }
    }
    String::from_utf8(output).unwrap_or_default()
}

fn remove_space_before_close_bracket(text: &str) -> String {
    let bytes: &[u8] = text.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index: usize = 0;
    while index < bytes.len() {
        if bytes[index] == b' ' && matches!(bytes.get(index + 1), Some(b']') | Some(b')')) {
            output.push(bytes[index + 1]);
            index += 2;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).unwrap_or_default()
}

fn remove_empty_pair(text: &str, open: u8, close: u8) -> String {
    let bytes: &[u8] = text.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index: usize = 0;
    while index < bytes.len() {
        if bytes[index] == open {
            let mut lookahead: usize = index + 1;
            while lookahead < bytes.len() && bytes[lookahead] == b' ' {
                lookahead += 1;
            }
            if lookahead < bytes.len() && bytes[lookahead] == close {
                index = lookahead + 1;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(output).unwrap_or_default()
}

fn unwrap_single_parenthesized_groups(text: &str) -> String {
    let bytes: &[u8] = text.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index: usize = 0;
    while index < bytes.len() {
        if bytes[index] == b'(' {
            let group_end: usize = bytes[index + 1..]
                .iter()
                .position(|byte| *byte == b'|')
                .map_or(bytes.len(), |offset| index + 1 + offset);
            if let Some(offset) = bytes[index + 1..group_end].iter().rposition(|byte| *byte == b')') {
                let close_index: usize = index + 1 + offset;
                output.extend_from_slice(&bytes[index + 1..close_index]);
                index = close_index + 1;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(output).unwrap_or_default()
}
