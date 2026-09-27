use super::actions::{select_phases_into, ActionTable};
use super::defined_parameter::DefinedParameter;
use super::model::CliModel;
use super::parameters::{collect_plugin_parameters, push_builtin_parameters, ROOT_PARAMETER_NAMES};
use super::registration::is_registration_possible;

#[derive(Default)]
pub struct PhaseActionCheck<'a> {
    parameters: Vec<DefinedParameter<'a>>,
    selected_phases: Vec<usize>,
    plugin_indices: Vec<usize>,
    plugins_by_scope: Vec<(&'a str, usize)>,
}

impl<'a> PhaseActionCheck<'a> {
    pub fn can_define_every_phase_action(model: &'a CliModel<'a>, table: &ActionTable<'a>) -> bool {
        let mut check: PhaseActionCheck<'a> = PhaseActionCheck::default();
        (0..model.phases.len()).all(|phase_index| check.can_define_phase_action(model, table, phase_index))
    }

    fn can_define_phase_action(&mut self, model: &'a CliModel<'a>, table: &ActionTable<'a>, phase_index: usize) -> bool {
        self.parameters.clear();
        push_builtin_parameters(&mut self.parameters, false);
        select_phases_into(table, [phase_index], &mut self.selected_phases);
        let parameters = &mut self.parameters;
        collect_plugin_parameters(parameters, model, &self.selected_phases, &mut self.plugin_indices, &mut self.plugins_by_scope).is_some()
            && is_registration_possible(parameters, &ROOT_PARAMETER_NAMES)
    }
}
