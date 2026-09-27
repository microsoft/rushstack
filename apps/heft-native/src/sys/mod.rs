#[cfg(test)]
pub mod allocation_counter;
#[cfg(test)]
mod tests_allocation_regressions;

#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
mod file_descriptor_flags;
#[cfg(not(test))]
#[allow(unsafe_code)]
mod process_entry;
#[cfg(unix)]
#[allow(unsafe_code)]
mod signal_dispositions;
#[cfg(unix)]
#[allow(unsafe_code)]
mod signals_and_identity;
#[cfg(all(unix, not(test)))]
#[allow(unsafe_code)]
mod standard_streams;
#[cfg(not(target_os = "linux"))]
mod no_worker_processes;
#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
mod worker_processes;

#[cfg(target_os = "linux")]
pub use file_descriptor_flags::let_executed_program_inherit_file;
#[cfg(unix)]
pub use signal_dispositions::reset_inherited_ignored_signals_like_node;
#[cfg(unix)]
pub use signals_and_identity::{
    effective_user_id, forward_interrupt_and_termination_signals_to_warm_host,
    signal_forwarded_to_warm_host, terminate_by_signal,
};
#[cfg(all(unix, not(test)))]
pub use standard_streams::reopen_closed_standard_streams_on_the_null_device;
#[cfg(not(target_os = "linux"))]
pub use no_worker_processes::{
    exit_worker_process_immediately, fork_worker_process_of_this_single_threaded_process, wait_for_worker_process,
    ForkedWorker,
};
#[cfg(target_os = "linux")]
pub use worker_processes::{
    exit_worker_process_immediately, fork_worker_process_of_this_single_threaded_process, wait_for_worker_process,
    ForkedWorker,
};
