#![allow(unsafe_code)]

use std::arch::x86_64::{
    __m256i, _mm256_cmpeq_epi8, _mm256_loadu_si256, _mm256_max_epu8, _mm256_movemask_epi8,
    _mm256_or_si256, _mm256_set1_epi8,
};

use super::scalar_scans::SEPARATOR_LEAD_BYTE;
use super::x86_64_sse2_scans;

const LANE_COUNT: usize = 32;

#[target_feature(enable = "avx2")]
fn load_thirty_two_bytes(chunk: &[u8; LANE_COUNT]) -> __m256i {
    unsafe { _mm256_loadu_si256(chunk.as_ptr().cast()) }
}

#[target_feature(enable = "avx2")]
fn lanes_equal_to(chunk: __m256i, byte: u8) -> __m256i {
    _mm256_cmpeq_epi8(chunk, _mm256_set1_epi8(byte as i8))
}

#[target_feature(enable = "avx2")]
fn lane_bits(lanes: __m256i) -> u32 {
    _mm256_movemask_epi8(lanes) as u32
}

#[target_feature(enable = "avx2")]
fn non_json_whitespace_lane_bits(chunk: __m256i) -> u32 {
    let space_or_tab = _mm256_or_si256(lanes_equal_to(chunk, b' '), lanes_equal_to(chunk, b'\t'));
    let line_breaks = _mm256_or_si256(lanes_equal_to(chunk, b'\n'), lanes_equal_to(chunk, b'\r'));
    !lane_bits(_mm256_or_si256(space_or_tab, line_breaks))
}

#[target_feature(enable = "avx2")]
fn json_string_special_lane_bits(chunk: __m256i) -> u32 {
    let highest_control = _mm256_set1_epi8(0x1f);
    let control = _mm256_cmpeq_epi8(_mm256_max_epu8(chunk, highest_control), highest_control);
    let quote_or_backslash =
        _mm256_or_si256(lanes_equal_to(chunk, b'"'), lanes_equal_to(chunk, b'\\'));
    let separator_lead = lanes_equal_to(chunk, SEPARATOR_LEAD_BYTE);
    lane_bits(_mm256_or_si256(
        _mm256_or_si256(control, quote_or_backslash),
        separator_lead,
    ))
}

#[target_feature(enable = "avx2")]
fn line_comment_end_or_separator_lead_lane_bits(chunk: __m256i) -> u32 {
    let line_breaks = _mm256_or_si256(lanes_equal_to(chunk, b'\n'), lanes_equal_to(chunk, b'\r'));
    lane_bits(_mm256_or_si256(
        line_breaks,
        lanes_equal_to(chunk, SEPARATOR_LEAD_BYTE),
    ))
}

#[target_feature(enable = "avx2")]
fn star_lane_bits(chunk: __m256i) -> u32 {
    lane_bits(lanes_equal_to(chunk, b'*'))
}

macro_rules! scan_with_avx2_then_sse2 {
    ($scan:ident, $scan_with_avx2:ident, $matching_lane_bits:ident) => {
        #[target_feature(enable = "avx2")]
        pub(super) fn $scan_with_avx2(bytes: &[u8], from: usize) -> usize {
            let Some(rest) = bytes.get(from..) else {
                return from;
            };
            let (whole_chunks, _) = rest.as_chunks::<LANE_COUNT>();
            for (chunk_index, chunk) in whole_chunks.iter().enumerate() {
                let matching = $matching_lane_bits(load_thirty_two_bytes(chunk));
                if matching != 0 {
                    return from + chunk_index * LANE_COUNT + matching.trailing_zeros() as usize;
                }
            }
            x86_64_sse2_scans::$scan(bytes, from + whole_chunks.len() * LANE_COUNT)
        }

        #[cfg(test)]
        pub(super) fn $scan(bytes: &[u8], from: usize) -> Option<usize> {
            if !std::arch::is_x86_feature_detected!("avx2") {
                return None;
            }
            Some(unsafe { $scan_with_avx2(bytes, from) })
        }
    };
}

scan_with_avx2_then_sse2!(
    position_after_json_whitespace,
    position_after_json_whitespace_with_avx2,
    non_json_whitespace_lane_bits
);
scan_with_avx2_then_sse2!(
    position_of_json_string_special_byte,
    position_of_json_string_special_byte_with_avx2,
    json_string_special_lane_bits
);
scan_with_avx2_then_sse2!(
    position_of_line_comment_end_or_separator_lead_byte,
    position_of_line_comment_end_or_separator_lead_byte_with_avx2,
    line_comment_end_or_separator_lead_lane_bits
);
scan_with_avx2_then_sse2!(
    position_of_block_comment_star,
    position_of_block_comment_star_with_avx2,
    star_lane_bits
);
