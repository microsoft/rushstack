use super::compress_sha256_blocks_if_the_cpu_can;
use crate::builtin::compress_sha256_blocks_without_simd;

const INITIAL_STATE: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

fn pseudo_random_bytes(seed: u64, length: usize) -> Vec<u8> {
    let mut generator_state = seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
    (0..length)
        .map(|_| {
            generator_state ^= generator_state << 13;
            generator_state ^= generator_state >> 7;
            generator_state ^= generator_state << 17;
            (generator_state >> 24) as u8
        })
        .collect()
}

#[test]
fn sha_extensions_compress_every_block_count_exactly_like_the_scalar_twin() {
    if !std::arch::is_x86_feature_detected!("sha") || super::simd_is_disabled_by_environment() {
        return;
    }
    for block_count in 0..=40 {
        for seed in 0..8u64 {
            let whole_blocks = pseudo_random_bytes(seed * 1000 + block_count as u64, block_count * 64);
            for trailing_byte_count in [0, 1, 63] {
                let mut input = whole_blocks.clone();
                input.extend(std::iter::repeat_n(0xA5, trailing_byte_count));
                let mut simd_state = INITIAL_STATE;
                let mut scalar_state = INITIAL_STATE;
                assert!(compress_sha256_blocks_if_the_cpu_can(&mut simd_state, &input));
                compress_sha256_blocks_without_simd(&mut scalar_state, &input);
                assert_eq!(simd_state, scalar_state, "{block_count} blocks + {trailing_byte_count} bytes, seed {seed}");
            }
        }
    }
}

#[test]
fn sha_extensions_accept_every_input_offset_and_adversarial_words() {
    if !std::arch::is_x86_feature_detected!("sha") || super::simd_is_disabled_by_environment() {
        return;
    }
    let buffer = pseudo_random_bytes(7, 64 * 9 + 64);
    for offset in 0..64 {
        let blocks = &buffer[offset..offset + 64 * 9];
        let mut simd_state = INITIAL_STATE;
        let mut scalar_state = INITIAL_STATE;
        assert!(compress_sha256_blocks_if_the_cpu_can(&mut simd_state, blocks));
        compress_sha256_blocks_without_simd(&mut scalar_state, blocks);
        assert_eq!(simd_state, scalar_state, "offset {offset}");
    }
    for fill_byte in [0x00, 0xFF, 0x80, 0x7F] {
        let blocks = vec![fill_byte; 64 * 3];
        let mut simd_state = [u32::MAX; 8];
        let mut scalar_state = [u32::MAX; 8];
        assert!(compress_sha256_blocks_if_the_cpu_can(&mut simd_state, &blocks));
        compress_sha256_blocks_without_simd(&mut scalar_state, &blocks);
        assert_eq!(simd_state, scalar_state, "fill {fill_byte:#x}");
    }
}
