use super::help_args::push_action_invocation;
use super::help_lines::{fill_help_text, for_each_help_line};
use super::help_model::{HelpAction, HelpParser};
use super::help_usage::push_usage;
use super::text::push_spaces;

const MAX_HELP_POSITION: f64 = 24.0;

fn compute_action_max_length(actions: &[HelpAction<'_>], scratch: &mut String) -> f64 {
    let mut longest: Option<usize> = None;
    for action in actions.iter().filter(|action| !action.help.is_suppressed()) {
        for measured_action in std::iter::once(action).chain(action.subactions.iter()) {
            scratch.clear();
            push_action_invocation(scratch, measured_action);
            longest = Some(longest.map_or(scratch.len(), |length| length.max(scratch.len())));
        }
    }
    scratch.clear();
    longest.map_or(0.0, |length| length as f64 + 2.0)
}

struct ActionLayout {
    width: f64,
    action_max_length: f64,
}

fn format_action(output: &mut String, action: &HelpAction<'_>, current_indent: f64, layout: &ActionLayout) {
    let help_position: f64 = (layout.action_max_length + 2.0).min(MAX_HELP_POSITION);
    let help_width: f64 = layout.width - help_position;
    let action_width: f64 = help_position - current_indent - 2.0;
    let help_text: Option<&str> = action.help.visible_text();
    let mut indent_first: f64 = 0.0;
    push_spaces(output, current_indent);
    let header_start: usize = output.len();
    push_action_invocation(output, action);
    let header_length: f64 = (output.len() - header_start) as f64;
    match help_text {
        None => output.push('\n'),
        Some(_) if header_length <= action_width => {
            output.push_str("  ");
            push_spaces(output, action_width - header_length);
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
    for subaction in &action.subactions {
        format_action(output, subaction, current_indent + 2.0, layout);
    }
}

fn estimated_help_length(parser: &HelpParser<'_>) -> usize {
    let text_length = |action: &HelpAction<'_>| action.help.visible_text().map_or(0, str::len) * 3 / 2 + 64;
    let actions: usize = parser.actions.iter().map(|action| text_length(action) + action.subactions.iter().map(text_length).sum::<usize>()).sum();
    let texts: usize = parser.description.as_deref().map_or(0, str::len) + parser.epilog.as_deref().map_or(0, str::len);
    512 + parser.prog.len() * 8 + texts * 3 / 2 + actions
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
    let mut help: String = String::with_capacity(estimated_help_length(parser));
    let layout: ActionLayout = ActionLayout { width, action_max_length: compute_action_max_length(&parser.actions, &mut help) };
    push_usage(&mut help, &parser.prog, &parser.actions, width)?;
    if let Some(description) = parser.description.as_deref().filter(|text| !text.is_empty()) {
        format_text_block(&mut help, description, width);
    }
    for group in &parser.groups {
        let section_start: usize = help.len();
        help.push('\n');
        help.push_str(&group.title);
        help.push_str(":\n");
        let content_start: usize = help.len();
        for action_index in &group.action_indices {
            let action: &HelpAction<'_> = &parser.actions[*action_index];
            if !action.help.is_suppressed() {
                format_action(&mut help, action, 2.0, &layout);
            }
        }
        if help.len() == content_start {
            help.truncate(section_start);
        } else {
            help.push('\n');
        }
    }
    if let Some(epilog) = parser.epilog.as_deref().filter(|text| !text.is_empty()) {
        format_text_block(&mut help, epilog, width);
    }
    finish_help(&mut help);
    Some(help)
}

fn finish_help(help: &mut String) {
    let mut newline_run: usize = 0;
    help.retain(|character| {
        newline_run = if character == '\n' { newline_run + 1 } else { 0 };
        newline_run <= 2
    });
    let leading_newlines: usize = help.len() - help.trim_start_matches('\n').len();
    help.drain(..leading_newlines);
    let trimmed_length: usize = help.trim_end_matches('\n').len();
    help.truncate(trimmed_length);
    help.push('\n');
}

pub fn format_usage_only(parser: &HelpParser<'_>, width: f64) -> Option<String> {
    if !parser.prog.is_ascii() || !parser.actions.iter().all(is_usage_text_ascii) {
        return None;
    }
    let mut usage: String = String::with_capacity(256 + parser.prog.len() * 8 + parser.actions.len() * 48);
    push_usage(&mut usage, &parser.prog, &parser.actions, width)?;
    finish_help(&mut usage);
    Some(usage)
}
