use crate::json::parse_json_with_comments_exactly_like_jju;
use crate::sys::allocation_counter::count_allocations_on_this_thread_while_running;

use super::compile_json_schema_for_fast_validation;

#[test]
fn validation_without_patterns_does_not_allocate() {
    let schema_document = parse_json_with_comments_exactly_like_jju(
        "{\"type\": \"object\", \"required\": [\"a\"], \"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"array\", \"items\": {\"enum\": [1, 2, \"three\"]}}, \"b\": {\"type\": \"string\", \"minLength\": 1}}}",
    )
    .unwrap();
    let compiled_schema = compile_json_schema_for_fast_validation(&schema_document).unwrap();
    let data =
        parse_json_with_comments_exactly_like_jju("{\"a\": [1, 2, \"three\"], \"b\": \"text\"}")
            .unwrap();
    let (is_valid, allocations) = count_allocations_on_this_thread_while_running(|| {
        compiled_schema.is_definitely_valid(&data)
    });
    assert!(is_valid);
    assert_eq!(allocations, 0);
}

fn allocations_of_one_pattern_test(pattern_schema: &str, text: &str) -> usize {
    let schema_document = parse_json_with_comments_exactly_like_jju(pattern_schema).unwrap();
    let compiled_schema = compile_json_schema_for_fast_validation(&schema_document).unwrap();
    let data = parse_json_with_comments_exactly_like_jju(text).unwrap();
    let (is_valid, allocations) = count_allocations_on_this_thread_while_running(|| {
        compiled_schema.is_definitely_valid(&data)
    });
    assert!(is_valid);
    allocations
}

#[test]
fn pattern_tests_of_small_programs_do_not_allocate() {
    let allocations = allocations_of_one_pattern_test(
        "{\"type\": \"string\", \"pattern\": \"^[a-z][a-z0-9]*([-][a-z0-9]+)*$\"}",
        "\"copy-json-schemas\"",
    );
    assert_eq!(allocations, 0);
}

#[test]
fn pattern_tests_of_large_programs_cost_three_allocations() {
    let allocations = allocations_of_one_pattern_test(
        "{\"type\": \"string\", \"pattern\": \"^a{70}\"}",
        "\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"",
    );
    assert_eq!(allocations, 3);
}
