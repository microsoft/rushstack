use std::borrow::Cow;

use super::value::JsonValue;

const LARGEST_OBJECT_SCANNED_LINEARLY_FOR_DUPLICATE_KEYS: usize = 16;
const EMPTY_KEY_INDEX_SLOT: usize = usize::MAX;

pub(super) type JsonObjectEntry<'text> = (Cow<'text, str>, JsonValue<'text>);

pub(super) struct DuplicateKeyIndex {
    entry_offset_by_key_hash_slot: Vec<usize>,
}

fn mix_word_into_key_hash(key_hash: u64, word: u64) -> u64 {
    (key_hash.rotate_left(5) ^ word).wrapping_mul(0x517c_c1b7_2722_0a95)
}

fn hash_of_object_key(key: &str) -> u64 {
    let mut key_hash = key.len() as u64;
    let (whole_words, trailing_bytes) = key.as_bytes().as_chunks::<8>();
    for whole_word in whole_words {
        key_hash = mix_word_into_key_hash(key_hash, u64::from_le_bytes(*whole_word));
    }
    let mut trailing_word = 0u64;
    for (byte_index, byte) in trailing_bytes.iter().enumerate() {
        trailing_word |= u64::from(*byte) << (byte_index * 8);
    }
    mix_word_into_key_hash(key_hash, trailing_word)
}

impl DuplicateKeyIndex {
    pub(super) fn new() -> Self {
        DuplicateKeyIndex {
            entry_offset_by_key_hash_slot: Vec::new(),
        }
    }

    pub(super) fn insert_keeping_first_position<'text>(
        &mut self,
        entries: &mut Vec<JsonObjectEntry<'text>>,
        first_object_entry: usize,
        key: Cow<'text, str>,
        value: JsonValue<'text>,
    ) {
        if self.entry_offset_by_key_hash_slot.is_empty() {
            let object_entries = &mut entries[first_object_entry..];
            if object_entries.len() < LARGEST_OBJECT_SCANNED_LINEARLY_FOR_DUPLICATE_KEYS {
                match object_entries
                    .iter_mut()
                    .find(|(existing_key, _)| *existing_key == key)
                {
                    Some(existing_entry) => existing_entry.1 = value,
                    None => entries.push((key, value)),
                }
                return;
            }
            self.rebuild_for_object_entries(&entries[first_object_entry..]);
        }
        let object_entries = &mut entries[first_object_entry..];
        let slot = self.slot_holding_or_awaiting_key(object_entries, &key);
        match self.entry_offset_by_key_hash_slot[slot] {
            EMPTY_KEY_INDEX_SLOT => {
                let object_entry_count = object_entries.len() + 1;
                self.entry_offset_by_key_hash_slot[slot] = object_entries.len();
                entries.push((key, value));
                if object_entry_count * 2 > self.entry_offset_by_key_hash_slot.len() {
                    self.rebuild_for_object_entries(&entries[first_object_entry..]);
                }
            }
            existing_entry_offset => object_entries[existing_entry_offset].1 = value,
        }
    }

    fn slot_holding_or_awaiting_key(
        &self,
        object_entries: &[JsonObjectEntry<'_>],
        key: &str,
    ) -> usize {
        let slot_count = self.entry_offset_by_key_hash_slot.len();
        let mut slot = (hash_of_object_key(key) >> (64 - slot_count.trailing_zeros())) as usize;
        loop {
            let entry_offset = self.entry_offset_by_key_hash_slot[slot];
            if entry_offset == EMPTY_KEY_INDEX_SLOT || object_entries[entry_offset].0 == key {
                return slot;
            }
            slot = (slot + 1) & (slot_count - 1);
        }
    }

    fn rebuild_for_object_entries(&mut self, object_entries: &[JsonObjectEntry<'_>]) {
        let slot_count = (object_entries.len() * 4).next_power_of_two();
        self.entry_offset_by_key_hash_slot.clear();
        self.entry_offset_by_key_hash_slot
            .resize(slot_count, EMPTY_KEY_INDEX_SLOT);
        for (entry_offset, (key, _)) in object_entries.iter().enumerate() {
            let slot = self.slot_holding_or_awaiting_key(object_entries, key);
            self.entry_offset_by_key_hash_slot[slot] = entry_offset;
        }
    }
}
