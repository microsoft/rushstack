#[cfg(test)]
pub mod allocation_counter;
#[cfg(test)]
mod tests_allocation_regressions;

#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
mod file_descriptor_flags;
#[cfg(unix)]
#[allow(unsafe_code)]
mod signal_dispositions;
#[cfg(unix)]
#[allow(unsafe_code)]
mod signals_and_identity;

#[cfg(target_os = "linux")]
pub use file_descriptor_flags::let_executed_program_inherit_file;
#[cfg(unix)]
pub use signal_dispositions::reset_inherited_ignored_signals_like_node;
#[cfg(unix)]
pub use signals_and_identity::{
    effective_user_id, forward_interrupt_and_termination_signals_to_warm_host,
    signal_forwarded_to_warm_host, terminate_by_signal,
};
