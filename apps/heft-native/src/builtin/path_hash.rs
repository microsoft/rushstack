use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};

const WORD_MULTIPLIER: u64 = 0x517c_c1b7_2722_0a95;
const WORD_ROTATION: u32 = 5;
const FINAL_ROTATION: u32 = 26;

#[derive(Default)]
pub struct PathHasher {
    hash: u64,
}

impl PathHasher {
    fn add_word(&mut self, word: u64) {
        self.hash = (self.hash.rotate_left(WORD_ROTATION) ^ word).wrapping_mul(WORD_MULTIPLIER);
    }
}

impl Hasher for PathHasher {
    fn write(&mut self, bytes: &[u8]) {
        let (words, tail) = bytes.as_chunks::<8>();
        for word in words {
            self.add_word(u64::from_le_bytes(*word));
        }
        let mut tail_word = [0u8; 8];
        tail_word[..tail.len()].copy_from_slice(tail);
        self.add_word(u64::from_le_bytes(tail_word) ^ ((bytes.len() as u64) << 56));
    }

    fn write_u8(&mut self, byte: u8) {
        self.add_word(u64::from(byte));
    }

    fn write_usize(&mut self, value: usize) {
        self.add_word(value as u64);
    }

    fn finish(&self) -> u64 {
        self.hash.rotate_left(FINAL_ROTATION)
    }
}

pub type PathHashMap<Key, Value> = HashMap<Key, Value, BuildHasherDefault<PathHasher>>;
pub type PathHashSet<Key> = HashSet<Key, BuildHasherDefault<PathHasher>>;

pub fn path_hash_map_with_capacity<Key, Value>(capacity: usize) -> PathHashMap<Key, Value> {
    PathHashMap::with_capacity_and_hasher(capacity, BuildHasherDefault::default())
}

pub fn path_hash_set_with_capacity<Key>(capacity: usize) -> PathHashSet<Key> {
    PathHashSet::with_capacity_and_hasher(capacity, BuildHasherDefault::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn similar_paths_spread_over_buckets_and_tables_behave_like_std() {
        let paths: Vec<String> = (0..20_000).map(|index| format!("/p/src/assets/d{:03}/file-{:03}.txt", index / 100, index % 100)).collect();
        let mut index_by_path = path_hash_map_with_capacity::<&str, usize>(paths.len());
        for (index, path) in paths.iter().enumerate() {
            assert!(index_by_path.insert(path, index).is_none());
        }
        assert!(paths.iter().enumerate().all(|(index, path)| index_by_path.get(path.as_str()) == Some(&index)));
        let low_bits: PathHashSet<u64> = paths
            .iter()
            .map(|path| {
                let mut hasher = PathHasher::default();
                hasher.write(path.as_bytes());
                hasher.finish() & 0xffff
            })
            .collect();
        assert!(low_bits.len() > 15_000);
    }
}
