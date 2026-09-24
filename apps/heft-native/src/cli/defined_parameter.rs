use std::borrow::Cow;

use super::model::{DefaultValue, ParameterKind};
use super::text::{format_javascript_integer, is_javascript_whitespace, push_json_string};

#[derive(Clone, Debug)]
pub struct DefinedParameter<'a> {
    pub kind: ParameterKind,
    pub long_name: &'a str,
    pub short_name: Option<&'a str>,
    pub scope: Option<&'a str>,
    pub scoping_group: bool,
    pub required: bool,
    pub argument_name: Option<&'a str>,
    pub alternatives: Vec<&'a str>,
    pub default_value: Option<DefaultValue<'a>>,
    pub description: Cow<'a, str>,
}

impl<'a> DefinedParameter<'a> {
    pub fn flag(long_name: &'a str, short_name: Option<&'a str>, description: Cow<'a, str>) -> Self {
        DefinedParameter {
            kind: ParameterKind::Flag,
            long_name,
            short_name,
            scope: None,
            scoping_group: false,
            required: false,
            argument_name: None,
            alternatives: Vec::new(),
            default_value: None,
            description,
        }
    }

    pub fn string_list(long_name: &'a str, argument_name: &'a str, description: Cow<'a, str>, scoping: bool) -> Self {
        DefinedParameter {
            kind: ParameterKind::StringList,
            argument_name: Some(argument_name),
            scoping_group: scoping,
            ..DefinedParameter::flag(long_name, None, description)
        }
    }

    pub fn scoped_long_name(&self) -> Option<String> {
        self.scope.map(|scope| format!("--{}:{}", scope, &self.long_name[2..]))
    }

    pub fn help_text(&self) -> Option<Cow<'a, str>> {
        let mut notes: Vec<String> = Vec::new();
        match (self.kind, self.default_value) {
            (ParameterKind::Choice, Some(DefaultValue::Text(value))) => {
                notes.push(format!("The default value is \"{}\".", value));
            }
            (ParameterKind::Integer, Some(DefaultValue::Number(value))) => {
                notes.push(format!("The default value is {}.", format_javascript_integer(value)?));
            }
            (ParameterKind::String, Some(DefaultValue::Text(value))) => {
                if value.len() < 160 {
                    let mut note: String = String::from("The default value is ");
                    if !push_json_string(&mut note, value) {
                        return None;
                    }
                    note.push('.');
                    notes.push(note);
                }
            }
            (_, None) => {}
            _ => return None,
        }
        if notes.is_empty() {
            return Some(self.description.clone());
        }
        let mut final_description: String = self.description.to_string();
        if ends_with_word_character_before_whitespace(&final_description) {
            let trimmed_length: usize = final_description.trim_end_matches(is_trimmed_character).len();
            final_description.truncate(trimmed_length);
            final_description.push('.');
        }
        final_description.push(' ');
        final_description.push_str(&notes.join(" "));
        Some(Cow::Owned(final_description))
    }
}

fn is_trimmed_character(character: char) -> bool {
    character.is_ascii() && is_javascript_whitespace(character as u8)
}

fn ends_with_word_character_before_whitespace(text: &str) -> bool {
    let trimmed: &str = text.trim_end_matches(is_trimmed_character);
    let without_quote: &str = trimmed.strip_suffix('"').unwrap_or(trimmed);
    without_quote.bytes().last().is_some_and(|byte| byte.is_ascii_alphanumeric())
}
