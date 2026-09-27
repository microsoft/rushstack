use std::sync::OnceLock;

mod scalar_scans;
#[cfg(all(test, target_arch = "x86_64"))]
mod tests_microbench;
#[cfg(all(test, target_arch = "x86_64"))]
mod tests_scan_equivalence;
#[cfg(all(test, target_arch = "x86_64"))]
mod tests_scan_fuzz;
#[cfg(target_arch = "x86_64")]
mod x86_64_avx2_scans;
#[cfg(target_arch = "x86_64")]
mod x86_64_dispatch;
#[cfg(target_arch = "x86_64")]
mod x86_64_sha256;
#[cfg(target_arch = "x86_64")]
mod x86_64_sse2_scans;
#[cfg(all(test, target_arch = "x86_64"))]
mod tests_sha256_equivalence;

#[cfg_attr(not(target_arch = "x86_64"), allow(dead_code))]
const SIMD_KILL_SWITCH_VARIABLE: &str = "HEFT_NATIVE_NO_SIMD";
#[cfg_attr(not(target_arch = "x86_64"), allow(dead_code))]
const SIMD_ENABLE_VARIABLE: &str = "HEFT_NATIVE_SIMD";

#[cfg_attr(not(target_arch = "x86_64"), allow(dead_code))]
pub fn simd_is_disabled_by_environment() -> bool {
    static SIMD_IS_DISABLED: OnceLock<bool> = OnceLock::new();
    *SIMD_IS_DISABLED.get_or_init(|| {
        std::env::var_os(SIMD_KILL_SWITCH_VARIABLE)
            .is_some_and(|value| !value.is_empty() && value != "0")
            || std::env::var_os(SIMD_ENABLE_VARIABLE).is_some_and(|value| value == "0")
    })
}

#[cfg(target_arch = "x86_64")]
use x86_64_dispatch as selected_scans;

#[cfg(not(target_arch = "x86_64"))]
use scalar_scans as selected_scans;

#[inline]
pub fn position_after_json_whitespace(bytes: &[u8], from: usize) -> usize {
    selected_scans::position_after_json_whitespace(bytes, from)
}

#[inline]
pub fn position_of_json_string_special_byte(bytes: &[u8], from: usize) -> usize {
    selected_scans::position_of_json_string_special_byte(bytes, from)
}

#[inline]
pub fn position_of_line_comment_end_or_separator_lead_byte(bytes: &[u8], from: usize) -> usize {
    selected_scans::position_of_line_comment_end_or_separator_lead_byte(bytes, from)
}

#[inline]
pub fn position_of_block_comment_star(bytes: &[u8], from: usize) -> usize {
    selected_scans::position_of_block_comment_star(bytes, from)
}

#[cfg(target_arch = "x86_64")]
pub use x86_64_sha256::compress_sha256_blocks_if_the_cpu_can;

#[cfg(not(target_arch = "x86_64"))]
pub fn compress_sha256_blocks_if_the_cpu_can(_state: &mut [u32; 8], _blocks: &[u8]) -> bool {
    false
}
