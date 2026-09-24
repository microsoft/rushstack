use super::help_args::format_actions_usage;
use super::help_model::HelpAction;

fn find_closing(bytes: &[u8], start: usize, close: u8) -> Option<usize> {
    let mut index: usize = start + 1;
    while index < bytes.len() {
        if bytes[index] == close {
            let mut end: usize = index + 1;
            while end < bytes.len() && bytes[end] == close {
                end += 1;
            }
            return Some(end);
        }
        index += 1;
    }
    None
}

pub fn split_usage_parts(text: &str) -> Vec<&str> {
    let bytes: &[u8] = text.as_bytes();
    let mut parts: Vec<&str> = Vec::new();
    let mut index: usize = 0;
    while index < bytes.len() {
        if super::text::is_javascript_whitespace(bytes[index]) {
            index += 1;
            continue;
        }
        let grouped_end: Option<usize> = match bytes[index] {
            b'(' => find_closing(bytes, index, b')'),
            b'[' => find_closing(bytes, index, b']'),
            _ => None,
        };
        let end: usize = grouped_end.unwrap_or_else(|| {
            let mut end: usize = index;
            while end < bytes.len() && !super::text::is_javascript_whitespace(bytes[end]) {
                end += 1;
            }
            end
        });
        parts.push(&text[index..end]);
        index = end;
    }
    parts
}

fn collect_wrapped_lines(parts: &[&str], indent: &str, prefix: Option<&str>, text_width: f64) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut line: Vec<&str> = Vec::new();
    let mut line_length: f64 = prefix.map_or(indent.len(), str::len) as f64 - 1.0;
    for part in parts {
        if line_length + 1.0 + part.len() as f64 > text_width {
            lines.push(format!("{}{}", indent, line.join(" ")));
            line.clear();
            line_length = indent.len() as f64 - 1.0;
        }
        line.push(part);
        line_length += part.len() as f64 + 1.0;
    }
    lines.push(format!("{}{}", indent, line.join(" ")));
    if prefix.is_some() {
        let first: String = lines[0].get(indent.len()..).unwrap_or("").to_string();
        lines[0] = first;
    }
    lines
}

pub fn format_usage(prog: &str, actions: &[HelpAction<'_>], width: f64) -> Option<String> {
    let prefix: &str = "usage: ";
    let optionals: Vec<&HelpAction<'_>> = actions.iter().filter(|action| action.is_optional()).collect();
    let positionals: Vec<&HelpAction<'_>> = actions.iter().filter(|action| !action.is_optional()).collect();
    let mut ordered: Vec<&HelpAction<'_>> = Vec::with_capacity(actions.len());
    ordered.extend(optionals.iter().copied());
    ordered.extend(positionals.iter().copied());
    let action_usage: String = format_actions_usage(&ordered);
    let mut usage: String = if actions.is_empty() { prog.to_string() } else { format!("{} {}", prog, action_usage) };
    let text_width: f64 = width;
    if !actions.is_empty() && (prefix.len() + usage.len()) as f64 > text_width {
        let optional_usage: String = format_actions_usage(&optionals);
        let positional_usage: String = format_actions_usage(&positionals);
        let optional_parts: Vec<&str> = split_usage_parts(&optional_usage);
        let positional_parts: Vec<&str> = split_usage_parts(&positional_usage);
        if optional_parts.is_empty() || optional_parts.join(" ") != optional_usage || positional_parts.join(" ") != positional_usage {
            return None;
        }
        let lines: Vec<String> = if (prefix.len() + prog.len()) as f64 <= 0.75 * text_width {
            let indent: String = " ".repeat(prefix.len() + prog.len() + 1);
            let mut first_parts: Vec<&str> = Vec::with_capacity(optional_parts.len() + 1);
            first_parts.push(prog);
            first_parts.extend(optional_parts.iter().copied());
            let mut lines: Vec<String> = collect_wrapped_lines(&first_parts, &indent, Some(prefix), text_width);
            lines.extend(collect_wrapped_lines(&positional_parts, &indent, None, text_width));
            lines
        } else {
            let indent: String = " ".repeat(prefix.len());
            let mut all_parts: Vec<&str> = optional_parts.clone();
            all_parts.extend(positional_parts.iter().copied());
            let mut lines: Vec<String> = collect_wrapped_lines(&all_parts, &indent, None, text_width);
            if lines.len() > 1 {
                lines = collect_wrapped_lines(&optional_parts, &indent, None, text_width);
                lines.extend(collect_wrapped_lines(&positional_parts, &indent, None, text_width));
            }
            let mut with_prog: Vec<String> = Vec::with_capacity(lines.len() + 1);
            with_prog.push(prog.to_string());
            with_prog.extend(lines);
            with_prog
        };
        usage = lines.join("\n");
    }
    Some(format!("{}{}\n\n", prefix, usage))
}
