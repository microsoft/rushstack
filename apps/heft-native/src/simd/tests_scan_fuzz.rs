use super::{scalar_scans, x86_64_avx2_scans, x86_64_sse2_scans};

type Scan = fn(&[u8], usize) -> usize;
type DetectedScan = fn(&[u8], usize) -> Option<usize>;

const SCANS: [(Scan, Scan, DetectedScan, Scan); 4] = [
    (
        scalar_scans::position_after_json_whitespace,
        x86_64_sse2_scans::position_after_json_whitespace,
        x86_64_avx2_scans::position_after_json_whitespace,
        super::position_after_json_whitespace,
    ),
    (
        scalar_scans::position_of_json_string_special_byte,
        x86_64_sse2_scans::position_of_json_string_special_byte,
        x86_64_avx2_scans::position_of_json_string_special_byte,
        super::position_of_json_string_special_byte,
    ),
    (
        scalar_scans::position_of_line_comment_end_or_separator_lead_byte,
        x86_64_sse2_scans::position_of_line_comment_end_or_separator_lead_byte,
        x86_64_avx2_scans::position_of_line_comment_end_or_separator_lead_byte,
        super::position_of_line_comment_end_or_separator_lead_byte,
    ),
    (
        scalar_scans::position_of_block_comment_star,
        x86_64_sse2_scans::position_of_block_comment_star,
        x86_64_avx2_scans::position_of_block_comment_star,
        super::position_of_block_comment_star,
    ),
];

const BYTE_DISTRIBUTIONS: [&[u8]; 5] = [
    b" \t\n\r",
    b" \t\n\r\"\\*/a",
    b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"",
    &[
        0x00, 0x1f, 0x20, 0x7f, 0x80, 0xa8, 0xa9, 0xe1, 0xe2, 0xe3, 0xff, b'"', b'\\', b'*', b'\n',
    ],
    &[
        b'a', b'a', b'a', b'a', b'a', b'a', b'a', 0xe2, 0x80, 0xa8, b' ', b' ', b' ', b'\r',
    ],
];

struct PseudoRandomNumbers {
    state: u64,
}

impl PseudoRandomNumbers {
    fn next_below(&mut self, bound: usize) -> usize {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        (self.state % bound as u64) as usize
    }
}

#[test]
#[ignore]
fn ten_million_random_scans_agree_with_the_scalar_twins() {
    let case_count: usize = std::env::var("A02_SCAN_FUZZ_CASES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(10_000_000);
    let mut numbers = PseudoRandomNumbers {
        state: 0x2545_f491_4f6c_dd1d,
    };
    let mut mismatches = 0;
    for case in 0..case_count {
        let distribution = BYTE_DISTRIBUTIONS[numbers.next_below(BYTE_DISTRIBUTIONS.len())];
        let length = numbers.next_below(300);
        let buffer: Box<[u8]> = (0..length)
            .map(|_| distribution[numbers.next_below(distribution.len())])
            .collect();
        let from = numbers.next_below(length + 3);
        let (scalar, sse2, avx2, dispatched) = SCANS[case % SCANS.len()];
        let expected = scalar(&buffer, from);
        let agrees = sse2(&buffer, from) == expected
            && avx2(&buffer, from).is_none_or(|position| position == expected)
            && dispatched(&buffer, from) == expected;
        if !agrees {
            mismatches += 1;
        }
    }
    println!("scan fuzz: {case_count} cases, {mismatches} mismatches");
    assert_eq!(mismatches, 0);
}
