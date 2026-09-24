use std::borrow::Cow;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HelpNargs {
    Single,
    Zero,
    ZeroOrMore,
    Parser,
    Remainder,
}

#[derive(Clone, Debug)]
pub enum HelpText<'a> {
    Absent,
    Suppressed,
    Text(Cow<'a, str>),
}

impl<'a> HelpText<'a> {
    pub fn is_suppressed(&self) -> bool {
        matches!(self, HelpText::Suppressed)
    }

    pub fn visible_text(&self) -> Option<&str> {
        match self {
            HelpText::Text(text) if !text.is_empty() => Some(text.as_ref()),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct HelpAction<'a> {
    pub option_strings: Vec<Cow<'a, str>>,
    pub dest: Cow<'a, str>,
    pub nargs: HelpNargs,
    pub metavar: Option<&'a str>,
    pub help: HelpText<'a>,
    pub choices: Option<Vec<&'a str>>,
    pub required: bool,
    pub subactions: Vec<HelpAction<'a>>,
}

impl<'a> HelpAction<'a> {
    pub fn is_optional(&self) -> bool {
        !self.option_strings.is_empty()
    }

    pub fn help_option() -> HelpAction<'static> {
        HelpAction {
            option_strings: vec![Cow::Borrowed("-h"), Cow::Borrowed("--help")],
            dest: Cow::Borrowed("==SUPPRESS=="),
            nargs: HelpNargs::Zero,
            metavar: None,
            help: HelpText::Text(Cow::Borrowed("Show this help message and exit.")),
            choices: None,
            required: false,
            subactions: Vec::new(),
        }
    }

    pub fn flag_option(option_string: &'a str, help: &'a str) -> HelpAction<'a> {
        HelpAction {
            option_strings: vec![Cow::Borrowed(option_string)],
            dest: Cow::Borrowed(option_string),
            nargs: HelpNargs::Zero,
            metavar: None,
            help: HelpText::Text(Cow::Borrowed(help)),
            choices: None,
            required: false,
            subactions: Vec::new(),
        }
    }

    pub fn hidden_option(option_string: Cow<'a, str>) -> HelpAction<'a> {
        HelpAction {
            dest: option_string.clone(),
            option_strings: vec![option_string],
            nargs: HelpNargs::ZeroOrMore,
            metavar: None,
            help: HelpText::Suppressed,
            choices: None,
            required: false,
            subactions: Vec::new(),
        }
    }
}

pub struct HelpGroup<'a> {
    pub title: Cow<'a, str>,
    pub action_indices: Vec<usize>,
}

pub struct HelpParser<'a> {
    pub prog: Cow<'a, str>,
    pub description: Option<Cow<'a, str>>,
    pub epilog: Option<Cow<'a, str>>,
    pub actions: Vec<HelpAction<'a>>,
    pub groups: Vec<HelpGroup<'a>>,
}

pub const BOLD_START: &str = "\u{1b}[1m";
pub const BOLD_END: &str = "\u{1b}[22m";

pub fn bold(text: &str) -> String {
    let mut output: String = String::with_capacity(text.len() + BOLD_START.len() + BOLD_END.len());
    output.push_str(BOLD_START);
    output.push_str(text);
    output.push_str(BOLD_END);
    output
}
