use super::help_args::format_action_invocation;
use super::help_lines::{fill_help_text, for_each_help_line};
use super::help_model::{HelpAction, HelpParser};
use super::help_usage::format_usage;
use super::text::push_spaces;

const MAX_HELP_POSITION: f64 = 24.0;

fn action_invocations(action: &HelpAction<'_>) -> Vec<String> {
    if action.help.is_suppressed() {
        return Vec::new();
    }
    let mut invocations: Vec<String> = Vec::with_capacity(1 + action.subactions.len());
    invocations.push(format_action_invocation(action));
    invocations.extend(action.subactions.iter().map(format_action_invocation));
    invocations
}

fn compute_action_max_length(invocations: &[Vec<String>]) -> f64 {
    let longest: Option<usize> = invocations.iter().flatten().map(String::len).max();
    longest.map_or(0.0, |length| length as f64 + 2.0)
}

struct ActionLayout {
    width: f64,
    action_max_length: f64,
}

fn format_action(output: &mut String, action: &HelpAction<'_>, invocations: &[String], current_indent: f64, layout: &ActionLayout) {
    let help_position: f64 = (layout.action_max_length + 2.0).min(MAX_HELP_POSITION);
    let help_width: f64 = layout.width - help_position;
    let action_width: f64 = help_position - current_indent - 2.0;
    let header: &str = &invocations[0];
    let help_text: Option<&str> = action.help.visible_text();
    let mut indent_first: f64 = 0.0;
    push_spaces(output, current_indent);
    output.push_str(header);
    match help_text {
        None => output.push('\n'),
        Some(_) if header.len() as f64 <= action_width => {
            output.push_str("  ");
            push_spaces(output, action_width - header.len() as f64);
        }
        Some(_) => {
            output.push('\n');
            indent_first = help_position;
        }
    }
    if let Some(text) = help_text {
        for_each_help_line(text, help_width, |line_index, line| {
            push_spaces(output, if line_index == 0 { indent_first } else { help_position });
            output.push_str(line);
            output.push('\n');
        });
    }
    for (subaction_index, subaction) in action.subactions.iter().enumerate() {
        format_action(output, subaction, &invocations[1 + subaction_index..], current_indent + 2.0, layout);
    }
}

fn format_text_block(output: &mut String, text: &str, width: f64) {
    fill_help_text(output, text, width, "");
    output.push_str("\n\n");
}

fn is_usage_text_ascii(action: &HelpAction<'_>) -> bool {
    action.option_strings.iter().all(|option_string| option_string.is_ascii())
        && action.dest.is_ascii()
        && action.metavar.is_none_or(str::is_ascii)
        && action.choices.as_ref().is_none_or(|choices| choices.iter().all(|choice| choice.is_ascii()))
}

fn is_action_text_ascii(action: &HelpAction<'_>) -> bool {
    is_usage_text_ascii(action)
        && action.help.visible_text().is_none_or(str::is_ascii)
        && action.subactions.iter().all(is_action_text_ascii)
}

fn is_parser_text_ascii(parser: &HelpParser<'_>) -> bool {
    parser.prog.is_ascii()
        && parser.description.as_deref().is_none_or(str::is_ascii)
        && parser.epilog.as_deref().is_none_or(str::is_ascii)
        && parser.actions.iter().all(is_action_text_ascii)
}

pub fn format_help(parser: &HelpParser<'_>, width: f64) -> Option<String> {
    if !is_parser_text_ascii(parser) {
        return None;
    }
    let invocations: Vec<Vec<String>> = parser.actions.iter().map(action_invocations).collect();
    let layout: ActionLayout = ActionLayout { width, action_max_length: compute_action_max_length(&invocations) };
    let mut help: String = format_usage(&parser.prog, &parser.actions, width)?;
    if let Some(description) = parser.description.as_deref().filter(|text| !text.is_empty()) {
        format_text_block(&mut help, description, width);
    }
    for group in &parser.groups {
        let mut section: String = String::new();
        for action_index in &group.action_indices {
            let action: &HelpAction<'_> = &parser.actions[*action_index];
            if !action.help.is_suppressed() {
                format_action(&mut section, action, &invocations[*action_index], 2.0, &layout);
            }
        }
        if !section.is_empty() {
            help.push('\n');
            help.push_str(&group.title);
            help.push_str(":\n");
            help.push_str(&section);
            help.push('\n');
        }
    }
    if let Some(epilog) = parser.epilog.as_deref().filter(|text| !text.is_empty()) {
        format_text_block(&mut help, epilog, width);
    }
    Some(finish_help(help))
}

fn finish_help(help: String) -> String {
    let mut collapsed: String = String::with_capacity(help.len());
    let mut newline_run: usize = 0;
    for character in help.chars() {
        if character == '\n' {
            newline_run += 1;
            continue;
        }
        push_newlines(&mut collapsed, newline_run);
        newline_run = 0;
        collapsed.push(character);
    }
    push_newlines(&mut collapsed, newline_run);
    let trimmed: &str = collapsed.trim_matches('\n');
    let mut result: String = String::with_capacity(trimmed.len() + 1);
    result.push_str(trimmed);
    result.push('\n');
    result
}

fn push_newlines(output: &mut String, count: usize) {
    for _ in 0..count.min(2) {
        output.push('\n');
    }
}

pub fn format_usage_only(parser: &HelpParser<'_>, width: f64) -> Option<String> {
    if !parser.prog.is_ascii() || !parser.actions.iter().all(is_usage_text_ascii) {
        return None;
    }
    let usage: String = format_usage(&parser.prog, &parser.actions, width)?;
    Some(finish_help(usage))
}
