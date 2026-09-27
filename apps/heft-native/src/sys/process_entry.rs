use std::ffi::{c_char, c_int};

#[no_mangle]
pub extern "C" fn main(_argument_count: c_int, _arguments: *const *const c_char) -> c_int {
    #[cfg(unix)]
    super::reopen_closed_standard_streams_on_the_null_device();
    crate::run_heft_command_line()
}
