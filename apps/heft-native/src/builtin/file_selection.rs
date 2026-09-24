use super::posix_path::resolve_path;
use super::simple_glob::{patterns_are_simple, try_simple_glob, GlobbedEntry};
use super::simple_glob_pattern::is_extension;

#[derive(Clone, Debug, Default)]
pub struct FileSelectionSpecifier {
    pub source_path: Option<String>,
    pub file_extensions: Option<Vec<String>>,
    pub exclude_globs: Option<Vec<String>>,
    pub include_globs: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct AbsoluteFileSelection {
    pub source_folder_path: String,
    pub include_globs: Vec<String>,
}

impl FileSelectionSpecifier {
    pub fn to_absolute_selection(&self, root_folder_path: &str) -> Option<AbsoluteFileSelection> {
        if self.exclude_globs.as_ref().is_some_and(|globs| !globs.is_empty()) {
            return None;
        }
        let source_folder_path = match self.source_path.as_deref() {
            Some(source_path) if !source_path.is_empty() => resolve_path(root_folder_path, source_path),
            _ => root_folder_path.to_owned(),
        };
        if source_folder_path.contains('\\') {
            return None;
        }
        let include_globs = self.included_glob_patterns()?;
        patterns_are_simple(&include_globs).then_some(AbsoluteFileSelection {
            source_folder_path,
            include_globs,
        })
    }

    fn included_glob_patterns(&self) -> Option<Vec<String>> {
        let mut escaped_file_extensions: Vec<&str> = Vec::new();
        for file_extension in self.file_extensions.iter().flatten() {
            let escaped_file_extension = file_extension.strip_prefix('.').unwrap_or(file_extension);
            if !is_extension(escaped_file_extension) {
                return None;
            }
            if !escaped_file_extensions.contains(&escaped_file_extension) {
                escaped_file_extensions.push(escaped_file_extension);
            }
        }
        let mut patterns_to_glob: Vec<String> = Vec::new();
        match escaped_file_extensions.as_slice() {
            [] => {}
            [single_extension] => patterns_to_glob.push(format!("**/*.{single_extension}")),
            many_extensions => patterns_to_glob.push(format!("**/*.{{{}}}", many_extensions.join(","))),
        }
        for include_glob in self.include_globs.iter().flatten() {
            if !patterns_to_glob.contains(include_glob) {
                patterns_to_glob.push(include_glob.clone());
            }
        }
        if patterns_to_glob.is_empty() {
            patterns_to_glob.push(String::from("**/*"));
        }
        Some(patterns_to_glob)
    }
}

impl AbsoluteFileSelection {
    pub fn select(&self, include_folders: bool) -> Option<Vec<GlobbedEntry>> {
        try_simple_glob(&self.include_globs, &self.source_folder_path, !include_folders)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn globs(values: &[&str]) -> Option<Vec<String>> {
        Some(values.iter().map(|value| (*value).to_owned()).collect())
    }

    #[test]
    fn include_globs_are_computed_like_heft() {
        let specifier = FileSelectionSpecifier {
            source_path: Some("src/assets".into()),
            file_extensions: globs(&[".txt", ".json", ".txt"]),
            include_globs: globs(&["**/*.{txt,json}", "lib"]),
            exclude_globs: None,
        };
        let absolute = specifier.to_absolute_selection("/p").unwrap();
        assert_eq!(absolute.source_folder_path, "/p/src/assets");
        assert_eq!(absolute.include_globs, vec!["**/*.{txt,json}".to_owned(), "lib".to_owned()]);
        let default_selection = FileSelectionSpecifier::default().to_absolute_selection("/p").unwrap();
        assert_eq!(default_selection.include_globs, vec!["**/*".to_owned()]);
        let excluded = FileSelectionSpecifier { exclude_globs: globs(&["x"]), ..Default::default() };
        assert!(excluded.to_absolute_selection("/p").is_none());
    }
}
