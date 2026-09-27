#![allow(unsafe_code)]

use std::arch::x86_64::{
    __m128i, _mm_cmpeq_epi8, _mm_loadu_si128, _mm_max_epu8, _mm_movemask_epi8, _mm_or_si128,
    _mm_set1_epi8,
};

use super::scalar_scans;

const LANE_COUNT: usize = 16;
const LEADING_CHUNK_COUNT: usize = 4;
const ALL_LANES: u32 = 0xffff;
const _: () = assert!(cfg!(target_feature = "sse2"));

fn load_sixteen_bytes(chunk: &[u8; LANE_COUNT]) -> __m128i {
    unsafe { _mm_loadu_si128(chunk.as_ptr().cast()) }
}

fn lanes_equal_to(chunk: __m128i, byte: u8) -> __m128i {
    unsafe { _mm_cmpeq_epi8(chunk, _mm_set1_epi8(byte as i8)) }
}

fn lane_bits(lanes: __m128i) -> u32 {
    unsafe { _mm_movemask_epi8(lanes) as u32 }
}

fn either_lane(first: __m128i, second: __m128i) -> __m128i {
    unsafe { _mm_or_si128(first, second) }
}

fn lanes_at_most(chunk: __m128i, byte: u8) -> __m128i {
    unsafe {
        _mm_cmpeq_epi8(
            _mm_max_epu8(chunk, _mm_set1_epi8(byte as i8)),
            _mm_set1_epi8(byte as i8),
        )
    }
}

fn json_whitespace_lane_bits(chunk: __m128i) -> u32 {
    let space_or_tab = either_lane(lanes_equal_to(chunk, b' '), lanes_equal_to(chunk, b'\t'));
    let line_breaks = either_lane(lanes_equal_to(chunk, b'\n'), lanes_equal_to(chunk, b'\r'));
    lane_bits(either_lane(space_or_tab, line_breaks))
}

fn json_string_special_lane_bits(chunk: __m128i) -> u32 {
    let control = lanes_at_most(chunk, 0x1f);
    let quote_or_backslash = either_lane(lanes_equal_to(chunk, b'"'), lanes_equal_to(chunk, b'\\'));
    let separator_lead = lanes_equal_to(chunk, scalar_scans::SEPARATOR_LEAD_BYTE);
    lane_bits(either_lane(
        either_lane(control, quote_or_backslash),
        separator_lead,
    ))
}

fn line_comment_end_or_separator_lead_lane_bits(chunk: __m128i) -> u32 {
    let line_breaks = either_lane(lanes_equal_to(chunk, b'\n'), lanes_equal_to(chunk, b'\r'));
    let separator_lead = lanes_equal_to(chunk, scalar_scans::SEPARATOR_LEAD_BYTE);
    lane_bits(either_lane(line_breaks, separator_lead))
}

fn star_lane_bits(chunk: __m128i) -> u32 {
    lane_bits(lanes_equal_to(chunk, b'*'))
}

fn position_of_first_matching_lane(
    bytes: &[u8],
    from: usize,
    matching_lane_bits: impl Fn(__m128i) -> u32,
    scalar_scan: fn(&[u8], usize) -> usize,
) -> usize {
    let Some(rest) = bytes.get(from..) else {
        return from;
    };
    let (whole_chunks, _) = rest.as_chunks::<LANE_COUNT>();
    for (chunk_index, chunk) in whole_chunks.iter().enumerate() {
        let matching = matching_lane_bits(load_sixteen_bytes(chunk));
        if matching != 0 {
            return from + chunk_index * LANE_COUNT + matching.trailing_zeros() as usize;
        }
    }
    scalar_scan(bytes, from + whole_chunks.len() * LANE_COUNT)
}

#[inline(always)]
fn position_within_leading_chunks(
    bytes: &[u8],
    from: usize,
    matching_lane_bits: impl Fn(__m128i) -> u32,
    scalar_scan: fn(&[u8], usize) -> usize,
) -> Result<usize, usize> {
    let mut position = from;
    for _ in 0..LEADING_CHUNK_COUNT {
        let Some(chunk) = bytes
            .get(position..)
            .and_then(<[u8]>::first_chunk::<LANE_COUNT>)
        else {
            return Ok(scalar_scan(bytes, position));
        };
        let matching = matching_lane_bits(load_sixteen_bytes(chunk));
        if matching != 0 {
            return Ok(position + matching.trailing_zeros() as usize);
        }
        position += LANE_COUNT;
    }
    Err(position)
}

#[inline(always)]
pub(super) fn position_after_json_whitespace_within_leading_chunks(
    bytes: &[u8],
    from: usize,
) -> Result<usize, usize> {
    position_within_leading_chunks(
        bytes,
        from,
        |chunk| !json_whitespace_lane_bits(chunk) & ALL_LANES,
        scalar_scans::position_after_json_whitespace,
    )
}

#[inline(always)]
pub(super) fn position_of_json_string_special_byte_within_leading_chunks(
    bytes: &[u8],
    from: usize,
) -> Result<usize, usize> {
    position_within_leading_chunks(
        bytes,
        from,
        json_string_special_lane_bits,
        scalar_scans::position_of_json_string_special_byte,
    )
}

#[inline(always)]
pub(super) fn position_of_line_comment_end_or_separator_lead_byte_within_leading_chunks(
    bytes: &[u8],
    from: usize,
) -> Result<usize, usize> {
    position_within_leading_chunks(
        bytes,
        from,
        line_comment_end_or_separator_lead_lane_bits,
        scalar_scans::position_of_line_comment_end_or_separator_lead_byte,
    )
}

#[inline(always)]
pub(super) fn position_of_block_comment_star_within_leading_chunks(
    bytes: &[u8],
    from: usize,
) -> Result<usize, usize> {
    position_within_leading_chunks(
        bytes,
        from,
        star_lane_bits,
        scalar_scans::position_of_block_comment_star,
    )
}

pub(super) fn position_after_json_whitespace(bytes: &[u8], from: usize) -> usize {
    position_of_first_matching_lane(
        bytes,
        from,
        |chunk| !json_whitespace_lane_bits(chunk) & ALL_LANES,
        scalar_scans::position_after_json_whitespace,
    )
}

pub(super) fn position_of_json_string_special_byte(bytes: &[u8], from: usize) -> usize {
    position_of_first_matching_lane(
        bytes,
        from,
        json_string_special_lane_bits,
        scalar_scans::position_of_json_string_special_byte,
    )
}

pub(super) fn position_of_line_comment_end_or_separator_lead_byte(
    bytes: &[u8],
    from: usize,
) -> usize {
    position_of_first_matching_lane(
        bytes,
        from,
        line_comment_end_or_separator_lead_lane_bits,
        scalar_scans::position_of_line_comment_end_or_separator_lead_byte,
    )
}

pub(super) fn position_of_block_comment_star(bytes: &[u8], from: usize) -> usize {
    position_of_first_matching_lane(
        bytes,
        from,
        star_lane_bits,
        scalar_scans::position_of_block_comment_star,
    )
}
