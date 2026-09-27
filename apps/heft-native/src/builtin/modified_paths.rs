use super::delete_files::DeletionPlan;
use super::file_selection::AbsoluteFileSelection;
use super::posix_path::path_contains;

const MAXIMUM_EXACT_DELETED_PATHS_PER_STEP: usize = 32;

#[derive(Default)]
pub struct ModifiedPaths {
    paths_in_step_order: Vec<(String, bool)>,
}

impl ModifiedPaths {
    pub fn overlaps(&self, path: &str) -> bool {
        self.paths_in_step_order
            .iter()
            .any(|(modified_path, _)| path_contains(modified_path, path) || path_contains(path, modified_path))
    }

    pub fn selection_is_unchanged(&self, selection: &AbsoluteFileSelection) -> bool {
        selection.only_reads_inside_its_folder() && !self.overlaps(&selection.source_folder_path)
    }

    pub fn deletes(&self, path: &str) -> bool {
        let last_overlapping_path = self
            .paths_in_step_order
            .iter()
            .rev()
            .find(|(modified_path, _)| path_contains(modified_path, path) || path_contains(path, modified_path));
        matches!(last_overlapping_path, Some((deleted_path, true)) if path_contains(deleted_path, path))
    }

    pub fn add_modified_path(&mut self, path: &str) {
        self.paths_in_step_order.push((path.to_owned(), false));
    }

    pub fn add_deletion_plan(&mut self, plan: &DeletionPlan) {
        match &plan.preflight_entries {
            Some(entries_per_selection)
                if entries_per_selection.iter().map(Vec::len).sum::<usize>() <= MAXIMUM_EXACT_DELETED_PATHS_PER_STEP =>
            {
                for entry in entries_per_selection.iter().flatten() {
                    self.paths_in_step_order.push((entry.absolute_path.clone(), true));
                }
            }
            _ => {
                for selection in &plan.selections {
                    self.add_modified_path(&selection.source_folder_path);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deletions_and_modifications_are_tracked_in_step_order() {
        let mut modified_paths = ModifiedPaths::default();
        assert!(!modified_paths.overlaps("/p/src") && !modified_paths.deletes("/p/temp/build/x"));
        modified_paths.paths_in_step_order.push(("/p/temp/build".to_owned(), true));
        modified_paths.add_modified_path("/p/lib/assets");
        assert!(modified_paths.deletes("/p/temp/build/copy/file-copy.json"));
        assert!(!modified_paths.deletes("/p/temp") && modified_paths.overlaps("/p/temp"));
        assert!(!modified_paths.overlaps("/p/src/assets") && !modified_paths.overlaps("/p/temp/scratch"));
        assert!(modified_paths.overlaps("/p/lib") && modified_paths.overlaps("/p/lib/assets/a"));
        modified_paths.add_modified_path("/p/temp/build/copy/file-copy.json");
        assert!(!modified_paths.deletes("/p/temp/build/copy/file-copy.json"));
        assert!(modified_paths.deletes("/p/temp/build/other"));
    }
}
