use std::borrow::Cow;

use crate::sys::allocation_counter::count_allocations_on_this_thread_while_running;

use super::{parse_json_exactly_like_json_parse, JsonNumber, JsonObject, JsonValue};

fn number_value(value: f64) -> JsonValue<'static> {
    JsonValue::Number(JsonNumber {
        value,
        source_text: "",
    })
}

fn pseudo_random_key_sequence(seed: u64, entry_count: usize, key_pool_size: u64) -> Vec<String> {
    let mut state = seed;
    let mut keys = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        keys.push(format!("@scope/package-{}", (state >> 33) % key_pool_size));
    }
    keys
}

#[test]
fn large_objects_keep_first_position_and_last_value_exactly_like_linear_insertion() {
    for (seed, entry_count, key_pool_size) in
        [(1, 300, 400), (2, 300, 40), (3, 17, 16), (4, 900, 5000)]
    {
        let keys = pseudo_random_key_sequence(seed, entry_count, key_pool_size);
        let mut linear_reference = JsonObject::default();
        for (position, key) in keys.iter().enumerate() {
            linear_reference
                .set_keeping_first_position(Cow::Borrowed(key), number_value(position as f64));
        }
        let mut text = String::from("{");
        for (position, key) in keys.iter().enumerate() {
            if position > 0 {
                text.push(',');
            }
            text.push_str(&format!("\"{key}\":{position}"));
        }
        text.push('}');
        let parsed = parse_json_exactly_like_json_parse(&text).unwrap();
        assert_eq!(
            parsed.as_object().unwrap().entries(),
            linear_reference.entries()
        );
    }
}

#[test]
fn duplicate_keys_keep_the_first_position_and_the_last_value() {
    let parsed = parse_json_exactly_like_json_parse("{\"a\":1,\"b\":2,\"a\":3}").unwrap();
    assert_eq!(
        parsed.as_object().unwrap().entries(),
        &[
            (Cow::Borrowed("a"), number_value(3.0)),
            (Cow::Borrowed("b"), number_value(2.0))
        ]
    );
}

#[test]
fn large_objects_allocate_one_exact_vec_the_pending_stack_growth_and_a_short_lived_key_index() {
    let mut text = String::from("{");
    for position in 0..64 {
        if position > 0 {
            text.push(',');
        }
        text.push_str(&format!("\"key-{position}\":{position}"));
    }
    text.push('}');
    let (parsed, allocations) = count_allocations_on_this_thread_while_running(|| {
        parse_json_exactly_like_json_parse(&text)
    });
    assert_eq!(parsed.unwrap().as_object().unwrap().len(), 64);
    assert_eq!(allocations, 1 + 5 + 2);
}
