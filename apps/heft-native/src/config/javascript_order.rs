use std::borrow::Cow;

const OBJECT_PROTOTYPE_PROPERTY_NAMES: [&str; 12] = [
    "__proto__",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
];

pub fn is_object_prototype_property_name(key: &str) -> bool {
    OBJECT_PROTOTYPE_PROPERTY_NAMES.contains(&key)
}

pub fn array_index_of_key(key: &str) -> Option<u32> {
    let bytes: &[u8] = key.as_bytes();
    if bytes.is_empty() || bytes.len() > 10 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    if bytes.len() > 1 && bytes[0] == b'0' {
        return None;
    }
    match key.parse::<u64>() {
        Ok(index) if index < 4_294_967_295 => Some(index as u32),
        _ => None,
    }
}

pub fn order_entries_like_javascript<T>(entries: &mut [(Cow<'_, str>, T)]) {
    if entries
        .iter()
        .any(|(key, _)| array_index_of_key(key).is_some())
    {
        entries.sort_by_key(|(key, _)| match array_index_of_key(key) {
            Some(index) => (0u8, index),
            None => (1u8, 0),
        });
    }
}
