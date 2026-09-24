use super::action_invocation::ActionRequest;
use super::actions::selected_phases_from;
use super::defined_parameter::DefinedParameter;
use super::parse::ParameterValue;

pub fn phase_names<'v, 'a>(values: &'v [ParameterValue<'a>], index: usize) -> &'v [&'a str] {
    match &values[index] {
        ParameterValue::TextList(names) => names,
        _ => &[],
    }
}

pub enum PhaseSelection {
    UnknownPhase,
    Empty,
    Selected(Vec<usize>),
}

pub const NO_PHASES_SELECTED_ERROR: &str = "\n\u{1b}[31mError: No phases were selected. Provide at least one phase to the \"--to\", \"--to-except\", or \"--only\" parameters.\u{1b}[39m\n";

pub fn select_phases(request: &ActionRequest<'_, '_>, values: &[ParameterValue<'_>]) -> PhaseSelection {
    let resolve = |index: usize| -> Option<Vec<usize>> {
        phase_names(values, index).iter().map(|name| request.model.find_phase_index(name)).collect()
    };
    let (Some(to), Some(to_except), Some(only)) = (resolve(0), resolve(1), resolve(2)) else {
        return PhaseSelection::UnknownPhase;
    };
    let mut selected: Vec<usize> = selected_phases_from(request.table, to);
    let mut except_dependencies: Vec<usize> = Vec::new();
    for phase_index in to_except {
        except_dependencies.extend(request.table.phase_dependencies[phase_index].iter().copied());
    }
    for phase_index in selected_phases_from(request.table, except_dependencies).into_iter().chain(only) {
        if !selected.contains(&phase_index) {
            selected.push(phase_index);
        }
    }
    if selected.is_empty() { PhaseSelection::Empty } else { PhaseSelection::Selected(selected) }
}

fn is_json_stringify_verbatim(text: &str) -> bool {
    !text.chars().any(|character| character < ' ' || matches!(character, '"' | '\\' | '\u{2028}' | '\u{2029}'))
}

pub fn unknown_phase_error(request: &ActionRequest<'_, '_>, definitions: &[DefinedParameter<'_>], values: &[ParameterValue<'_>]) -> Option<String> {
    let supports_color = request.supports_color?;
    for index in [2, 0, 1] {
        for name in phase_names(values, index) {
            if request.model.find_phase_index(name).is_some() {
                continue;
            }
            if !is_json_stringify_verbatim(name) {
                return None;
            }
            let long_name: &str = definitions[index].long_name;
            let message: String = format!("The phase name \"{name}\" passed to \"{long_name}\" does not exist in heft.json.");
            return Some(if supports_color() { format!("\u{1b}[31m{message}\u{1b}[39m\n") } else { format!("{message}\n") });
        }
    }
    None
}
