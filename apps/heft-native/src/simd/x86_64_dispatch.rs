#![allow(unsafe_code)]

use std::sync::atomic::{AtomicU8, Ordering};

use super::{scalar_scans, x86_64_avx2_scans, x86_64_sse2_scans};

const LEVEL_NOT_SELECTED_YET: u8 = 0;
pub(super) const LEVEL_SCALAR: u8 = 1;
pub(super) const LEVEL_SSE2: u8 = 2;
pub(super) const LEVEL_AVX2: u8 = 3;

static SELECTED_LEVEL: AtomicU8 = AtomicU8::new(LEVEL_NOT_SELECTED_YET);

#[cold]
#[inline(never)]
fn select_level_once() -> u8 {
    let level = if super::simd_is_disabled_by_environment() {
        LEVEL_SCALAR
    } else if std::arch::is_x86_feature_detected!("avx2") {
        LEVEL_AVX2
    } else {
        LEVEL_SSE2
    };
    SELECTED_LEVEL.store(level, Ordering::Relaxed);
    level
}

#[inline(always)]
pub(super) fn selected_level() -> u8 {
    match SELECTED_LEVEL.load(Ordering::Relaxed) {
        LEVEL_NOT_SELECTED_YET => select_level_once(),
        level => level,
    }
}

macro_rules! dispatch_scan {
    ($scan:ident, $stops_at:expr, $within_leading_chunks:ident, $scan_with_avx2:ident) => {
        #[inline(always)]
        pub(super) fn $scan(bytes: &[u8], from: usize) -> usize {
            let level = selected_level();
            if level == LEVEL_SCALAR {
                return scalar_scans::$scan(bytes, from);
            }
            match bytes.get(from) {
                Some(&byte) if !$stops_at(byte) => {}
                _ => return from,
            }
            match x86_64_sse2_scans::$within_leading_chunks(bytes, from + 1) {
                Ok(position) => position,
                Err(long_run_from) if level == LEVEL_AVX2 => unsafe {
                    x86_64_avx2_scans::$scan_with_avx2(bytes, long_run_from)
                },
                Err(long_run_from) => x86_64_sse2_scans::$scan(bytes, long_run_from),
            }
        }
    };
}

dispatch_scan!(
    position_after_json_whitespace,
    |byte| !scalar_scans::is_json_whitespace(byte),
    position_after_json_whitespace_within_leading_chunks,
    position_after_json_whitespace_with_avx2
);
dispatch_scan!(
    position_of_json_string_special_byte,
    scalar_scans::is_json_string_special_byte,
    position_of_json_string_special_byte_within_leading_chunks,
    position_of_json_string_special_byte_with_avx2
);
dispatch_scan!(
    position_of_line_comment_end_or_separator_lead_byte,
    scalar_scans::is_line_comment_end_or_separator_lead_byte,
    position_of_line_comment_end_or_separator_lead_byte_within_leading_chunks,
    position_of_line_comment_end_or_separator_lead_byte_with_avx2
);
dispatch_scan!(
    position_of_block_comment_star,
    |byte| byte == b'*',
    position_of_block_comment_star_within_leading_chunks,
    position_of_block_comment_star_with_avx2
);
