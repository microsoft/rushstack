#![allow(unsafe_code)]

use std::arch::x86_64::{
    __m128i, _mm_add_epi32, _mm_alignr_epi8, _mm_blend_epi16, _mm_loadu_si128, _mm_set_epi32, _mm_set_epi64x,
    _mm_sha256msg1_epu32, _mm_sha256msg2_epu32, _mm_sha256rnds2_epu32, _mm_shuffle_epi32, _mm_shuffle_epi8,
    _mm_storeu_si128,
};
use std::sync::atomic::{AtomicU8, Ordering};

const SHA_EXTENSIONS_NOT_DETECTED_YET: u8 = 0;
const SHA_EXTENSIONS_UNAVAILABLE: u8 = 1;
const SHA_EXTENSIONS_AVAILABLE: u8 = 2;

static SHA_EXTENSIONS: AtomicU8 = AtomicU8::new(SHA_EXTENSIONS_NOT_DETECTED_YET);

const ROUND_CONSTANTS: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

#[cold]
#[inline(never)]
fn detect_sha_extensions_once() -> u8 {
    let sha_extensions = if !super::simd_is_disabled_by_environment()
        && std::arch::is_x86_feature_detected!("sha")
        && std::arch::is_x86_feature_detected!("sse2")
        && std::arch::is_x86_feature_detected!("ssse3")
        && std::arch::is_x86_feature_detected!("sse4.1")
    {
        SHA_EXTENSIONS_AVAILABLE
    } else {
        SHA_EXTENSIONS_UNAVAILABLE
    };
    SHA_EXTENSIONS.store(sha_extensions, Ordering::Relaxed);
    sha_extensions
}

pub fn compress_sha256_blocks_if_the_cpu_can(state: &mut [u32; 8], blocks: &[u8]) -> bool {
    let sha_extensions = match SHA_EXTENSIONS.load(Ordering::Relaxed) {
        SHA_EXTENSIONS_NOT_DETECTED_YET => detect_sha_extensions_once(),
        sha_extensions => sha_extensions,
    };
    if sha_extensions != SHA_EXTENSIONS_AVAILABLE {
        return false;
    }
    unsafe { compress_sha256_blocks_with_sha_extensions(state, blocks) };
    true
}

#[target_feature(enable = "sha,sse2,ssse3,sse4.1")]
fn load_big_endian_words(group_bytes: &[u8; 16], byte_swap_mask: __m128i) -> __m128i {
    let little_endian_words = unsafe { _mm_loadu_si128(group_bytes.as_ptr().cast()) };
    _mm_shuffle_epi8(little_endian_words, byte_swap_mask)
}

#[target_feature(enable = "sha,sse2,ssse3,sse4.1")]
fn schedule_next_words(words_0: __m128i, words_1: __m128i, words_2: __m128i, words_3: __m128i) -> __m128i {
    let partially_scheduled_words = _mm_sha256msg1_epu32(words_0, words_1);
    let words_shifted_by_one = _mm_alignr_epi8(words_3, words_2, 4);
    _mm_sha256msg2_epu32(_mm_add_epi32(partially_scheduled_words, words_shifted_by_one), words_3)
}

#[target_feature(enable = "sha,sse2,ssse3,sse4.1")]
fn run_four_rounds(abef_state: &mut __m128i, cdgh_state: &mut __m128i, words: __m128i, word_group_index: usize) {
    let constants = &ROUND_CONSTANTS[4 * word_group_index..4 * word_group_index + 4];
    let round_constants =
        _mm_set_epi32(constants[3] as i32, constants[2] as i32, constants[1] as i32, constants[0] as i32);
    let words_plus_constants = _mm_add_epi32(words, round_constants);
    *cdgh_state = _mm_sha256rnds2_epu32(*cdgh_state, *abef_state, words_plus_constants);
    let upper_words_plus_constants = _mm_shuffle_epi32(words_plus_constants, 0x0E);
    *abef_state = _mm_sha256rnds2_epu32(*abef_state, *cdgh_state, upper_words_plus_constants);
}

#[target_feature(enable = "sha,sse2,ssse3,sse4.1")]
fn compress_sha256_blocks_with_sha_extensions(state: &mut [u32; 8], blocks: &[u8]) {
    let byte_swap_mask = _mm_set_epi64x(0x0c0d_0e0f_0809_0a0b, 0x0405_0607_0001_0203);
    let (dcba_state, hgfe_state) = unsafe {
        (_mm_loadu_si128(state[0..4].as_ptr().cast()), _mm_loadu_si128(state[4..8].as_ptr().cast()))
    };
    let cdab_state = _mm_shuffle_epi32(dcba_state, 0xB1);
    let efgh_state = _mm_shuffle_epi32(hgfe_state, 0x1B);
    let mut abef_state = _mm_alignr_epi8(cdab_state, efgh_state, 8);
    let mut cdgh_state = _mm_blend_epi16(efgh_state, cdab_state, 0xF0);
    let (whole_blocks, _) = blocks.as_chunks::<64>();
    for block in whole_blocks {
        let (abef_before_block, cdgh_before_block) = (abef_state, cdgh_state);
        let ([first_group, second_group, third_group, fourth_group], _) = block.as_chunks::<16>() else {
            break;
        };
        let mut words = [
            load_big_endian_words(first_group, byte_swap_mask),
            load_big_endian_words(second_group, byte_swap_mask),
            load_big_endian_words(third_group, byte_swap_mask),
            load_big_endian_words(fourth_group, byte_swap_mask),
        ];
        for word_group_index in 0..16 {
            if word_group_index >= 4 {
                words[word_group_index % 4] = schedule_next_words(
                    words[word_group_index % 4],
                    words[(word_group_index + 1) % 4],
                    words[(word_group_index + 2) % 4],
                    words[(word_group_index + 3) % 4],
                );
            }
            run_four_rounds(&mut abef_state, &mut cdgh_state, words[word_group_index % 4], word_group_index);
        }
        abef_state = _mm_add_epi32(abef_state, abef_before_block);
        cdgh_state = _mm_add_epi32(cdgh_state, cdgh_before_block);
    }
    let feba_state = _mm_shuffle_epi32(abef_state, 0x1B);
    let dchg_state = _mm_shuffle_epi32(cdgh_state, 0xB1);
    let dcba_state = _mm_blend_epi16(feba_state, dchg_state, 0xF0);
    let hgfe_state = _mm_alignr_epi8(dchg_state, feba_state, 8);
    unsafe {
        _mm_storeu_si128(state[0..4].as_mut_ptr().cast(), dcba_state);
        _mm_storeu_si128(state[4..8].as_mut_ptr().cast(), hgfe_state);
    }
}
