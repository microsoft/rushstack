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

fn long_name_order<'p>(parameters: &'p [DefinedParameter<'_>]) -> impl Iterator<Item = usize> + 'p {
    let first_index_of = |long_name: &str| parameters.iter().position(|parameter| parameter.long_name == long_name);
    (0..parameters.len())
        .filter(move |index| first_index_of(parameters[*index].long_name) == Some(*index))
        .flat_map(move |first| (first..parameters.len()).filter(move |index| parameters[*index].long_name == parameters[first].long_name))
}

pub fn try_register_parameters<'a>(parameters: &[DefinedParameter<'a>], parent_names: &[Cow<'a, str>]) -> Option<Registration<'a>> {
    let mut registration: Registration<'a> = Registration::default();
    let mut ambiguous_names: Vec<Cow<'a, str>> = Vec::new();
    for parameter in parameters {
        if let Some(short_name) = parameter.short_name.filter(|short_name| count_short_name(parameters, short_name) > 1) {
            push_unique(&mut ambiguous_names, Cow::Borrowed(short_name));
        }
    }
    for parameter_index in long_name_order(parameters) {
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
