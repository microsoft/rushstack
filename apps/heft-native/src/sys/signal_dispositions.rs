use std::ffi::c_int;

const SIGNAL_BROKEN_PIPE: c_int = 13;
const SIGNAL_FILE_SIZE_LIMIT_EXCEEDED: c_int = 25;
const HIGHEST_STANDARD_SIGNAL: c_int = 31;
const DEFAULT_SIGNAL_DISPOSITION: usize = 0;
const IGNORED_SIGNAL_DISPOSITION: usize = 1;
const FAILED_SIGNAL_DISPOSITION_CHANGE: usize = usize::MAX;

extern "C" {
    fn signal(signal_number: c_int, handler: usize) -> usize;
}

pub fn reset_inherited_ignored_signals_like_node() {
    for signal_number in 1..=HIGHEST_STANDARD_SIGNAL {
        if signal_number == SIGNAL_BROKEN_PIPE {
            continue;
        }
        if signal_number == SIGNAL_FILE_SIZE_LIMIT_EXCEEDED {
            unsafe { signal(signal_number, IGNORED_SIGNAL_DISPOSITION) };
            continue;
        }
        let previous_disposition = unsafe { signal(signal_number, DEFAULT_SIGNAL_DISPOSITION) };
        let previous_disposition_was_a_handler = previous_disposition != IGNORED_SIGNAL_DISPOSITION
            && previous_disposition != DEFAULT_SIGNAL_DISPOSITION
            && previous_disposition != FAILED_SIGNAL_DISPOSITION_CHANGE;
        if previous_disposition_was_a_handler {
            unsafe { signal(signal_number, previous_disposition) };
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    const SIGNAL_USER_DEFINED_2: c_int = 12;

    fn ignored_signal_mask_of_this_process() -> u64 {
        let process_status = std::fs::read_to_string("/proc/self/status").unwrap();
        let ignored_mask_text = process_status
            .lines()
            .find_map(|status_line| status_line.strip_prefix("SigIgn:"))
            .unwrap();
        u64::from_str_radix(ignored_mask_text.trim(), 16).unwrap()
    }

    fn is_ignored(signal_number: c_int) -> bool {
        ignored_signal_mask_of_this_process() & (1u64 << (signal_number - 1)) != 0
    }

    #[test]
    fn inherited_ignored_signals_are_reset_except_broken_pipe_and_file_size_limit() {
        unsafe { signal(SIGNAL_USER_DEFINED_2, IGNORED_SIGNAL_DISPOSITION) };
        assert!(is_ignored(SIGNAL_USER_DEFINED_2));
        reset_inherited_ignored_signals_like_node();
        assert!(!is_ignored(SIGNAL_USER_DEFINED_2));
        assert!(is_ignored(SIGNAL_BROKEN_PIPE));
        assert!(is_ignored(SIGNAL_FILE_SIZE_LIMIT_EXCEEDED));
    }
}
