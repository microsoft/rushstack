use crate::json::parse_json_with_comments_exactly_like_jju;
use crate::sys::allocation_counter::measure_allocations_on_this_thread_while_running;

#[test]
fn measures_allocated_bytes_peak_and_bytes_left_alive() {
    let (kept_bytes, allocations_made) = measure_allocations_on_this_thread_while_running(|| {
        let temporary_buffer: Vec<u8> = std::hint::black_box(vec![1u8; 4096]);
        let mut kept_bytes: Vec<u8> = Vec::with_capacity(64);
        kept_bytes.extend_from_slice(&temporary_buffer[..64]);
        kept_bytes
    });
    assert_eq!(kept_bytes.len(), 64);
    assert_eq!(allocations_made.allocation_count, 2);
    assert_eq!(allocations_made.allocated_byte_count, 4096 + 64);
    assert_eq!(allocations_made.peak_live_bytes_above_start, 4096 + 64);
    assert_eq!(allocations_made.live_bytes_left_above_start, 64);
}

#[test]
fn ignores_allocations_made_by_other_threads() {
    let (_, allocations_made) = measure_allocations_on_this_thread_while_running(|| {
        std::thread::scope(|scope| {
            scope.spawn(|| std::hint::black_box(vec![1u8; 1 << 20]).len()).join().unwrap_or(0)
        })
    });
    assert!(allocations_made.allocated_byte_count < 1 << 20);
}

fn heft_json_with_escape_free_strings_of_length(string_length: usize) -> String {
    let long_text: String = "x".repeat(string_length);
    format!(
        "{{\"$schema\": \"https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json\", \"phasesByName\": {{\"build\": {{\"phaseDescription\": \"{long_text}\", \"cleanFiles\": [{{\"includeGlobs\": [\"lib-{long_text}\"]}}], \"tasksByName\": {{\"copy\": {{\"taskPlugin\": {{\"pluginPackage\": \"@rushstack/heft\", \"pluginName\": \"copy-files-plugin\", \"options\": {{\"copyOperations\": [{{\"sourcePath\": \"src/{long_text}\", \"destinationFolders\": [\"lib\"]}}]}}}}}}}}}}}}}}"
    )
}

#[test]
fn parsed_json_memory_does_not_grow_with_the_length_of_escape_free_strings() {
    let short_document: String = heft_json_with_escape_free_strings_of_length(8);
    let long_document: String = heft_json_with_escape_free_strings_of_length(8192);
    let (_, short_allocations) = measure_allocations_on_this_thread_while_running(|| {
        parse_json_with_comments_exactly_like_jju(&short_document).map(|value| std::hint::black_box(value).clone())
    });
    let (_, long_allocations) = measure_allocations_on_this_thread_while_running(|| {
        parse_json_with_comments_exactly_like_jju(&long_document).map(|value| std::hint::black_box(value).clone())
    });
    assert_eq!(short_allocations.allocation_count, long_allocations.allocation_count);
    assert_eq!(short_allocations.allocated_byte_count, long_allocations.allocated_byte_count);
    assert_eq!(short_allocations.peak_live_bytes_above_start, long_allocations.peak_live_bytes_above_start);
}

#[test]
fn dropping_a_parsed_document_releases_every_byte() {
    let document: String = heft_json_with_escape_free_strings_of_length(32);
    let (parse_succeeded, allocations_made) = measure_allocations_on_this_thread_while_running(|| {
        parse_json_with_comments_exactly_like_jju(&document).is_ok()
    });
    assert!(parse_succeeded);
    assert!(allocations_made.allocation_count > 0);
    assert_eq!(allocations_made.live_bytes_left_above_start, 0);
}
