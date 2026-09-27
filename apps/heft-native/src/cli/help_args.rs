use super::help_model::{HelpAction, HelpNargs};

fn push_metavar(output: &mut String, action: &HelpAction<'_>, uppercase_default: bool) {
    if let Some(metavar) = action.metavar {
        output.push_str(metavar);
        return;
    }
    if let Some(choices) = action.choices {
        output.push('{');
        for (choice_index, choice) in choices.iter().enumerate() {
            if choice_index > 0 {
                output.push(',');
            }
            output.push_str(choice);
        }
        output.push('}');
        return;
    }
    if uppercase_default {
        output.extend(action.dest.chars().map(|character| character.to_ascii_uppercase()));
    } else {
        output.push_str(&action.dest);
    }
}

fn push_args(output: &mut String, action: &HelpAction<'_>, uppercase_default: bool) {
    match action.nargs {
        HelpNargs::Single | HelpNargs::Zero => push_metavar(output, action, uppercase_default),
        HelpNargs::ZeroOrMore => {
            output.push('[');
            push_metavar(output, action, uppercase_default);
            output.push_str(" [");
            push_metavar(output, action, uppercase_default);
            output.push_str(" ...]]");
        }
        HelpNargs::Remainder => output.push_str("..."),
        HelpNargs::Parser => {
            push_metavar(output, action, uppercase_default);
            output.push_str(" ...");
        }
    }
}

pub fn push_action_invocation(output: &mut String, action: &HelpAction<'_>) {
    if !action.is_optional() {
        push_metavar(output, action, false);
        return;
    }
    for (index, option_string) in action.option_strings.iter().enumerate() {
        if index > 0 {
            output.push_str(", ");
        }
        output.push_str(option_string);
        if action.nargs != HelpNargs::Zero {
            output.push(' ');
            push_args(output, action, true);
        }
    }
}

pub fn format_actions_usage(actions: &[&HelpAction<'_>]) -> String {
    let mut text: String = String::new();
    for action in actions {
        if action.help.is_suppressed() {
            continue;
        }
        let separator_start: usize = text.len();
        if !text.is_empty() {
            text.push(' ');
        }
        let part_start: usize = text.len();
        if !action.is_optional() {
            push_args(&mut text, action, false);
        } else {
            if !action.required {
                text.push('[');
            }
            text.push_str(&action.option_strings[0]);
            if action.nargs != HelpNargs::Zero {
                text.push(' ');
                push_args(&mut text, action, true);
            }
            if !action.required {
                text.push(']');
            }
        }
        if text.len() == part_start {
            text.truncate(separator_start);
        }
    }
    clean_usage_separators(&text)
}

pub fn clean_usage_separators(text: &str) -> String {
    if !["(", "[ ", " ]", " )", "[]"].iter().any(|pattern| text.contains(pattern)) {
        return super::text::trim_javascript_whitespace(text).to_string();
    }
    clean_usage_separators_in_every_pass(text)
}

pub fn clean_usage_separators_in_every_pass(text: &str) -> String {
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
