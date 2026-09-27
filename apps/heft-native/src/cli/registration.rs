use std::borrow::Cow;

use super::defined_parameter::DefinedParameter;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OptionTarget {
    Help,
    Ambiguous(usize),
    Parameter(usize),
}

#[derive(Debug)]
pub enum RegistrationStep<'a> {
    Parameter { parameter_index: usize, option_strings: Vec<Cow<'a, str>> },
    Ambiguous(Cow<'a, str>),
}

#[derive(Debug, Default)]
pub struct Registration<'a> {
    pub poisoned_parameters: Vec<usize>,
    pub steps: Vec<RegistrationStep<'a>>,
}

const HELP_OPTION_STRINGS: [&str; 2] = ["-h", "--help"];

impl<'a> Registration<'a> {
    fn find_target_matching(&self, matches: impl Fn(&str) -> bool) -> Option<OptionTarget> {
        if HELP_OPTION_STRINGS.iter().any(|option_string| matches(option_string)) {
            return Some(OptionTarget::Help);
        }
        for (step_index, step) in self.steps.iter().enumerate() {
            match step {
                RegistrationStep::Parameter { parameter_index, option_strings } => {
                    if option_strings.iter().any(|option_string| matches(option_string)) {
                        return Some(OptionTarget::Parameter(*parameter_index));
                    }
                }
                RegistrationStep::Ambiguous(name) if matches(name) => return Some(OptionTarget::Ambiguous(step_index)),
                RegistrationStep::Ambiguous(_) => {}
            }
        }
        None
    }

    pub fn find_target(&self, option_string: &str) -> Option<OptionTarget> {
        self.find_target_matching(|registered| registered == option_string)
    }

    pub fn is_prefix_of_any_option(&self, text: &str) -> bool {
        self.find_target_matching(|registered| registered.starts_with(text)).is_some()
    }

    pub fn registered_names(&self) -> impl Iterator<Item = &Cow<'a, str>> {
        self.steps.iter().flat_map(|step| match step {
            RegistrationStep::Parameter { option_strings, .. } => option_strings.as_slice(),
            RegistrationStep::Ambiguous(_) => &[],
        })
    }

    pub fn option_strings_of(&self, parameter_index: usize) -> Option<&[Cow<'a, str>]> {
        self.steps.iter().find_map(|step| match step {
            RegistrationStep::Parameter { parameter_index: index, option_strings } if *index == parameter_index => {
                Some(option_strings.as_slice())
            }
            _ => None,
        })
    }

    fn parameter_registered_as(&self, name: &str) -> Option<usize> {
        match self.find_target(name) {
            Some(OptionTarget::Parameter(parameter_index)) => Some(parameter_index),
            _ => None,
        }
    }
}

fn push_unique<'a>(names: &mut Vec<Cow<'a, str>>, name: Cow<'a, str>) {
    if !names.contains(&name) {
        names.push(name);
    }
}

fn count_short_name(parameters: &[DefinedParameter<'_>], short_name: &str) -> usize {
    parameters.iter().filter(|parameter| parameter.short_name == Some(short_name)).count()
}

fn count_long_name(parameters: &[DefinedParameter<'_>], long_name: &str) -> usize {
    parameters.iter().filter(|parameter| parameter.long_name == long_name).count()
}

pub fn try_register_parameters<'a>(parameters: &[DefinedParameter<'a>], parent_names: &[Cow<'a, str>]) -> Option<Registration<'a>> {
    let mut registration: Registration<'a> = Registration::default();
    let mut ambiguous_names: Vec<Cow<'a, str>> = Vec::new();
    for parameter in parameters {
        if let Some(short_name) = parameter.short_name.filter(|short_name| count_short_name(parameters, short_name) > 1) {
            push_unique(&mut ambiguous_names, Cow::Borrowed(short_name));
        }
    }
    let groups = (0..parameters.len()).filter(|first| parameters.iter().position(|other| other.long_name == parameters[*first].long_name) == Some(*first));
    let long_name_order = groups.flat_map(|first| (first..parameters.len()).filter(move |index| parameters[*index].long_name == parameters[first].long_name));
    for parameter_index in long_name_order {
        let parameter: &DefinedParameter<'a> = &parameters[parameter_index];
        let use_scoped_long_name: bool = count_long_name(parameters, parameter.long_name) > 1;
        if use_scoped_long_name {
            parameter.scope?;
            push_unique(&mut ambiguous_names, Cow::Borrowed(parameter.long_name));
        }
        let mut names: Vec<Cow<'a, str>> = Vec::with_capacity(3);
        if let Some(short_name) = parameter.short_name.filter(|short_name| count_short_name(parameters, short_name) == 1) {
            names.push(Cow::Borrowed(short_name));
        }
        if !use_scoped_long_name {
            names.push(Cow::Borrowed(parameter.long_name));
        }
        if let Some(scoped_long_name) = parameter.scoped_long_name() {
            names.push(Cow::Owned(scoped_long_name));
        }
        if names.iter().any(|name| registration.find_target(name).is_some()) {
            return None;
        }
        registration.steps.push(RegistrationStep::Parameter { parameter_index, option_strings: names });
    }
    for parent_name in parent_names {
        push_unique(&mut ambiguous_names, parent_name.clone());
    }
    for ambiguous_name in ambiguous_names {
        if let Some(parameter_index) = registration.parameter_registered_as(&ambiguous_name) {
            registration.poisoned_parameters.push(parameter_index);
        } else if registration.find_target(&ambiguous_name).is_some() {
            return None;
        } else {
            registration.steps.push(RegistrationStep::Ambiguous(ambiguous_name));
        }
    }
    Some(registration)
}

pub fn is_registration_possible(parameters: &[DefinedParameter<'_>], parent_names: &[Cow<'_, str>]) -> bool {
    let is_help_option = |name: &str| HELP_OPTION_STRINGS.contains(&name);
    for (index, parameter) in parameters.iter().enumerate() {
        if parameter.scope.is_none() && count_long_name(parameters, parameter.long_name) > 1 {
            return false;
        }
        if parameter.short_name.is_some_and(is_help_option) || is_help_option(parameter.long_name) {
            return false;
        }
        if let Some(scope) = parameter.scope {
            let earlier = &parameters[..index];
            if earlier.iter().any(|other| other.scope == Some(scope) && other.long_name == parameter.long_name) {
                return false;
            }
        }
    }
    !parent_names.iter().any(|name| is_help_option(name))
}
