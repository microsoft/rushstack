use super::defined_parameter::DefinedParameter;
use super::model::ParameterKind;
use super::registration::{OptionTarget, Registration};
use super::text::is_javascript_whitespace;
use super::validate::is_valid_long_name;

#[derive(Clone, Debug, PartialEq)]
pub enum ParameterValue<'s> {
    Absent,
    Flag,
    Text(&'s str),
    Integer(i64),
    TextList(Vec<&'s str>),
    IntegerList(Vec<i64>),
}

#[derive(Debug, PartialEq)]
pub enum ArgumentError<'s> {
    ExpectedOneArgument(usize),
    InvalidChoice(usize, &'s str),
    InvalidInteger(usize, &'s str),
    Required(usize),
    Unrecognized(Vec<&'s str>),
    Ambiguous(usize),
}

#[derive(Debug, PartialEq)]
pub enum ParseOutcome<'s> {
    Parsed { values: Vec<ParameterValue<'s>>, remainder_start: Option<usize> },
    Help,
    Failed(ArgumentError<'s>),
    Delegate,
}

enum IntegerCheck {
    Valid(i64),
    Invalid,
    Unknown,
}

fn check_integer(text: &str) -> IntegerCheck {
    let bytes: &[u8] = text.as_bytes();
    if !bytes.is_empty() && bytes.len() <= 15 && bytes.iter().all(u8::is_ascii_digit) {
        return text.parse::<i64>().map_or(IntegerCheck::Unknown, IntegerCheck::Valid);
    }
    match bytes.first() {
        Some(first) if first.is_ascii() && !first.is_ascii_digit() && !is_javascript_whitespace(*first) && *first != b'+' && *first != b'-' => {
            IntegerCheck::Invalid
        }
        _ => IntegerCheck::Unknown,
    }
}

enum Consumed<'s> {
    Continue,
    Stop(ParseOutcome<'s>),
}

fn store_value<'s>(parameter_index: usize, parameter: &DefinedParameter<'_>, raw: &'s str, values: &mut [ParameterValue<'s>]) -> Consumed<'s> {
    let slot: &mut ParameterValue<'s> = &mut values[parameter_index];
    let integer: Option<i64> = if parameter.kind.is_integer() {
        match check_integer(raw) {
            IntegerCheck::Valid(value) => Some(value),
            IntegerCheck::Invalid => return Consumed::Stop(ParseOutcome::Failed(ArgumentError::InvalidInteger(parameter_index, raw))),
            IntegerCheck::Unknown => return Consumed::Stop(ParseOutcome::Delegate),
        }
    } else {
        None
    };
    if parameter.kind.has_alternatives() && !parameter.alternatives.contains(&raw) {
        return Consumed::Stop(ParseOutcome::Failed(ArgumentError::InvalidChoice(parameter_index, raw)));
    }
    match (parameter.kind.is_list(), &mut *slot, integer) {
        (false, ParameterValue::Absent, Some(value)) => *slot = ParameterValue::Integer(value),
        (false, ParameterValue::Absent, None) => *slot = ParameterValue::Text(raw),
        (true, ParameterValue::Absent, Some(value)) => *slot = ParameterValue::IntegerList(vec![value]),
        (true, ParameterValue::Absent, None) => *slot = ParameterValue::TextList(vec![raw]),
        (true, ParameterValue::IntegerList(list), Some(value)) => list.push(value),
        (true, ParameterValue::TextList(list), None) => list.push(raw),
        _ => return Consumed::Stop(ParseOutcome::Delegate),
    }
    Consumed::Continue
}

pub fn parse_arguments<'s>(
    registration: &Registration,
    parameters: &[DefinedParameter<'_>],
    args: &[&'s str],
    allow_remainder: bool,
) -> ParseOutcome<'s> {
    let mut values: Vec<ParameterValue<'s>> = vec![ParameterValue::Absent; parameters.len()];
    let mut extras: Vec<&'s str> = Vec::new();
    let mut remainder_start: Option<usize> = None;
    let mut first_ambiguous_step: Option<usize> = None;
    let mut index: usize = 0;
    while index < args.len() {
        let token: &'s str = args[index];
        if allow_remainder && token == "--" {
            remainder_start = Some(index);
            break;
        }
        index += 1;
        match registration.find_target(token) {
            Some(OptionTarget::Help) => return ParseOutcome::Help,
            Some(OptionTarget::Ambiguous(step_index)) => {
                first_ambiguous_step = Some(first_ambiguous_step.map_or(step_index, |first| first.min(step_index)));
                while index < args.len() && !args[index].starts_with('-') {
                    if args[index].is_empty() {
                        return ParseOutcome::Delegate;
                    }
                    index += 1;
                }
            }
            Some(OptionTarget::Parameter(parameter_index)) => {
                if registration.poisoned_parameters.contains(&parameter_index) {
                    return ParseOutcome::Delegate;
                }
                let parameter: &DefinedParameter<'_> = &parameters[parameter_index];
                if parameter.kind == ParameterKind::Flag {
                    values[parameter_index] = ParameterValue::Flag;
                    continue;
                }
                let raw: &'s str = match args.get(index) {
                    None => return ParseOutcome::Failed(ArgumentError::ExpectedOneArgument(parameter_index)),
                    Some(raw) if raw.starts_with('-') || raw.is_empty() => return ParseOutcome::Delegate,
                    Some(raw) => raw,
                };
                index += 1;
                if let Consumed::Stop(outcome) = store_value(parameter_index, parameter, raw, &mut values) {
                    return outcome;
                }
            }
            None if token.starts_with('-') && token.contains('=') => {
                let Some((name, value)) = token.split_once('=') else {
                    return ParseOutcome::Delegate;
                };
                let Some(OptionTarget::Parameter(parameter_index)) = registration.find_target(name) else {
                    return ParseOutcome::Delegate;
                };
                let parameter: &DefinedParameter<'_> = &parameters[parameter_index];
                let is_poisoned: bool = registration.poisoned_parameters.contains(&parameter_index);
                if is_poisoned || parameter.kind == ParameterKind::Flag || value.is_empty() {
                    return ParseOutcome::Delegate;
                }
                if let Consumed::Stop(outcome) = store_value(parameter_index, parameter, value, &mut values) {
                    return outcome;
                }
            }
            None if token.starts_with('-') => {
                if !is_valid_long_name(token) || registration.is_prefix_of_any_option(token) {
                    return ParseOutcome::Delegate;
                }
                extras.push(token);
            }
            None if token.is_empty() => return ParseOutcome::Delegate,
            None if allow_remainder => {
                remainder_start = Some(index - 1);
                break;
            }
            None => extras.push(token),
        }
    }
    if let Some(missing_index) = (0..parameters.len()).find(|index| parameters[*index].required && values[*index] == ParameterValue::Absent) {
        return ParseOutcome::Failed(ArgumentError::Required(missing_index));
    }
    if !extras.is_empty() {
        return ParseOutcome::Failed(ArgumentError::Unrecognized(extras));
    }
    if let Some(step_index) = first_ambiguous_step {
        return ParseOutcome::Failed(ArgumentError::Ambiguous(step_index));
    }
    ParseOutcome::Parsed { values, remainder_start }
}
