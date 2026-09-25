use std::borrow::Cow;

use super::model::CliModel;
use super::validate::is_valid_action_name;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ActionKind {
    Clean,
    Run,
    Phase(usize),
}

#[derive(Debug)]
pub struct ActionEntry<'a> {
    pub name: Cow<'a, str>,
    pub kind: ActionKind,
    pub watch: bool,
}

#[derive(Debug)]
pub struct AliasEntry<'a> {
    pub name: &'a str,
    pub target_index: usize,
    pub default_parameters: &'a [&'a str],
}

#[derive(Debug)]
pub struct ActionTable<'a> {
    pub actions: Vec<ActionEntry<'a>>,
    pub aliases: Vec<AliasEntry<'a>>,
    pub phase_dependencies: Vec<Vec<usize>>,
}

impl<'a> ActionTable<'a> {
    pub fn find_action(&self, name: &str) -> Option<usize> {
        self.actions.iter().position(|action| action.name == name)
    }

    pub fn find_alias(&self, name: &str) -> Option<&AliasEntry<'a>> {
        self.aliases.iter().find(|alias| alias.name == name)
    }

    pub fn command_names(&self) -> impl Iterator<Item = &str> {
        self.actions.iter().map(|action| action.name.as_ref()).chain(self.aliases.iter().map(|alias| alias.name))
    }

    fn try_add(&mut self, name: Cow<'a, str>, kind: ActionKind, watch: bool) -> bool {
        if !is_valid_action_name(&name) || self.find_action(&name).is_some() {
            return false;
        }
        self.actions.push(ActionEntry { name, kind, watch });
        true
    }
}

fn resolve_phase_dependencies(model: &CliModel<'_>) -> Option<Vec<Vec<usize>>> {
    let mut all_dependencies: Vec<Vec<usize>> = Vec::with_capacity(model.phases.len());
    for phase in &model.phases {
        let mut dependencies: Vec<usize> = Vec::with_capacity(phase.dependency_names.len());
        for dependency_name in &phase.dependency_names {
            let dependency_index: usize = model.find_phase_index(dependency_name)?;
            if !dependencies.contains(&dependency_index) {
                dependencies.push(dependency_index);
            }
        }
        all_dependencies.push(dependencies);
    }
    Some(all_dependencies)
}

pub fn build_action_table<'a>(model: &'a CliModel<'a>) -> Option<ActionTable<'a>> {
    let mut table: ActionTable<'a> = ActionTable {
        actions: Vec::with_capacity(3 + 2 * model.phases.len()),
        aliases: Vec::with_capacity(model.aliases.len()),
        phase_dependencies: resolve_phase_dependencies(model)?,
    };
    table.try_add(Cow::Borrowed("clean"), ActionKind::Clean, false);
    table.try_add(Cow::Borrowed("run"), ActionKind::Run, false);
    for (phase_index, phase) in model.phases.iter().enumerate() {
        if !table.try_add(Cow::Borrowed(phase.name), ActionKind::Phase(phase_index), false) {
            return None;
        }
    }
    if !table.try_add(Cow::Borrowed("run-watch"), ActionKind::Run, true) {
        return None;
    }
    for (phase_index, phase) in model.phases.iter().enumerate() {
        if !table.try_add(Cow::Owned(format!("{}-watch", phase.name)), ActionKind::Phase(phase_index), true) {
            return None;
        }
    }
    for alias in &model.aliases {
        let target_index: usize = table.find_action(alias.action_name)?;
        let is_duplicate: bool = table.find_action(alias.name).is_some() || table.find_alias(alias.name).is_some();
        if is_duplicate || !is_valid_action_name(alias.name) {
            return None;
        }
        table.aliases.push(AliasEntry { name: alias.name, target_index, default_parameters: &alias.default_parameters });
    }
    Some(table)
}

pub fn selected_phases_from(table: &ActionTable<'_>, seeds: impl IntoIterator<Item = usize>) -> Vec<usize> {
    let mut selected: Vec<usize> = Vec::new();
    for seed in seeds {
        if !selected.contains(&seed) {
            selected.push(seed);
        }
    }
    let mut cursor: usize = 0;
    while cursor < selected.len() {
        for dependency in &table.phase_dependencies[selected[cursor]] {
            if !selected.contains(dependency) {
                selected.push(*dependency);
            }
        }
        cursor += 1;
    }
    selected
}
