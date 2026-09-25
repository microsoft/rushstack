#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ParameterKind {
    Flag,
    String,
    StringList,
    Integer,
    IntegerList,
    Choice,
    ChoiceList,
}

impl ParameterKind {
    pub fn takes_argument(self) -> bool {
        !matches!(self, ParameterKind::Flag)
    }

    pub fn is_list(self) -> bool {
        matches!(
            self,
            ParameterKind::StringList | ParameterKind::IntegerList | ParameterKind::ChoiceList
        )
    }

    pub fn has_alternatives(self) -> bool {
        matches!(self, ParameterKind::Choice | ParameterKind::ChoiceList)
    }

    pub fn is_integer(self) -> bool {
        matches!(self, ParameterKind::Integer | ParameterKind::IntegerList)
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DefaultValue<'a> {
    Text(&'a str),
    Number(f64),
}

#[derive(Clone, Debug)]
pub struct PluginParameterDefinition<'a> {
    pub kind: ParameterKind,
    pub long_name: &'a str,
    pub short_name: Option<&'a str>,
    pub description: &'a str,
    pub required: bool,
    pub argument_name: Option<&'a str>,
    pub alternatives: Vec<&'a str>,
    pub default_value: Option<DefaultValue<'a>>,
}

#[derive(Clone, Debug)]
pub struct PluginModel<'a> {
    #[allow(dead_code)]
    pub plugin_name: &'a str,
    #[allow(dead_code)]
    pub package_name: &'a str,
    pub parameter_scope: &'a str,
    pub parameters: Vec<PluginParameterDefinition<'a>>,
}

#[derive(Clone, Debug)]
pub struct PhaseModel<'a> {
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub dependency_names: Vec<&'a str>,
    pub task_plugin_indices: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct AliasModel<'a> {
    pub name: &'a str,
    pub action_name: &'a str,
    pub default_parameters: Vec<&'a str>,
}

#[derive(Clone, Debug, Default)]
pub struct CliModel<'a> {
    pub phases: Vec<PhaseModel<'a>>,
    pub aliases: Vec<AliasModel<'a>>,
    pub lifecycle_plugin_indices: Vec<usize>,
    pub plugins: Vec<PluginModel<'a>>,
    pub debug_messages: Vec<&'a str>,
}

impl<'a> CliModel<'a> {
    pub fn find_phase_index(&self, phase_name: &str) -> Option<usize> {
        self.phases.iter().position(|phase| phase.name == phase_name)
    }
}
