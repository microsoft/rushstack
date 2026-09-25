use std::fmt::Write;

use crate::json::write_json_string_for_javascript;

use super::actions::ActionKind;
use super::outcome::{ParsedCommand, ParsedParameters};
use super::parse::ParameterValue;

fn write_string(output: &mut String, text: &str) {
    let _ = write_json_string_for_javascript(text, output);
}

fn write_value(output: &mut String, value: &ParameterValue<'_>) {
    match value {
        ParameterValue::Absent => output.push_str("null"),
        ParameterValue::Flag => output.push_str("true"),
        ParameterValue::Text(text) => write_string(output, text),
        ParameterValue::Integer(number) => {
            let _ = write!(output, "{number}");
        }
        ParameterValue::TextList(items) => {
            output.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_string(output, item);
            }
            output.push(']');
        }
        ParameterValue::IntegerList(numbers) => {
            output.push('[');
            for (index, number) in numbers.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                let _ = write!(output, "{number}");
            }
            output.push(']');
        }
    }
}

fn write_values(output: &mut String, parameters: &ParsedParameters<'_>) {
    output.push('[');
    for (index, (definition, value)) in parameters.definitions.iter().zip(&parameters.values).enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push('[');
        match definition.scoped_long_name() {
            Some(scoped_long_name) => write_string(output, &scoped_long_name),
            None => write_string(output, definition.long_name),
        }
        output.push(',');
        write_value(output, value);
        output.push(']');
    }
    output.push(']');
}

impl ParsedCommand<'_> {
    pub fn write_plan_command(&self, output: &mut String) -> bool {
        if !self.parsed_like_v2_lean_parser {
            return false;
        }
        let scoped_parameters: Option<&ParsedParameters<'_>> = match (self.action_kind, self.phase_name) {
            (ActionKind::Phase(_), Some(_)) => None,
            (ActionKind::Run, _) if self.scoped_parameters.is_some() => self.scoped_parameters.as_ref(),
            _ => return false,
        };
        output.push_str("{\"commandName\":");
        write_string(output, self.command_name);
        output.push_str(",\"unaliasedCommandName\":");
        write_string(output, &self.unaliased_command_name);
        match self.phase_name {
            Some(phase_name) if scoped_parameters.is_none() => {
                output.push_str(",\"actionKind\":\"phase\",\"phaseName\":");
                write_string(output, phase_name);
            }
            _ => output.push_str(",\"actionKind\":\"run\""),
        }
        output.push_str(if self.watch { ",\"watch\":true,\"values\":" } else { ",\"watch\":false,\"values\":" });
        write_values(output, &self.parameters);
        if let Some(scoped_parameters) = scoped_parameters {
            output.push_str(",\"remainder\":");
            write_value(output, &ParameterValue::TextList(self.remainder.clone()));
            output.push_str(",\"scopedValues\":");
            write_values(output, scoped_parameters);
        }
        if let Some(message) = &self.alias_expansion_message {
            output.push_str(",\"aliasExpansionMessage\":");
            write_string(output, message);
        }
        output.push('}');
        true
    }
}
