use super::{scalar_scans, x86_64_avx2_scans, x86_64_sse2_scans};

type Scan = fn(&[u8], usize) -> usize;
type DetectedScan = fn(&[u8], usize) -> Option<usize>;

const SCAN_IMPLEMENTATIONS: [(&str, Scan, Scan, DetectedScan, Scan); 4] = [
    (
        "whitespace",
        scalar_scans::position_after_json_whitespace,
        x86_64_sse2_scans::position_after_json_whitespace,
        x86_64_avx2_scans::position_after_json_whitespace,
        super::position_after_json_whitespace,
    ),
    (
        "string special",
        scalar_scans::position_of_json_string_special_byte,
        x86_64_sse2_scans::position_of_json_string_special_byte,
        x86_64_avx2_scans::position_of_json_string_special_byte,
        super::position_of_json_string_special_byte,
    ),
    (
        "line comment end",
        scalar_scans::position_of_line_comment_end_or_separator_lead_byte,
        x86_64_sse2_scans::position_of_line_comment_end_or_separator_lead_byte,
        x86_64_avx2_scans::position_of_line_comment_end_or_separator_lead_byte,
        super::position_of_line_comment_end_or_separator_lead_byte,
    ),
    (
        "block comment star",
        scalar_scans::position_of_block_comment_star,
        x86_64_sse2_scans::position_of_block_comment_star,
        x86_64_avx2_scans::position_of_block_comment_star,
        super::position_of_block_comment_star,
    ),
];

const INTERESTING_BYTES: [u8; 24] = [
    b' ', b'\t', b'\n', b'\r', b'"', b'\\', b'*', b'/', 0x00, 0x08, 0x1f, 0x20, 0x21, b'a', 0x7f,
    0x80, 0xa8, 0xa9, 0xe1, 0xe2, 0xe3, 0xff, 0x0b, 0x0c,
];

struct PseudoRandomNumbers {
    state: u64,
}

impl PseudoRandomNumbers {
    fn next_below(&mut self, bound: usize) -> usize {
        self.state = self
            .state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((self.state >> 33) as usize) % bound
    }
}

fn buffer_with_runs_of_interesting_bytes(
    numbers: &mut PseudoRandomNumbers,
    length: usize,
) -> Vec<u8> {
    let mut buffer = Vec::with_capacity(length);
    while buffer.len() < length {
        let byte = INTERESTING_BYTES[numbers.next_below(INTERESTING_BYTES.len())];
        let run_length = (1 + numbers.next_below(70)).min(length - buffer.len());
        buffer.extend(std::iter::repeat_n(byte, run_length));
    }
    buffer
}

#[test]
fn simd_scans_find_the_same_position_as_the_scalar_scans_from_every_offset() {
    let mut numbers = PseudoRandomNumbers { state: 0x5eed };
    for length in (0..=140).chain([255, 256, 257, 1023, 4099]) {
        for _ in 0..8 {
            let buffer = buffer_with_runs_of_interesting_bytes(&mut numbers, length);
            let exact_size_buffer: Box<[u8]> = buffer.into_boxed_slice();
            for from in (0..=(length + 2).min(160)).chain([length.saturating_sub(33), length + 7]) {
                for (name, scalar, sse2, avx2, dispatched) in SCAN_IMPLEMENTATIONS {
                    let expected = scalar(&exact_size_buffer, from);
                    assert_eq!(
                        sse2(&exact_size_buffer, from),
                        expected,
                        "{name} sse2 {length} {from}"
                    );
                    if let Some(position) = avx2(&exact_size_buffer, from) {
                        assert_eq!(position, expected, "{name} avx2 {length} {from}");
                    }
                    assert_eq!(
                        dispatched(&exact_size_buffer, from),
                        expected,
                        "{name} {length} {from}"
                    );
                }
            }
        }
    }
}

#[test]
fn the_selected_level_follows_the_kill_switch_and_cpu_detection() {
    use super::x86_64_dispatch::{selected_level, LEVEL_AVX2, LEVEL_SCALAR, LEVEL_SSE2};
    let expected = if super::simd_is_disabled_by_environment() {
        LEVEL_SCALAR
    } else if std::arch::is_x86_feature_detected!("avx2") {
        LEVEL_AVX2
    } else {
        LEVEL_SSE2
    };
    println!(
        "selected simd level {} (1 scalar, 2 sse2, 3 avx2)",
        selected_level()
    );
    assert_eq!(selected_level(), expected);
}
