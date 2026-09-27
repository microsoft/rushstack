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

pub fn order_entries_like_javascript<T>(entries: &mut Vec<(Cow<'_, str>, T)>) {
    if !entries
        .iter()
        .any(|(key, _)| array_index_of_key(key).is_some())
    {
        return;
    }
    let mut index_entries: Vec<(u32, (Cow<'_, str>, T))> = Vec::new();
    let mut named_entries: Vec<(Cow<'_, str>, T)> = Vec::with_capacity(entries.len());
    for entry in entries.drain(..) {
        match array_index_of_key(&entry.0) {
            Some(index) => {
                let position: usize = index_entries.partition_point(|(other, _)| *other <= index);
                index_entries.insert(position, (index, entry));
            }
            None => named_entries.push(entry),
        }
    }
    entries.extend(index_entries.into_iter().map(|(_, entry)| entry));
    entries.extend(named_entries);
}
