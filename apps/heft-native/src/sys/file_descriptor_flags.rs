use std::ffi::c_int;
use std::fs::File;
use std::os::fd::AsRawFd;

const F_GETFD: c_int = 1;
const F_SETFD: c_int = 2;
const FD_CLOEXEC: c_int = 1;

extern "C" {
    fn fcntl(file_descriptor: c_int, command: c_int, ...) -> c_int;
}

pub fn let_executed_program_inherit_file(file: &File) -> std::io::Result<c_int> {
    let file_descriptor = file.as_raw_fd();
    let descriptor_flags = unsafe { fcntl(file_descriptor, F_GETFD) };
    if descriptor_flags < 0 {
        return Err(std::io::Error::last_os_error());
    }
    if unsafe { fcntl(file_descriptor, F_SETFD, descriptor_flags & !FD_CLOEXEC) } < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(file_descriptor)
}
