use super::copy_descriptors::{collect_copy_descriptors, CopyDescriptor, CopyDescriptors};
use super::copy_operation::AbsoluteCopyOperation;
use super::file_selection::AbsoluteFileSelection;
use super::simple_glob::GlobbedEntry;

fn operation(source_folder_path: &str, include_globs: &[&str], destinations: &[&str], flatten: bool) -> AbsoluteCopyOperation {
    AbsoluteCopyOperation {
        selection: AbsoluteFileSelection {
            source_folder_path: source_folder_path.to_owned(),
            include_globs: include_globs.iter().map(|glob| (*glob).to_owned()).collect(),
        },
        destination_folder_paths: destinations.iter().map(|folder| (*folder).to_owned()).collect(),
        flatten,
        hardlink: false,
    }
}

fn files(paths: &[&str]) -> Vec<GlobbedEntry> {
    paths.iter().map(|path| GlobbedEntry { absolute_path: (*path).to_owned(), is_directory: false }).collect()
}

fn order_matters(copy_descriptors: &CopyDescriptors<'_>) -> bool {
    let all_descriptors: Vec<&CopyDescriptor> = copy_descriptors.descriptors.iter().collect();
    copy_descriptors.copies_may_depend_on_their_order(&all_descriptors)
}

#[test]
fn a_single_dynamic_operation_keeps_every_source_in_order() {
    let operations = [operation("/p/src", &["**/*"], &["/p/lib"], false)];
    let sources = [files(&["/p/src/a", "/p/src/d/b"])];
    let copy_descriptors = collect_copy_descriptors(&operations, &sources).unwrap();
    assert!(copy_descriptors.sources_are_distinct_and_in_order);
    let destinations: Vec<String> =
        copy_descriptors.descriptors.iter().map(|descriptor| copy_descriptors.destination_path_of(descriptor)).collect();
    assert_eq!(destinations, ["/p/lib/a", "/p/lib/d/b"]);
    assert!(!order_matters(&copy_descriptors));
    for (source_folder, destination_folder) in [("/p/lib", "/p/lib/copy"), ("/p/lib/copy", "/p/lib"), ("/p", "/p"), ("/", "/q")] {
        let overlapping = [operation(source_folder, &["**/*"], &[destination_folder], false)];
        let overlapping_sources = [files(&["/p/lib/copy/x"])];
        assert!(order_matters(&collect_copy_descriptors(&overlapping, &overlapping_sources).unwrap()));
    }
    let siblings = [operation("/p/lib", &["**/*"], &["/p/lib-copy"], false)];
    assert!(!order_matters(&collect_copy_descriptors(&siblings, &[files(&["/p/lib/x"])]).unwrap()));
}

#[test]
fn duplicate_destinations_are_removed_or_rejected_like_heft() {
    let operations = [operation("/p/src", &["**/*"], &["/p/lib", "/p/lib"], false)];
    let sources = [files(&["/p/src/a"])];
    let copy_descriptors = collect_copy_descriptors(&operations, &sources).unwrap();
    assert!(!copy_descriptors.sources_are_distinct_and_in_order);
    assert_eq!(copy_descriptors.descriptors.len(), 1);
    let flattened = [operation("/p/src", &["**/*"], &["/p/lib"], true)];
    let flattened_sources = [files(&["/p/src/a/x", "/p/src/b/x"])];
    let error = collect_copy_descriptors(&flattened, &flattened_sources).err().unwrap();
    assert_eq!(error.message, "Cannot copy multiple files to the same destination \"/p/lib/x\".");
    let literal = [operation("/p/src", &["a.txt", "./a.txt"], &["/p/lib"], false)];
    let literal_sources = [files(&["/p/src/a.txt", "/p/src/a.txt"])];
    assert_eq!(collect_copy_descriptors(&literal, &literal_sources).unwrap().descriptors.len(), 1);
}

#[test]
fn copies_reading_a_destination_or_nested_under_one_depend_on_their_order() {
    let chained = [operation("/p/src", &["**/*"], &["/p/lib"], false), operation("/p/lib", &["**/*"], &["/p/out"], false)];
    assert!(order_matters(&collect_copy_descriptors(&chained, &[files(&["/p/src/a"]), files(&["/p/lib/a"])]).unwrap()));
    let nested = [operation("/p/src", &["a", "a/b"], &["/p/lib"], false)];
    assert!(order_matters(&collect_copy_descriptors(&nested, &[files(&["/p/src/a", "/p/src/a/b"])]).unwrap()));
    let independent = [operation("/p/src", &["x.txt"], &["/p/lib"], false), operation("/p/src2", &["**/*"], &["/p/out"], false)];
    assert!(!order_matters(&collect_copy_descriptors(&independent, &[files(&["/p/src/x.txt"]), files(&["/p/src2/y"])]).unwrap()));
}
