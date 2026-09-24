#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HeftOperation {
    Phase { phase_index: usize },
    Task { phase_index: usize, task_index: usize },
}

pub struct PhaseShape<'model> {
    pub dependency_phase_indices: &'model [usize],
    pub task_dependency_indices: Vec<&'model [usize]>,
}

pub struct SequentialOperationPlan {
    pub operations_in_execution_order: Vec<HeftOperation>,
    pub selection_is_missing_phase_dependencies: bool,
}

pub fn plan_sequential_operations(
    phases: &[PhaseShape<'_>],
    selected_phase_indices: &[usize],
) -> Option<SequentialOperationPlan> {
    let mut operations: Vec<HeftOperation> = Vec::new();
    let mut dependencies: Vec<Vec<usize>> = Vec::new();
    let operation_index = |operations: &mut Vec<HeftOperation>, dependencies: &mut Vec<Vec<usize>>, operation| {
        match operations.iter().position(|existing| *existing == operation) {
            Some(index) => index,
            None => {
                operations.push(operation);
                dependencies.push(Vec::new());
                operations.len() - 1
            }
        }
    };
    let mut selection_is_missing_phase_dependencies = false;
    for &phase_index in selected_phase_indices {
        let phase = phases.get(phase_index)?;
        if phase.dependency_phase_indices.iter().any(|dependency| !selected_phase_indices.contains(dependency)) {
            selection_is_missing_phase_dependencies = true;
        }
        let phase_operation = operation_index(&mut operations, &mut dependencies, HeftOperation::Phase { phase_index });
        for (task_index, task_dependencies) in phase.task_dependency_indices.iter().enumerate() {
            let task_operation =
                operation_index(&mut operations, &mut dependencies, HeftOperation::Task { phase_index, task_index });
            dependencies[task_operation].push(phase_operation);
            for &dependency_task_index in task_dependencies.iter() {
                let dependency_operation = operation_index(
                    &mut operations,
                    &mut dependencies,
                    HeftOperation::Task { phase_index, task_index: dependency_task_index },
                );
                dependencies[task_operation].push(dependency_operation);
            }
            for (consuming_phase_index, consuming_phase) in phases.iter().enumerate() {
                if consuming_phase.dependency_phase_indices.contains(&phase_index)
                    && selected_phase_indices.contains(&consuming_phase_index)
                {
                    let consuming_operation = operation_index(
                        &mut operations,
                        &mut dependencies,
                        HeftOperation::Phase { phase_index: consuming_phase_index },
                    );
                    dependencies[consuming_operation].push(task_operation);
                    dependencies[consuming_operation].push(phase_operation);
                }
            }
        }
    }
    let operations_in_execution_order = unique_topological_order(&operations, &dependencies)?;
    Some(SequentialOperationPlan {
        operations_in_execution_order,
        selection_is_missing_phase_dependencies,
    })
}

fn unique_topological_order(operations: &[HeftOperation], dependencies: &[Vec<usize>]) -> Option<Vec<HeftOperation>> {
    let mut remaining_dependency_counts: Vec<usize> = dependencies
        .iter()
        .map(|operation_dependencies| {
            let mut unique = operation_dependencies.clone();
            unique.sort_unstable();
            unique.dedup();
            unique.len()
        })
        .collect();
    let mut completed = vec![false; operations.len()];
    let mut order = Vec::with_capacity(operations.len());
    for _ in 0..operations.len() {
        let mut ready = (0..operations.len()).filter(|&index| !completed[index] && remaining_dependency_counts[index] == 0);
        let next = ready.next()?;
        if ready.next().is_some() {
            return None;
        }
        completed[next] = true;
        order.push(operations[next]);
        for (index, operation_dependencies) in dependencies.iter().enumerate() {
            if !completed[index] && operation_dependencies.contains(&next) {
                remaining_dependency_counts[index] -= 1;
            }
        }
    }
    Some(order)
}

#[cfg(test)]
mod tests {
    use super::*;
    use HeftOperation::*;

    #[test]
    fn chained_tasks_and_phases_run_in_one_possible_order() {
        let no_dependencies: &[usize] = &[];
        let build = PhaseShape {
            dependency_phase_indices: no_dependencies,
            task_dependency_indices: vec![&[], &[0], &[1]],
        };
        let test = PhaseShape { dependency_phase_indices: &[0], task_dependency_indices: vec![&[]] };
        let plan = plan_sequential_operations(&[build, test], &[0, 1]).unwrap();
        assert!(!plan.selection_is_missing_phase_dependencies);
        assert_eq!(
            plan.operations_in_execution_order,
            vec![
                Phase { phase_index: 0 },
                Task { phase_index: 0, task_index: 0 },
                Task { phase_index: 0, task_index: 1 },
                Task { phase_index: 0, task_index: 2 },
                Phase { phase_index: 1 },
                Task { phase_index: 1, task_index: 0 },
            ]
        );
    }

    #[test]
    fn parallel_work_or_cycles_are_not_sequential() {
        let parallel = PhaseShape { dependency_phase_indices: &[], task_dependency_indices: vec![&[], &[]] };
        assert!(plan_sequential_operations(&[parallel], &[0]).is_none());
        let cycle = PhaseShape { dependency_phase_indices: &[], task_dependency_indices: vec![&[1], &[0]] };
        assert!(plan_sequential_operations(&[cycle], &[0]).is_none());
        let empty = PhaseShape { dependency_phase_indices: &[], task_dependency_indices: vec![] };
        let consumer = PhaseShape { dependency_phase_indices: &[0], task_dependency_indices: vec![&[]] };
        assert!(plan_sequential_operations(&[empty, consumer], &[0, 1]).is_none());
        let only_test = PhaseShape { dependency_phase_indices: &[0], task_dependency_indices: vec![&[]] };
        let build = PhaseShape { dependency_phase_indices: &[], task_dependency_indices: vec![&[]] };
        let plan = plan_sequential_operations(&[build, only_test], &[1]).unwrap();
        assert!(plan.selection_is_missing_phase_dependencies);
        assert_eq!(plan.operations_in_execution_order.len(), 2);
    }
}
