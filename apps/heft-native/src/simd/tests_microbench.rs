#![allow(unsafe_code)]

use std::time::Instant;

use super::{scalar_scans, x86_64_avx2_scans, x86_64_sse2_scans};

type Scan = fn(&[u8], usize) -> usize;

const BUFFER_LENGTH: usize = 1 << 20;
const MATCH_DISTANCES: [usize; 9] = [1, 2, 4, 8, 16, 32, 64, 256, 4096];

fn buffer_with_star_every(distance: usize) -> Vec<u8> {
    (0..BUFFER_LENGTH)
        .map(|index| {
            if (index + 1) % distance == 0 {
                b'*'
            } else {
                b'a'
            }
        })
        .collect()
}

fn avx2_block_comment_star_scan(bytes: &[u8], from: usize) -> usize {
    x86_64_avx2_scans::position_of_block_comment_star(bytes, from).unwrap_or(usize::MAX)
}

fn timestamp_counter() -> u64 {
    unsafe { std::arch::x86_64::_rdtsc() }
}

fn nanoseconds_and_ticks_per_hop(scan: Scan, bytes: &[u8]) -> (f64, f64, usize) {
    let mut best = (f64::MAX, f64::MAX);
    let mut hops = 0;
    for _ in 0..7 {
        hops = 0;
        let started = Instant::now();
        let started_ticks = timestamp_counter();
        let mut position = 0;
        while position < bytes.len() {
            position = std::hint::black_box(scan(std::hint::black_box(bytes), position)) + 1;
            hops += 1;
        }
        let ticks = (timestamp_counter() - started_ticks) as f64;
        let nanoseconds = started.elapsed().as_nanos() as f64;
        if nanoseconds < best.0 {
            best = (nanoseconds, ticks);
        }
    }
    (best.0 / hops as f64, best.1 / hops as f64, hops)
}

#[test]
#[ignore]
fn microbenchmark_scans_by_match_distance() {
    let dispatched: Scan = super::position_of_block_comment_star;
    let implementations: [(&str, Scan); 4] = [
        ("scalar", scalar_scans::position_of_block_comment_star),
        ("sse2", x86_64_sse2_scans::position_of_block_comment_star),
        ("avx2", avx2_block_comment_star_scan),
        ("dispatched", dispatched),
    ];
    for distance in MATCH_DISTANCES {
        let bytes = buffer_with_star_every(distance);
        let mut line = format!("distance {distance:5}:");
        let mut scalar_nanoseconds = 0.0;
        for (name, scan) in implementations {
            let (nanoseconds, ticks, _) = nanoseconds_and_ticks_per_hop(scan, &bytes);
            if name == "scalar" {
                scalar_nanoseconds = nanoseconds;
            }
            line.push_str(&format!(
                "  {name} {nanoseconds:8.2} ns/hop {:6.2} B/tick x{:5.2}",
                distance as f64 / ticks,
                scalar_nanoseconds / nanoseconds
            ));
        }
        println!("{line}");
    }
}
