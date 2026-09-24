use crate::sys::allocation_counter::count_allocations_on_this_thread_while_running;

use super::{parse_json_with_comments_exactly_like_jju, write_json_for_javascript, JsonValue};

#[test]
fn parsing_allocates_one_exact_vec_per_non_empty_container_plus_two_pending_stacks() {
    let text = "{\"phasesByName\": {\"build\": {\"tasksByName\": {}}}, \"heftPlugins\": [{\"pluginPackage\": \"a\"}], \"none\": []}";
    let (value, allocations) = count_allocations_on_this_thread_while_running(|| {
        parse_json_with_comments_exactly_like_jju(text)
    });
    assert!(value.is_ok());
    assert_eq!(allocations, 5 + 2);
}

#[test]
fn escaped_strings_cost_exactly_one_allocation_each() {
    let text = "[\"plain\", \"with \\\\ escape\", \"\\u0041\"]";
    let (value, allocations) = count_allocations_on_this_thread_while_running(|| {
        parse_json_with_comments_exactly_like_jju(text)
    });
    assert!(value.is_ok());
    assert_eq!(allocations, 1 + 2 + 1);
}

#[test]
fn writing_into_a_preallocated_buffer_does_not_allocate() {
    let value =
        parse_json_with_comments_exactly_like_jju("{\"a\": [1, \"b\", null, {\"c\": true}]}")
            .unwrap();
    let mut output = String::with_capacity(64);
    let (result, allocations) = count_allocations_on_this_thread_while_running(|| {
        write_json_for_javascript(&value, &mut output)
    });
    assert!(result.is_ok());
    assert_eq!(allocations, 0);
    assert_eq!(output, "{\"a\":[1,\"b\",null,{\"c\":true}]}");
}

fn every_container_has_exactly_the_capacity_it_needs(value: &JsonValue<'_>) -> bool {
    match value {
        JsonValue::Array(items) => {
            items.capacity() == items.len()
                && items
                    .iter()
                    .all(every_container_has_exactly_the_capacity_it_needs)
        }
        JsonValue::Object(object) => {
            object.entries.capacity() == object.entries.len()
                && object
                    .entries
                    .iter()
                    .all(|(_, item)| every_container_has_exactly_the_capacity_it_needs(item))
        }
        _ => true,
    }
}

#[test]
fn parsed_containers_are_allocated_with_exactly_the_capacity_they_need() {
    let text = "{\"a\": [1, 2, 3, {\"b\": [], \"c\": {}}, [[4]]], \"d\": {\"e\": 5, \"f\": [6, 7, 8, 9, 10], \"e\": 11}}";
    let value = parse_json_with_comments_exactly_like_jju(text).unwrap();
    assert!(every_container_has_exactly_the_capacity_it_needs(&value));
}
