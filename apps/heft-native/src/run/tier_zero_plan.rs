use crate::builtin::{
    builtin_task_passes_preflight, builtin_task_touches_files, plan_builtin_task, plan_phase_clean,
    selections_are_deletable_without_permission_errors, AbsoluteFileSelection, BuiltinTaskOptions, FileSelectionSpecifier,
    PlannedBuiltinTask,
};
use crate::graph::{plan_sequential_operations, HeftOperation, PhaseShape};

pub struct NativePhaseDefinition {
    pub phase_name: String,
    pub dependency_phase_indices: Vec<usize>,
    pub clean_files: Vec<FileSelectionSpecifier>,
    pub tasks: Vec<NativeTaskDefinition>,
}

pub struct NativeTaskDefinition {
    pub task_name: String,
    pub dependency_task_indices: Vec<usize>,
    pub options: BuiltinTaskOptions,
}

pub struct NativeBuildRequest {
    pub build_folder_path: String,
    pub phases: Vec<NativePhaseDefinition>,
    pub selected_phase_indices: Vec<usize>,
    pub clean: bool,
    pub alias_expansion_message: Option<String>,
}

pub enum TierZeroStep {
    StartPhase { phase_name: String, clean_selections: Option<Vec<AbsoluteFileSelection>> },
    RunTask { logger_name: String, planned_task: PlannedBuiltinTask },
}

pub struct TierZeroPlannedStep {
    pub step: TierZeroStep,
    pub phase_name: String,
    pub completes_phase: bool,
}

pub struct TierZeroPlan {
    pub alias_expansion_message: Option<String>,
    pub selection_is_missing_phase_dependencies: bool,
    pub steps: Vec<TierZeroPlannedStep>,
}

const FIRST_TASK_INDEX: [usize; 1] = [0];

fn is_output_before_io_pair(phase: &NativePhaseDefinition) -> bool {
    matches!(
        phase.tasks.as_slice(),
        [first, second]
            if first.dependency_task_indices.is_empty()
                && second.dependency_task_indices.is_empty()
                && matches!(first.options, BuiltinTaskOptions::SetEnvironmentVariables(_))
                && !matches!(second.options, BuiltinTaskOptions::SetEnvironmentVariables(_))
    )
}

pub fn plan_tier_zero_build(request: &NativeBuildRequest) -> Option<TierZeroPlan> {
    let phase_shapes: Vec<PhaseShape<'_>> = request
        .phases
        .iter()
        .map(|phase| {
            let mut task_dependency_indices: Vec<&[usize]> =
                phase.tasks.iter().map(|task| task.dependency_task_indices.as_slice()).collect();
            if is_output_before_io_pair(phase) {
                task_dependency_indices[1] = &FIRST_TASK_INDEX;
            }
            PhaseShape { dependency_phase_indices: &phase.dependency_phase_indices, task_dependency_indices }
        })
        .collect();
    let sequential_plan = plan_sequential_operations(&phase_shapes, &request.selected_phase_indices)?;
    let temp_folder_path = format!("{}/temp", request.build_folder_path);
    let mut steps: Vec<(usize, TierZeroStep)> = Vec::new();
    let mut files_may_have_changed = false;
    for operation in &sequential_plan.operations_in_execution_order {
        match *operation {
            HeftOperation::Phase { phase_index } => {
                let phase = &request.phases[phase_index];
                let clean_selections = if request.clean {
                    let selections = plan_phase_clean(
                        &phase.clean_files,
                        &request.build_folder_path,
                        &temp_folder_path,
                        &phase.phase_name,
                    )?;
                    selections_are_deletable_without_permission_errors(&selections).then_some(())?;
                    files_may_have_changed = true;
                    Some(selections)
                } else {
                    None
                };
                steps.push((phase_index, TierZeroStep::StartPhase { phase_name: phase.phase_name.clone(), clean_selections }));
            }
            HeftOperation::Task { phase_index, task_index } => {
                let phase = &request.phases[phase_index];
                let task = &phase.tasks[task_index];
                let task_temp_folder_path = format!("{temp_folder_path}/{}/{}", phase.phase_name, task.task_name);
                let mut planned_task = plan_builtin_task(&task.options, &request.build_folder_path, &task_temp_folder_path)?;
                builtin_task_passes_preflight(&mut planned_task, &temp_folder_path, !files_may_have_changed).then_some(())?;
                files_may_have_changed |= builtin_task_touches_files(&planned_task);
                let logger_name = format!("{}:{}", phase.phase_name, task.task_name);
                steps.push((phase_index, TierZeroStep::RunTask { logger_name, planned_task }));
            }
        }
    }
    let last_step_of_phase = |phase_index: usize| steps.iter().rposition(|(index, _)| *index == phase_index);
    let completes_phase: Vec<bool> = (0..steps.len())
        .map(|position| last_step_of_phase(steps[position].0) == Some(position))
        .collect();
    Some(TierZeroPlan {
        alias_expansion_message: request.alias_expansion_message.clone(),
        selection_is_missing_phase_dependencies: sequential_plan.selection_is_missing_phase_dependencies,
        steps: steps
            .into_iter()
            .zip(completes_phase)
            .map(|((phase_index, step), completes_phase)| TierZeroPlannedStep {
                step,
                phase_name: request.phases[phase_index].phase_name.clone(),
                completes_phase,
            })
            .collect(),
    })
}
